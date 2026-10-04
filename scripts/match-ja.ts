// Game8の日本語カードを英語データのカードに結びつけ、公式日本語を付ける。
// 入力: data/cards.base.json, data/names-ja.json, data/game8/{cards,moves}.json, data/overrides.json（任意）
// 出力: data/cards.json            日本語を付けたカード（以降の工程はこれを読む）
//       data/game8/match.json      カードID → 照合に使ったGame8のIDと方法
//       data/game8/unmatched.json  照合できなかったもの・複数候補に当たったもの（レビュー用）
//
// 照合の順番（SPEC 3.5）
//   1. 収録パック＋カード番号。Game8側に入力ミス（HP違い・番号ずれ・カードの取り違え）があるので名前で裏を取る
//   2. 日本語ポケモン名＋ワザのコスト・ダメージの並び（HPはGame8の誤記が多いので同点時の決め手にだけ使う）
//   3. トレーナーズは1でほぼ全部決まる。残りは一覧に出して手動で確定する（overrides.json の matchJa）
//
// ワザ・特性はGame8で「ポケモン名＋初出パック」ごとの行になっている。同じパックに同名の別カードがあったり、
// ワザ/特性の種別・並び順・ex の有無に入力の揺れがあるので、まとまりごとではなく英語のワザ1つずつに
// 「コスト・ダメージ・ex の有無・初出パック」で点数を付けて一番合う行を選ぶ。
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { G8Card, G8Move } from "./lib/game8.ts";
import type { Card, CardKind, Effect, EnergyType } from "./lib/types.ts";

const DATA = join(import.meta.dirname, "../data");
const read = (p: string) => JSON.parse(readFileSync(join(DATA, p), "utf8"));
const cards: Card[] = read("cards.base.json");
const namesJa: Record<string, string> = read("names-ja.json");
const g8Cards: G8Card[] = read("game8/cards.json");
const g8Moves: G8Move[] = read("game8/moves.json");
// overrides.json の matchJa: { "プリントID": Game8のg8Id }。照合の誤り・取りこぼしを手で確定する
const overrides: { matchJa?: Record<string, number> } = existsSync(join(DATA, "overrides.json")) ? read("overrides.json") : {};

// ---- 正規化 ----

const norm = (s: string) => s.normalize("NFKC").replace(/\s+/g, "").replace(/[()]/g, (c) => (c === "(" ? "（" : "）"));
const noParen = (s: string) => norm(s).replace(/（[^）]*）/g, "");
const isEx = (s: string) => /ex$/.test(noParen(s));
// フォルム・性別などの括弧と ex を外した素の名前
const bare = (s: string) => noParen(s).replace(/ex$/, "");
// 「いちげきウーラオス」と「ウーラオス（いちげきのかた）」のような表記揺れは包含で吸収する
const bareCompat = (a: string, b: string) => {
  const [x, y] = [bare(a), bare(b)];
  return !!x && !!y && (x === y || x.includes(y) || y.includes(x));
};
const nameCompat = (a: string, b: string) => bareCompat(a, b) && isEx(a) === isEx(b);
// 句読点や空白だけの違い（Game8の入力揺れ）は同じ文とみなす
const textKey = (s: string) => norm(s).replace(/[、。,.・「」]/g, "");

const G8_SET: Record<string, string> = { pa: "PROMO-A", pb: "PROMO-B" };
const g8SetOf = (pdSet: string) => G8_SET[pdSet] ?? pdSet.charAt(0).toUpperCase() + pdSet.slice(1);
const printNumber = (printId: string) => Number(printId.split("-").pop());

const JA_COST: Record<string, EnergyType> = {
  草: "grass", 炎: "fire", 水: "water", 雷: "lightning", 超: "psychic",
  闘: "fighting", 悪: "darkness", 鋼: "metal", 無色: "colorless", 無: "colorless",
};
const TRAINER_KIND: Record<string, CardKind> = {
  サポート: "supporter", グッズ: "item", "グッズ（化石）": "fossil", "グッズ(化石)": "fossil",
  ポケモンのどうぐ: "tool", スタジアム: "stadium",
};

