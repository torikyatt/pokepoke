// 口語検索エンジン（SPEC 4）。実行時にLLMは使わず、辞書マッチとスコアリングだけで完結する。
//   1. 数値パターン（コスト・HP・ダメージ・にげる）を正規表現で先に抜く
//   2. カード名 → 表現辞書の順に最長一致でタグ・タイプ・種別などに変換する
//   3. どこにも当たらなかった区間は全文検索語として残す
// タイプ・種別・数値は「ハード条件」（満たさないカードは除外）、タグは「ソフト条件」（一致の重みで並べる）。
import { normalize } from "./normalize.ts";
import type { AppCard, AppData, AppEffect, CardGroup, CardKind, EnergyType, LexEntry, LexTarget, Rule, Stage } from "../types.ts";
import { GROUP_JA, KIND_JA, STAGE_JA, TYPE_JA } from "../types.ts";

type Op = "eq" | "ge" | "le";
export type Cond = { id: string; label: string; weight?: number } & (
  | { kind: "tag"; tag: string }
  | { kind: "type"; type: EnergyType }
  | { kind: "cardKind"; value: CardKind | "trainer" }
  | { kind: "stage"; value: Stage | "evolved" }
  | { kind: "rule"; value: Rule | "any_ex" | "not_ex" }
  | { kind: "group"; value: CardGroup }
  | { kind: "slot"; value: "attack" | "ability" }
  | { kind: "variable" }
  | { kind: "cost"; type: EnergyType; n: number }
  | { kind: "costTyped"; n: number }
  | { kind: "costTotal"; op: Op; n: number }
  | { kind: "damage"; op: Op; n: number }
  | { kind: "hp"; op: Op; n: number }
  | { kind: "retreat"; op: Op; n: number }
  | { kind: "weakness"; type: EnergyType }
  | { kind: "name"; name: string }
  | { kind: "text"; term: string }
);

export interface Hit {
  card: AppCard;
  score: number;
  matched: string[]; // 一致した条件のID
  effects: string[]; // 一致したワザ・特性の名前
}

const OP_JA: Record<Op, string> = { eq: "", ge: "以上", le: "以下" };
const opOf = (s: string | undefined): Op => (!s ? "eq" : /以上|超/.test(s) ? "ge" : "le");
const cmp = (v: number | undefined, op: Op, n: number) => v !== undefined && (op === "eq" ? v === n : op === "ge" ? v >= n : v <= n);

// 数値パターンで使うタイプ名（正規化後）
const TYPE_WORD: [string, EnergyType][] = [
  ["無色", "colorless"], ["むしよく", "colorless"], ["草", "grass"], ["くさ", "grass"], ["炎", "fire"], ["ほのお", "fire"], ["火", "fire"],
  ["水", "water"], ["みず", "water"], ["雷", "lightning"], ["かみなり", "lightning"], ["でんき", "lightning"], ["電気", "lightning"],
  ["超", "psychic"], ["えすぱ", "psychic"], ["闘", "fighting"], ["格闘", "fighting"], ["かくとう", "fighting"],
  ["悪", "darkness"], ["あく", "darkness"], ["鋼", "metal"], ["はがね", "metal"], ["どらごん", "dragon"],
];
const TYPE_RE = TYPE_WORD.map(([w]) => w).sort((a, b) => b.length - a.length).join("|");
const typeOf = (w: string) => TYPE_WORD.find(([x]) => x === w)![1];
const CMP = "(以上|以下|まで|以内|未満|超え|超)?";

// 検索文から外す言葉（全文検索語に残しても意味がない）
const FILLER = /^(によつて|よつて|について|の|が|を|に|で|と|は|も|や|へ|な|だ|から|まで|して|する|できる|される|いる|ある|いい|よい|系|やつ|もの|こと|かんじ|感じ|よう|ような|ように|ようにする|ほしい|欲しい|さがして|探して|おしえて|教えて|ください|かど|ぽけもん|ひつよう|必要|えねが|えねは|でいい|強い|つよい|一覧|全部)+|(の|が|を|に|で|と|は|も|や|へ|な|だ|する|できる|いい|系|やつ|もの|かど|かんじ|よう|ような|ように|ようにする|でいい)+$/g;