// ---- 索引 ----

const g8BySetNo = new Map<string, G8Card[]>();
const g8ById = new Map<number, G8Card>();
const g8ByBare = new Map<string, G8Card[]>();
const push = <K, V>(m: Map<K, V[]>, k: K, v: V) => (m.get(k) ?? m.set(k, []).get(k)!).push(v);
for (const c of g8Cards) {
  push(g8BySetNo, `${c.set}#${c.number}`, c);
  push(g8ByBare, bare(c.name), c);
  g8ById.set(c.g8Id, c);
}
// ワザ行は持ち主の収録パックで引く（同名の別カードの行を拾わないよう、自分の収録パック以外は見ない）
const movesBySet = new Map<string, G8Move[]>();
for (const m of g8Moves) if (m.pokemon) push(movesBySet, m.set, m);

// ---- 照合 ----

type Method = "set-number" | "name-structure" | "override";
type Fit = "exact" | "cost-only" | "damage-only";
interface MatchInfo { g8: number[]; method?: Method; moves: { g8Id: number; fit?: Fit }[] }
const match: Record<string, MatchInfo> = {};
const unmatched: { id: string; nameEn: string; nameJa?: string; reason: string }[] = [];
const ambiguous: { id: string; nameEn: string; reason: string; candidates: string[] }[] = [];
const usedG8 = new Set<number>();

const kindOk = (card: Card, c: G8Card) => {
  const isTrainer = c.category !== "ポケモン" || !!c.trainerType;
  if (card.kind === "pokemon") return !isTrainer;
  if (!isTrainer) return false;
  const k = c.trainerType ? TRAINER_KIND[c.trainerType] : undefined;
  // Game8は化石を「グッズ」とだけ書くことがある
  return !k || k === card.kind || (k === "item" && card.kind === "fossil");
};

function printCandidates(card: Card): { cands: G8Card[]; method: Method } {
  const out: G8Card[] = [];
  let method: Method = "set-number";
  for (const p of card.prints) {
    const ov = overrides.matchJa?.[p.id];
    if (ov !== undefined) {
      const c = g8ById.get(ov);
      if (!c) throw new Error(`overrides.json: Game8 ID ${ov} が見つからない (${p.id})`);
      out.push(c);
      method = "override";
      continue;
    }
    for (const c of g8BySetNo.get(`${g8SetOf(p.set)}#${printNumber(p.id)}`) ?? []) {
      if (!kindOk(card, c)) continue;
      if (card.kind === "pokemon" && !nameCompat(c.name, namesJa[card.nameEn] ?? card.nameEn)) continue;
      out.push(c);
    }
  }
  return { cands: out, method };
}

// 同数なら先に出てきたもの（＝早い収録のプリント）を採る
function mostCommon<T>(xs: T[]): T | undefined {
  const n = new Map<T, number>();
  for (const x of xs) n.set(x, (n.get(x) ?? 0) + 1);
  return [...n].sort((a, b) => b[1] - a[1])[0]?.[0];
}

const costKey = (cost: Partial<Record<EnergyType, number>>) =>
  Object.entries(cost).flatMap(([t, n]) => Array(n).fill(t)).sort().join(",");
// Game8はコスト0のワザを「特殊」と書く
const g8CostKey = (m: G8Move) => m.cost.filter((c) => c !== "特殊").map((c) => JA_COST[c] ?? `?${c}`).sort().join(",");
const g8Damage = (m: G8Move) => (m.damage?.match(/^\d+/) ? Number(m.damage.match(/^\d+/)![0]) : undefined);
const isAbilityRow = (m: G8Move) => !m.cost.length && g8Damage(m) === undefined;