export function createEngine(data: AppData) {
  const tagJa = new Map(data.tags.map((t) => [t.id, t.ja]));
  // 表現辞書（正規化済み表現 → 項目）
  const lex = new Map<string, LexEntry[]>();
  let maxLen = 0;
  for (const e of data.lexicon) {
    const n = normalize(e.expr).replace(/ /g, "");
    if (!n) continue;
    (lex.get(n) ?? lex.set(n, []).get(n)!).push(e);
    maxLen = Math.max(maxLen, n.length);
  }
  // カード名（正規化）。3文字以上だけ（短い名前は他の言葉に紛れる）
  const names = [...new Set(data.cards.map((c) => normalize(c.nameJa).replace(/ /g, "")))].filter((n) => n.length >= 3).sort((a, b) => b.length - a.length);
  // 全文検索用の文（カードごと）
  const haystack = new Map<string, { ja: string; en: string; name: string }>();
  for (const c of data.cards) {
    const effs = effectsOf(c);
    haystack.set(c.id, {
      ja: normalize([c.nameJa, ...effs.flatMap((e) => [e.nameJa ?? "", e.textJa ?? ""])].join(" ")).replace(/ /g, ""),
      en: [c.nameEn, ...effs.flatMap((e) => [e.nameEn ?? "", e.textEn ?? ""])].join(" ").toLowerCase(),
      name: normalize(c.nameJa).replace(/ /g, ""),
    });
  }

  function condOf(t: LexTarget, weight: number, span: string): Cond {
    if ("tag" in t) return { id: `tag:${t.tag}`, kind: "tag", tag: t.tag, label: tagJa.get(t.tag) ?? t.tag, weight };
    if ("type" in t) return { id: `type:${t.type}`, kind: "type", type: t.type, label: `${TYPE_JA[t.type]}タイプ` };
    if ("kind" in t) return { id: `kind:${t.kind}`, kind: "cardKind", value: t.kind, label: t.kind === "trainer" ? "トレーナーズ" : KIND_JA[t.kind] };
    if ("stage" in t) return { id: `stage:${t.stage}`, kind: "stage", value: t.stage, label: t.stage === "evolved" ? "進化ポケモン" : STAGE_JA[t.stage] };
    if ("rule" in t) {
      const label = { any_ex: "ex", mega_ex: "メガシンカex", not_ex: "ex以外", ex: "ex", normal: "ex以外" }[t.rule];
      return { id: `rule:${t.rule}`, kind: "rule", value: t.rule, label };
    }
    if ("group" in t) return { id: `group:${t.group}`, kind: "group", value: t.group, label: GROUP_JA[t.group] };
    if ("slot" in t) return { id: `slot:${t.slot}`, kind: "slot", value: t.slot, label: t.slot === "attack" ? "ワザ" : "特性" };
    return { id: "variable", kind: "variable", label: `火力が変わる（${span}）`, weight };
  }

  /** 検索文を条件に分解する */
  function parse(query: string): Cond[] {
    const conds: Cond[] = [];
    const add = (c: Cond) => {
      const same = conds.find((x) => x.id === c.id);
      if (!same) conds.push(c);
      else if ((c.weight ?? 0) > (same.weight ?? 0)) same.weight = c.weight;
    };
    let q = normalize(query);

    // 1. 数値パターン
    const take = (re: RegExp, f: (m: RegExpExecArray) => void) => {
      q = q.replace(re, (...args) => {
        f(args.slice(0, -2) as unknown as RegExpExecArray);
        return " ";
      });
    };
    take(new RegExp(`(?:にげる|逃げる|にげ|逃げ)(?:ための)?(?:えね|こすと|えねるぎ)?(?:が|は)?(\\d+)(?:個|こ|つ)?${CMP}`, "g"), (m) => {
      const op = opOf(m[2]);
      add({ id: `retreat:${op}${m[1]}`, kind: "retreat", op, n: +m[1], label: `にげる${m[1]}${OP_JA[op]}` });
    });
    take(new RegExp(`(?:hp|体力)(?:が|は)?(\\d+)${CMP}|(\\d+)hp${CMP}`, "g"), (m) => {
      const n = +(m[1] ?? m[3]);
      const op = opOf(m[2] ?? m[4]);
      add({ id: `hp:${op}${n}`, kind: "hp", op, n, label: `HP${n}${OP_JA[op]}` });
    });
    take(new RegExp(`(\\d+)(?:だめじ|だめ|点)${CMP}|(?:火力|打点|だめじ)(?:が|は)?(\\d+)${CMP}`, "g"), (m) => {
      const n = +(m[1] ?? m[3]);
      const op = opOf(m[2] ?? m[4]) === "eq" ? "ge" : opOf(m[2] ?? m[4]);
      add({ id: `damage:${op}${n}`, kind: "damage", op, n, label: `${n}ダメージ${OP_JA[op]}` });
    });
    take(new RegExp(`弱点(?:が|は)?(${TYPE_RE})`, "g"), (m) => {
      const t = typeOf(m[1]);
      add({ id: `weakness:${t}`, kind: "weakness", type: t, label: `弱点${TYPE_JA[t]}` });
    });
    let typedSum = 0;
    let typedSeen = false;
    take(new RegExp(`(${TYPE_RE})(?:えね)?(?:が|を)?(\\d+)(?:個|こ|つ|枚)?`, "g"), (m) => {
      const t = typeOf(m[1]);
      if (t !== "colorless") {
        typedSum += +m[2];
        typedSeen = true;
      }
      add({ id: `cost:${t}${m[2]}`, kind: "cost", type: t, n: +m[2], label: `${TYPE_JA[t]}エネ${m[2]}` });
    });
    take(/(?:あとは|あと|残りは|残り|のこりは|ほかは|他は)無色/g, () => {
      add({ id: "costTyped", kind: "costTyped", n: typedSum, label: typedSeen ? "残りは無色" : "無色だけ" });
    });
    take(/(?:どのえねでも|どんなえねでも|なんのえねでも|無色だけ|無色のみ|無色えねだけ)/g, () => {
      add({ id: "costTyped", kind: "costTyped", n: 0, label: "無色エネだけで使える" });
    });
    take(new RegExp(`(?:えね|こすと)(\\d+)(?:個|こ|つ)?${CMP}|(\\d+)(?:個|こ|つ)?(?:の)?えね(?:で|が)?${CMP}`, "g"), (m) => {
      const n = +(m[1] ?? m[3]);
      const raw = m[2] ?? m[4];
      const op: Op = !raw ? "le" : opOf(raw);
      add({ id: `costTotal:${op}${n}`, kind: "costTotal", op, n, label: `合計${n}エネ${OP_JA[op] || "以下"}` });
    });

    // 2. カード名 → 表現辞書（最長一致）
    const segments = q.split(" ").filter(Boolean);
    const rest: string[] = [];
    for (let seg of segments) {
      for (const n of names) {
        if (seg.includes(n)) {
          add({ id: `name:${n}`, kind: "name", name: n, label: `名前「${n}」`, weight: 3 });
          seg = seg.split(n).join(" ");
        }
      }
      for (const part of seg.split(" ").filter(Boolean)) {
        let i = 0;
        let buf = "";
        while (i < part.length) {
          let hit: string | undefined;
          for (let len = Math.min(maxLen, part.length - i); len >= 1; len--) {
            const sub = part.slice(i, i + len);
            if (lex.has(sub)) {
              hit = sub;
              break;
            }
          }
          if (!hit) {
            buf += part[i++];
            continue;
          }
          if (buf) rest.push(buf);
          buf = "";
          for (const e of lex.get(hit)!) add(condOf(e.target, e.weight, hit));
          i += hit.length;
        }
        if (buf) rest.push(buf);
      }
    }

    // 3. 残りは全文検索語に
    for (const r of rest) {
      const term = r.replace(FILLER, "");
      if (term.length >= 2) add({ id: `text:${term}`, kind: "text", term, label: `「${term}」を含む`, weight: 0.4 });
    }
    return conds;
  }

  /** 条件でカードを絞り込み、並べる */
  function run(conds: Cond[], limit = 50): Hit[] {
    const of = <K extends Cond["kind"]>(k: K) => conds.filter((c): c is Extract<Cond, { kind: K }> => c.kind === k);
    const types = of("type"), kinds = of("cardKind"), stages = of("stage"), rules = of("rule"), groups = of("group");
    const slot = of("slot")[0]?.value;
    const atk = { cost: of("cost"), costTyped: of("costTyped"), costTotal: of("costTotal"), damage: of("damage") };
    const atkConds = [...atk.cost, ...atk.costTyped, ...atk.costTotal, ...atk.damage];
    const nums = [...of("hp"), ...of("retreat")];
    const weak = of("weakness");
    const soft = conds.filter((c) => c.kind === "tag" || c.kind === "variable");
    const texts = of("text"), nameConds = of("name");

    const hits: Hit[] = [];
    for (const card of data.cards) {
      // ハード条件（同じ種類の条件どうしは OR）
      if (types.length && !types.some((t) => card.type === t.type || card.typeRefs.includes(t.type))) continue;
      if (kinds.length && !kinds.some((k) => (k.value === "trainer" ? card.kind !== "pokemon" : card.kind === k.value))) continue;
      if (stages.length && !stages.some((s) => (s.value === "evolved" ? card.stage === "stage1" || card.stage === "stage2" : card.stage === s.value))) continue;
      if (rules.length && !rules.some((r) => ruleOk(card, r.value))) continue;
      if (groups.length && !groups.some((g) => card.groups.includes(g.value))) continue;
      if (weak.length && !weak.some((w) => card.weakness === w.type)) continue;
      if (!nums.every((c) => cmp(c.kind === "hp" ? card.hp : card.retreat, c.op, c.n))) continue;
      if (slot === "ability" && !card.ability) continue;
      if (slot === "attack" && !card.attacks.length) continue;
      const okAttacks = atkConds.length ? card.attacks.filter((a) => atkConds.every((c) => attackOk(a, c))) : card.attacks;
      if (atkConds.length && !okAttacks.length) continue;

      // ソフト条件: ワザ・特性ごとに数え、同じワザ内でそろうと加点
      const effects = effectsOf(card).filter((e) => !slot || e.slot === slot || (e.slot === "text" && slot === "attack" && card.kind !== "pokemon"));
      const matched = new Set<string>();
      const effectNames = new Set<string>();
      let score = 0;
      const best = new Map<string, number>();
      for (const e of effects) {
        let local = 0;
        let count = 0;
        for (const c of soft) {
          const w = softScore(e, c);
          if (!w) continue;
          local += w;
          count++;
          best.set(c.id, Math.max(best.get(c.id) ?? 0, w));
        }
        if (count && atkConds.length && e.slot === "attack" && okAttacks.includes(e as never)) count++;
        if (count >= 2) score += 0.5 * (count - 1);
        if (count) effectNames.add(e.nameJa ?? e.nameEn ?? "効果");
        void local;
      }
      for (const [id, w] of best) {
        score += w;
        matched.add(id);
      }
      if (soft.length && !best.size && !nameConds.length && !texts.length) continue;

      const h = haystack.get(card.id)!;
      for (const n of nameConds) {
        if (h.name.includes(n.name)) {
          score += n.weight ?? 3;
          matched.add(n.id);
        }
      }
      for (const t of texts) {
        if (h.ja.includes(t.term)) score += 0.4;
        else if (h.en.includes(t.term)) score += 0.2;
        else continue;
        matched.add(t.id);
      }
      // ソフト条件・名前・全文のどれかを指定したのに、何も当たらなければ除外
      if ((soft.length || nameConds.length || texts.length) && !matched.size) continue;
      for (const c of conds) if (!["tag", "variable", "name", "text"].includes(c.kind)) matched.add(c.id);
      if (atkConds.length) for (const a of okAttacks) effectNames.add(a.nameJa ?? a.nameEn ?? "");
      hits.push({ card, score, matched: [...matched], effects: [...effectNames].filter(Boolean) });
    }
    hits.sort((a, b) => b.score - a.score || order(a.card) - order(b.card));
    return hits.slice(0, limit);
  }

  return { parse, run, search: (q: string, limit?: number) => run(parse(q), limit), tagJa };
}