interface Ctx { names: string[]; ex: boolean; home: string; printSets: Set<string> }

// どの行を選ぶかの点数。名前・パックは手がかり、コスト・ダメージは中身の一致
function contextScore(m: G8Move, ctx: Ctx): number {
  let s = 0;
  if (isEx(m.pokemon) === ctx.ex) s += 3;
  if (ctx.names.includes(norm(m.pokemon))) s += 1;
  // 再録は初出パックの行を共有するので、初出パックの行を最優先
  if (m.set === ctx.home) s += 6;
  else if (ctx.printSets.has(m.set)) s += 3;
  return s;
}

// 効果文の手がかり（10以上の数値と、無色以外のタイプ）。英日で同じなら同じ効果とみなす同点時の決め手
const EN_TYPE: Record<string, string> = {
  G: "草", R: "炎", W: "水", L: "雷", P: "超", F: "闘", D: "悪", M: "鋼",
  Grass: "草", Fire: "炎", Water: "水", Lightning: "雷", Psychic: "超", Fighting: "闘", Darkness: "悪", Metal: "鋼",
};
const fingerprint = (nums: string[], types: string[]) =>
  [nums.map(Number).filter((n) => n >= 10).sort((a, b) => a - b).join(","), [...new Set(types)].sort().join("")].join("|");
const enPrint = (s: string) =>
  fingerprint(s.match(/\d+/g) ?? [], [...s.matchAll(/\[\s*([GRWLPFDM])\s*\]|\b(Grass|Fire|Water|Lightning|Psychic|Fighting|Darkness|Metal)\b/g)].map((m) => EN_TYPE[m[1] ?? m[2]]));
const jaPrint = (s: string) => fingerprint(norm(s).match(/\d+/g) ?? [], norm(s).match(/[草炎水雷超闘悪鋼](?=タイプ|エネ|ポケモン|と|の2)/g) ?? []);
const textBonus = (en: string, m: G8Move) => (en && m.text && enPrint(en) === jaPrint(m.text) ? 2 : 0);

function pick<T>(scored: { m: G8Move; score: number; fit?: Fit }[], card: Card, what: string) {
  scored.sort((a, b) => b.score - a.score || a.m.g8Id - b.m.g8Id);
  const best = scored[0];
  if (!best) return undefined;
  const ties = scored.filter((x) => x.score === best.score && textKey(`${x.m.name}|${x.m.text ?? ""}`) !== textKey(`${best.m.name}|${best.m.text ?? ""}`));
  if (ties.length) {
    ambiguous.push({
      id: card.id, nameEn: card.nameEn, reason: `${what}の候補が複数あり、中身が違う`,
      candidates: [best, ...ties].map((x) => `${x.m.pokemon}#${x.m.set}「${x.m.name}」${x.m.text ?? ""}`),
    });
  }
  return best;
}

function setJa(e: Effect, m: G8Move) {
  e.nameJa = m.name;
  if (m.text) e.textJa = m.text;
  e.jaSource = "official";
}