export type Engine = ReturnType<typeof createEngine>;

export function effectsOf(c: AppCard): AppEffect[] {
  return [...(c.ability ? [c.ability] : []), ...c.attacks, ...(c.text ? [c.text] : [])];
}

function ruleOk(card: AppCard, r: Rule | "any_ex" | "not_ex") {
  if (r === "any_ex") return card.rule !== "normal";
  if (r === "not_ex") return card.kind === "pokemon" && card.rule === "normal";
  return card.rule === r;
}

function attackOk(a: AppCard["attacks"][number], c: Cond): boolean {
  switch (c.kind) {
    case "cost": return (a.cost[c.type] ?? 0) === c.n;
    case "costTyped": return a.costTyped === c.n;
    case "costTotal": return cmp(a.costTotal, c.op, c.n);
    case "damage": return cmp(a.damage, c.op, c.n);
    default: return true;
  }
}

// タグは親タグ指定で子タグも一致（ただし重みを下げる）
function softScore(e: AppEffect, c: Cond): number {
  const w = c.weight ?? 1;
  if (c.kind === "variable") return "damageVariable" in e && (e as { damageVariable: boolean }).damageVariable ? w : 0;
  if (c.kind !== "tag") return 0;
  if (e.tags.includes(c.tag)) return w;
  if (e.tags.some((t) => t.startsWith(c.tag + "."))) return w * 0.7;
  return 0;
}

// 同点のときの並び: ポケモン → トレーナーズ、収録順
const KIND_ORDER: Record<CardKind, number> = { pokemon: 0, supporter: 1, item: 2, tool: 3, stadium: 4, fossil: 5 };
const order = (c: AppCard) => KIND_ORDER[c.kind] * 1e5 + (c.prints.length ? 0 : 0);