function resolvePokemon(card: Card): void {
  let { cands, method } = printCandidates(card);
  const nameGuess = namesJa[card.nameEn];

  // 2. 収録パック＋番号で当たらなければ、名前で候補を広げる（HPが合うものを優先）
  if (!cands.length && nameGuess) {
    const byName = (g8ByBare.get(bare(nameGuess)) ?? []).filter((c) => kindOk(card, c) && nameCompat(c.name, nameGuess));
    const byHp = byName.filter((c) => c.hp === card.hp);
    cands = byHp.length ? byHp : byName;
    method = "name-structure";
  }
  const info: MatchInfo = { g8: cands.map((c) => c.g8Id), method: cands.length ? method : undefined, moves: [] };
  match[card.id] = info;
  for (const c of cands) usedG8.add(c.g8Id);

  const names = [...new Set([...cands.map((c) => norm(c.name)), ...(nameGuess ? [norm(nameGuess)] : [])])];
  const ctx: Ctx = {
    names,
    ex: isEx(names[0] ?? card.nameEn),
    // 再録は初出パックのワザ行を共有するので、最も早いプリントのパックを「本籍」とする
    home: g8SetOf(card.prints[0].set),
    printSets: new Set(card.prints.map((p) => g8SetOf(p.set))),
  };
  // 自分の収録パックの行（＋Game8でパック欄が空の行）のうち、名前が合うもの。
  // 「れんげきウーラオス」「オーガポンみどりのめん」のような表記揺れは括弧を外した包含で拾う
  const flat = (s: string) => norm(s).replace(/[（）]/g, "");
  const pool = [...ctx.printSets, ""]
    .flatMap((s) => movesBySet.get(s) ?? [])
    .filter((m) => names.some((n) => bareCompat(n, m.pokemon) || flat(m.pokemon).includes(bare(n)) || flat(n).includes(bare(m.pokemon))));

  const missing: string[] = [];
  if (card.ability) {
    const best = pick(pool.filter(isAbilityRow).map((m) => ({ m, score: contextScore(m, ctx) + (m.kind === "ability" ? 1 : 0) + textBonus(card.ability!.textEn, m) })), card, "特性");
    if (best) {
      setJa(card.ability, best.m);
      info.moves.push({ g8Id: best.m.g8Id });
    } else missing.push(`特性「${card.ability.nameEn}」`);
  }
  card.attacks.forEach((a, i) => {
    const scored = pool
      .filter((m) => !isAbilityRow(m) || !costKey(a.cost))
      .map((m) => {
        const cost = costKey(a.cost) === g8CostKey(m);
        // 英語データは「×」「＋」のワザや、ベンチ狙いのワザ（"does 10 damage to 1 of …"）でダメージを空にしている
        const g8dmg = g8Damage(m) ?? 0;
        const dmg =
          (a.damage ?? 0) === g8dmg ||
          (a.damage === undefined && (a.damageVariable || (g8dmg > 0 && a.textEn.includes(`${g8dmg} damage`))));
        const ctxScore = contextScore(m, ctx) + textBonus(a.textEn, m);
        // コストが違うなら、0でないダメージが合っていて、かつ自分の収録パックの行に限る（コスト誤記の救済）
        if (!cost && !(dmg && g8dmg > 0 && ctxScore >= 7)) return undefined;
        const fit: Fit = cost && dmg ? "exact" : cost ? "cost-only" : "damage-only";
        return { m, fit, score: (cost ? 8 : 0) + (dmg ? 4 : 0) + ctxScore + (m.index === i + 1 + (card.ability ? 1 : 0) || m.index === i + 1 ? 1 : 0) };
      })
      .filter((x) => x !== undefined);
    const best = pick(scored, card, `ワザ${i + 1}`);
    if (best) {
      setJa(a, best.m);
      info.moves.push({ g8Id: best.m.g8Id, fit: best.fit });
    } else missing.push(`ワザ「${a.nameEn}」`);
  });

  // 名前: Game8のカード名（多数決）→ ワザ行の持ち主の名前 → PokeAPI由来の名前
  const moveOwner = info.moves.length ? g8Moves.find((m) => m.g8Id === info.moves[0].g8Id)?.pokemon : undefined;
  card.nameJa = mostCommon(cands.map((c) => norm(c.name))) ?? (moveOwner ? norm(moveOwner) : undefined) ?? (nameGuess ? norm(nameGuess) : undefined);

  if (!cands.length && !info.moves.length) unmatched.push({ id: card.id, nameEn: card.nameEn, nameJa: card.nameJa, reason: "Game8に該当カードが見つからない" });
  else if (missing.length) unmatched.push({ id: card.id, nameEn: card.nameEn, nameJa: card.nameJa, reason: `Game8に合う行が無い: ${missing.join("、")}` });
}

function resolveTrainer(card: Card): void {
  const { cands, method } = printCandidates(card);
  match[card.id] = { g8: cands.map((c) => c.g8Id), method: cands.length ? method : undefined, moves: [] };
  for (const c of cands) usedG8.add(c.g8Id);
  const withText = cands.filter((c) => c.text);
  const name = mostCommon(cands.map((c) => norm(c.name)));
  const text = withText.find((c) => textKey(c.text!) === mostCommon(withText.map((c) => textKey(c.text!))))?.text;
  if (name) card.nameJa = name;
  if (text && card.text) {
    card.text.textJa = text;
    card.text.jaSource = "official";
  }
  // 収録違いで食い違うときは多数決。票が割れたら（＝どれが正しいか決められない）レビューに回す
  const split = (xs: string[]) => {
    const n = [...new Set(xs)].map((x) => xs.filter((y) => y === x).length).sort((a, b) => b - a);
    return n.length > 1 && n[0] === n[1];
  };
  if (split(cands.map((c) => norm(c.name))) || split(withText.map((c) => textKey(c.text!)))) {
    ambiguous.push({
      id: card.id, nameEn: card.nameEn, reason: "収録違いで名前か効果文が食い違い、多数決で決まらない（早い収録を仮採用）",
      candidates: [...new Set(cands.map((c) => `${c.title}: ${c.text ?? ""}`))],
    });
  }
  if (!name || !text) {
    unmatched.push({ id: card.id, nameEn: card.nameEn, nameJa: name, reason: name ? "効果文が取れない" : "Game8に該当カードが見つからない" });
  }
}

for (const card of cards) {
  if (card.kind === "pokemon") resolvePokemon(card);
  else resolveTrainer(card);
}

// ---- 出力 ----

// 英語カードに結びつかなかったGame8カード。英語データ未収録の弾（B4b）や、Game8側の番号ずれ
const unusedG8 = g8Cards.filter((c) => !usedG8.has(c.g8Id));
const unusedBySet = new Map<string, number>();
for (const c of unusedG8) unusedBySet.set(c.set, (unusedBySet.get(c.set) ?? 0) + 1);

writeFileSync(join(DATA, "cards.json"), JSON.stringify(cards, null, 1));
writeFileSync(join(DATA, "game8/match.json"), JSON.stringify(match, null, 1));
writeFileSync(
  join(DATA, "game8/unmatched.json"),
  JSON.stringify({ unmatched, ambiguous, g8NotLinked: unusedG8.map((c) => ({ g8Id: c.g8Id, title: c.title })) }, null, 1),
);

const isOfficial = (c: Card) => !!c.nameJa && [c.ability, ...c.attacks, c.text].every((e) => !e || e.jaSource === "official");
const official = cards.filter(isOfficial).length;
const methods = new Map<string, number>();
for (const m of Object.values(match)) methods.set(m.method ?? "なし", (methods.get(m.method ?? "なし") ?? 0) + 1);
const fits = new Map<string, number>();
for (const m of Object.values(match)) for (const x of m.moves) if (x.fit) fits.set(x.fit, (fits.get(x.fit) ?? 0) + 1);

console.log(`カード ${cards.length} 種 / 公式日本語が全部そろった ${official} 種 (${((official / cards.length) * 100).toFixed(1)}%)`);
console.log(`照合方法: ${[...methods].map(([k, n]) => `${k} ${n}`).join(" / ")}`);
console.log(`ワザの一致: ${[...fits].map(([k, n]) => `${k} ${n}`).join(" / ")}（exact 以外はGame8か英語データのどちらかに誤記）`);
console.log(`照合できない・欠けあり ${unmatched.length} / 複数候補 ${ambiguous.length} → data/game8/unmatched.json`);
console.log(`英語カードに結びつかないGame8カード ${unusedG8.length} 枚: ${[...unusedBySet].map(([k, n]) => `${k}:${n}`).join(" ")}`);
