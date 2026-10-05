// アプリに埋め込むデータを作る。
// 入力: data/cards.json, data/tags.json, data/taxonomy.yaml, data/lexicon/*.json
// 出力: src/data/app-data.json（生成物。コミットしない）
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { load as loadYaml } from "js-yaml";
import { jaImageIndex } from "./lib/game8.ts";
import { basePrint, orderedPrints } from "./lib/prints.ts";
import { requireInfoOf, selectorOf } from "./lib/targets.ts";
import { loadTaxonomy } from "./lib/taxonomy.ts";
import { createReader, hasKanji } from "./lib/reading.ts";
import { jaImageFile } from "./lib/ja-images.ts";
import { enImageFile, enImageRemote } from "../src/en-images.ts";
import type { Card, Effect } from "./lib/types.ts";
import type { G8Card } from "./lib/game8.ts";
import type { AppArchetype, AppAttack, AppCard, AppCombo, AppData, AppHelp, AppMeta, HelpTarget, AppEffect, AppPrint, AppSet, EnergyType, LexEntry, Selector, Slot } from "../src/types.ts";

const ROOT = join(import.meta.dirname, "..");
const DATA = join(ROOT, "data");
const cards: Card[] = JSON.parse(readFileSync(join(DATA, "cards.json"), "utf8"));
const tags: Record<string, { ability?: string[]; attacks: string[][]; text?: string[]; refs: string[]; slotRefs?: Record<string, string[]> }> = JSON.parse(
  readFileSync(join(DATA, "tags.json"), "utf8"),
);
const tax = loadTaxonomy(DATA);
const lexDir = join(DATA, "lexicon");
const lexicon: LexEntry[] = existsSync(lexDir)
  ? readdirSync(lexDir).filter((f) => f.endsWith(".json")).flatMap((f) => JSON.parse(readFileSync(join(lexDir, f), "utf8")))
  : [];

const CODE: Record<string, EnergyType> = {
  G: "grass", R: "fire", W: "water", L: "lightning", P: "psychic", F: "fighting", D: "darkness", M: "metal", N: "dragon",
};
const byId = new Map(cards.map((c) => [c.id, c]));
// タグ → 供給（親タグの供給も受け継ぐ）／要求（そのタグ自身のものだけ）
const taxById = new Map(tax.map((x) => [x.id, x]));
const suppliesOfTag = (id: string) => {
  const out: string[] = [];
  for (let x = taxById.get(id); x; x = x.parent ? taxById.get(x.parent) : undefined) out.push(...(x.supplies ?? []));
  return out;
};
const requiresOfTag = (id: string) => taxById.get(id)?.requires ?? [];
const jaImageOf = jaImageIndex(DATA);

// 収録の日本語（Game8 の収録パック名・入手方法）。照合済みのプリントだけ使う
const g8All: G8Card[] = JSON.parse(readFileSync(join(DATA, "game8/cards.json"), "utf8"));
const g8Match: Record<string, { g8: number[] }> = JSON.parse(readFileSync(join(DATA, "game8/match.json"), "utf8"));
const g8ById = new Map(g8All.map((c) => [c.g8Id, c]));
const g8SetOf = (s: string) => ({ pa: "PROMO-A", pb: "PROMO-B" } as Record<string, string>)[s] ?? s.charAt(0).toUpperCase() + s.slice(1);
// 収録パックの日本語名: Game8 の収録パック名（「最強の遺伝子ピカチュウ」など）の共通の頭の部分
const packNames = new Map<string, Map<string, number>>();
for (const c of g8All) {
  if (!c.pack || c.pack === "-") continue;
  const m = packNames.get(c.set) ?? packNames.set(c.set, new Map()).get(c.set)!;
  m.set(c.pack, (m.get(c.pack) ?? 0) + 1);
}
const commonPrefix = (a: string, b: string) => {
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  return a.slice(0, i);
};
function setJaOf(code: string): string {
  const g8code = ({ pa: "PROMO-A", pb: "PROMO-B" } as Record<string, string>)[code] ?? code.charAt(0).toUpperCase() + code.slice(1);
  const top = [...(packNames.get(g8code) ?? [])].sort((a, b) => b[1] - a[1]).map(([n]) => n);
  if (g8code.startsWith("PROMO") || !top.length) return g8code.replace("PROMO", "プロモ");
  return top.length > 1 && commonPrefix(top[0], top[1]).length >= 3 ? commonPrefix(top[0], top[1]) : top[0];
}
// ベビーポケモン: Game8 の分類「ベビー」か、たね・にげる0・ワザのエネがすべて0のポケモン
function isBaby(c: Card): boolean {
  if (c.kind !== "pokemon") return false;
  if ((g8Match[c.id]?.g8 ?? []).some((id) => g8ById.get(id)?.group === "ベビー")) return true;
  return c.stage === "basic" && c.retreat === 0 && c.attacks.length > 0 && c.attacks.every((a) => a.costTotal === 0);
}

// 日本語のカード画像: 自前で置いた画像（public/cards-ja/。scripts/images-ja.ts が Game8 から取ってくる）があればそれを使う。
// まだ取っていないものは元の URL のまま（取得の途中でも表示は壊れない）
const jaImageUrls = new Set<string>();
function jaLocal(url: string): string {
  jaImageUrls.add(url);
  const f = jaImageFile(url);
  return existsSync(join(ROOT, "public", f)) ? f : url;
}

// 英語のカード画像: 自前で置いた画像（public/cards-en/。scripts/images-en.ts が PocketDecks から取ってくる）があればそれを使う
const enLocal = (printId: string) => (existsSync(join(ROOT, "public", enImageFile(printId))) ? enImageFile(printId) : enImageRemote(printId));
let enLocalCount = 0;

function printOf(c: Card, p: Card["prints"][number]): AppPrint {
  const out: AppPrint = { id: p.id, set: p.set, setName: p.setName, rarity: p.rarity };
  // 英語画像は収録IDから場所が決まるので、まだ自前で置いていないものだけ元の URL を持たせる
  if (enLocal(p.id) === enImageFile(p.id)) enLocalCount++;
  else out.imageEn = enImageRemote(p.id);
  const g = (g8Match[c.id]?.g8 ?? []).map((id) => g8ById.get(id)).find((x) => x && x.set === g8SetOf(p.set) && x.number === Number(p.id.split("-").pop()));
  if (!g) return out;
  if (g.image) out.imageJa = jaLocal(g.image);
  const setJa = setJaOf(p.set);
  if (g.pack && g.pack !== "-") {
    const sub = g.pack.startsWith(setJa) ? g.pack.slice(setJa.length) : g.pack === setJa ? "" : g.pack;
    if (sub) out.pack = sub;
  }
  if (g.acquire && g.acquire !== "パック") out.how = g.howTo || g.acquire;
  return out;
}

function effect(e: Effect, slot: Slot, t: string[] | undefined): AppEffect {
  const out: AppEffect = { slot, tags: t ?? [] };
  if (e.nameJa) out.nameJa = e.nameJa;
  if (e.nameEn) out.nameEn = e.nameEn;
  if (e.textJa) out.textJa = e.textJa;
  if (e.textEn) out.textEn = e.textEn;
  if (e.jaSource === "machine") out.machine = true;
  return out;
}

const out: AppCard[] = cards.map((c) => {
  const ct = tags[c.id] ?? { attacks: [], refs: [] };
  const attacks: AppAttack[] = c.attacks.map((a, i) => ({
    ...effect(a, "attack", ct.attacks[i]),
    cost: a.cost, costTotal: a.costTotal, costTyped: a.costTyped,
    ...(a.damage !== undefined ? { damage: a.damage } : {}),
    damageVariable: a.damageVariable,
  }));
  const ability = c.ability ? effect(c.ability, "ability", ct.ability) : undefined;
  const text = c.text ? effect(c.text, "text", ct.text) : undefined;

  // トレーナーズ・どうぐが名指ししているタイプ（[R] 表記と、名指しされたポケモンのタイプ）。全タイプ列挙は除く
  const typeRefs = new Set<EnergyType>();
  if (c.kind !== "pokemon" && c.text?.textEn) {
    for (const m of c.text.textEn.matchAll(/\[\s*([GRWLPFDMN])\s*\]/g)) typeRefs.add(CODE[m[1]]);
    for (const id of ct.refs) {
      const r = byId.get(id);
      if (r?.type && r.type !== "colorless") typeRefs.add(r.type);
    }
  }
  // エネ加速するワザ・特性・効果が付けるエネのタイプ（シナジー「特定タイプのエネ加速 ↔ そのタイプの重いワザ」用）
  const accelTypes = new Set<EnergyType>();
  const slots: [Effect | undefined, string[] | undefined][] = [[c.ability, ct.ability], ...c.attacks.map((a, i) => [a, ct.attacks[i]] as [Effect, string[]]), [c.text, ct.text]];
  for (const [e, t] of slots) {
    if (!e?.textEn || !t?.some((x) => x.startsWith("energy.accel"))) continue;
    const ts = [...e.textEn.matchAll(/\[\s*([GRWLPFDMCN])\s*\]/g)].map((m) => (m[1] === "C" ? "colorless" : CODE[m[1]]));
    if (new Set(ts).size < 5) for (const x of ts) accelTypes.add(x as EnergyType);
  }
  // シナジー: 効果ごとに供給・要求を集め、供給には「誰に効くか」を付ける
  const supplies: Record<string, Selector[]> = {};
  const requires: Record<string, { etypes?: EnergyType[] }> = {};
  const slotted: [string, Effect | undefined, string[] | undefined][] = [["ability", c.ability, ct.ability], ...c.attacks.map((a, i) => [`attack${i}`, a, ct.attacks[i]] as [string, Effect, string[]]), ["text", c.text, ct.text]];
  for (const [slot, e, ts] of slotted) {
    if (!e?.textEn || !ts) continue;
    for (const s of new Set(ts.flatMap(suppliesOfTag))) {
      const sel = selectorOf(s, e.textEn, ct.slotRefs?.[slot] ?? []);
      if (slot === "ability" || c.kind === "stadium" || c.kind === "tool") sel.repeat = true;
      (supplies[s] ??= []).push(sel);
    }
    for (const r of new Set(ts.flatMap(requiresOfTag))) {
      const info = requireInfoOf(r, e.textEn);
      const cur = requires[r];
      requires[r] = cur && !(cur.etypes && info.etypes) ? {} : { ...(info.etypes || cur?.etypes ? { etypes: [...new Set([...(cur?.etypes ?? []), ...(info.etypes ?? [])])] } : {}) };
    }
  }
  // 場にエネをためる特性（毎ターン自分にエネを付ける。レアコイルのボルトチャージなど）
  // 進化したときだけ・最初の番だけのものは含めない
  const ab = c.ability?.textEn ?? "";
  if (c.ability && ct.ability?.includes("energy.accel.zone") && /^Once during your turn, you may take/.test(ab.trim()) && (supplies["supply.energy.many"] ?? []).some((s) => s.self)) {
    const et = [...ab.matchAll(/\[\s*([GRWLPFDMN])\s*\]/g)].map((m) => CODE[m[1]]);
    supplies["supply.energy.bank"] = [{ etypes: [...new Set(et)] }];
  }
  // コインを投げるワザ・効果がある → コインをやり直せるカード（ビクティニ・イツキ…）と相性がいい
  if ([...(ct.ability ?? []), ...ct.attacks.flat(), ...(ct.text ?? [])].some((x) => x.startsWith("coin.") && x !== "coin.control")) requires["supply.coin.control"] = {};
  // カードそのものの性質から決まる要求
  if (c.kind === "pokemon" && (c.retreat ?? 0) >= 3) requires["supply.retreat.help"] = {};
  // ワザに2種類以上のタイプのエネが要る（ドラゴンなど）→ エネ事故を減らすカードと相性がいい
  if (c.attacks.some((a) => Object.keys(a.cost).filter((t) => t !== "colorless").length >= 2)) requires["supply.energy.fix"] = {};
  if (c.stage === "stage1" || c.stage === "stage2") requires["supply.evolve.help"] = {};
  // どのポケモンも「山札から持ってこられる」側になれる（結ぶのは、持ってくる側の条件が絞られているときだけ: synergy.ts）
  if (c.kind === "pokemon") requires["supply.search.pokemon"] = {};
  const card: AppCard = {
    id: c.id,
    nameJa: c.nameJa ?? c.nameEn,
    nameEn: c.nameEn,
    kind: c.kind,
    typeRefs: typeRefs.size >= 5 ? [] : [...typeRefs],
    accelTypes: [...accelTypes],
    rule: c.rule,
    groups: [...c.groups, ...(isBaby(c) ? (["baby"] as const) : [])],
    evolvesFrom: c.evolvesFrom,
    evolvesTo: c.evolvesTo,
    attacks,
    // 絵柄は「いちばん基本のもの」を先頭に（一覧・詳細・サムネイルはこれ）
    prints: orderedPrints(c.prints).map((p) => printOf(c, p)),
    image: enLocal(basePrint(c.prints).id),
    ...(jaImageOf(c) ? { imageJa: jaLocal(jaImageOf(c)!) } : {}),
    ...(existsSync(join(ROOT, "public/thumbs-ja", `${c.id}.webp`)) ? { jaThumb: true as const } : {}),
    order: Math.min(...c.prints.map((p) => p.builderNr ?? 99999)),
    released: c.prints.map((p) => p.released ?? "9999").sort()[0],
    rarities: [...new Set(c.prints.map((p) => p.rarity))],
    sets: [...new Set(c.prints.map((p) => p.set))],
    maxDamage: Math.max(0, ...c.attacks.map((a) => a.damage ?? 0)),
    ...(c.attacks.length ? { minCost: Math.min(...c.attacks.map((a) => a.costTotal)) } : {}),
    tags: [...new Set([...(ability?.tags ?? []), ...attacks.flatMap((a) => a.tags), ...(text?.tags ?? [])])].sort(),
    refs: ct.refs,
    supplies,
    requires,
  };
  if (c.nameJaMachine) card.nameMachine = true;
  if (c.type) card.type = c.type;
  if (c.stage) card.stage = c.stage;
  if (c.points !== undefined) card.points = c.points;
  if (c.hp !== undefined) card.hp = c.hp;
  if (c.weakness) card.weakness = c.weakness;
  if (c.retreat !== undefined) card.retreat = c.retreat;
  if (ability) card.ability = ability;
  if (text) card.text = text;
  return card;
});

const setMap = new Map<string, AppSet>();
for (const c of cards) {
  for (const p of c.prints) {
    const cur = setMap.get(p.set);
    if (!cur) setMap.set(p.set, { code: p.set, name: p.setName, nameJa: setJaOf(p.set), released: p.released ?? "" });
    else if (p.released && (!cur.released || p.released < cur.released)) cur.released = p.released;
  }
}

// ---- 大会データ（data/meta/meta.json）と攻略記事の組み合わせ（data/combos.yaml） ----

const outById = new Map(out.map((c) => [c.id, c]));
type RawMeta = Omit<AppMeta, "archetypes"> & { archetypes: (Omit<AppArchetype, "nameJa" | "keys" | "nameEn"> & { name: string })[] };
const metaFile = join(DATA, "meta/meta.json");
const rawMeta: RawMeta | undefined = existsSync(metaFile) ? JSON.parse(readFileSync(metaFile, "utf8")) : undefined;
let meta: AppMeta | undefined;
/** デッキ名（英語）に出てくるカード名を、そのデッキのカードの中から探して日本語のデッキ名にする */
function archName(name: string, candidates: string[]): { nameJa: string; keys: string[] } {
  const lower = name.toLowerCase();
  const keys = candidates
    .map((id) => outById.get(id)!)
    .filter((c) => c && lower.includes(c.nameEn.toLowerCase()))
    .map((c) => ({ c, at: lower.indexOf(c.nameEn.toLowerCase()), len: c.nameEn.length }))
    // 「Lucario」は「Mega Lucario ex」の一部でもあるので、長い名前に含まれる短い名前は、別の場所にも出てくるときだけ数える
    .filter((k, _, all) => !all.some((o) => o !== k && o.len > k.len && o.c.nameEn.toLowerCase().includes(k.c.nameEn.toLowerCase()) && lower.split(k.c.nameEn.toLowerCase()).length - 1 <= 1))
    .sort((x, y) => x.at - y.at);
  const uniq = [...new Map(keys.map((k) => [k.c.nameEn, k.c])).values()];
  return { nameJa: uniq.length ? uniq.map((c) => c.nameJa).join("＆") : name, keys: uniq.map((c) => c.id) };
}
if (rawMeta) {
  const archetypes = rawMeta.archetypes.map((a): AppArchetype => {
    const named = archName(a.name, a.cards.filter((x) => x.rate >= 0.3).map((x) => x.id));
    return {
      id: a.id,
      nameEn: a.name,
      nameJa: named.nameJa,
      keys: named.keys,
      share: a.share,
      decks: a.decks,
      cards: a.cards.filter((x) => outById.has(x.id)).map((x) => ({ id: x.id, rate: x.rate })),
    };
  });
  meta = { fetchedAt: rawMeta.fetchedAt, days: rawMeta.days, tournaments: rawMeta.tournaments, decks: rawMeta.decks, usage: rawMeta.usage, archetypes, pairs: rawMeta.pairs };
  console.log(`大会データ: デッキ ${rawMeta.decks} 件 / アーキタイプ ${archetypes.length} 件 / 組 ${rawMeta.pairs.length} 件`);
}

const combosFile = join(DATA, "combos.yaml");
const combos: AppCombo[] = [];
if (existsSync(combosFile)) {
  const usage = meta?.usage ?? {};
  const resolve = (ref: string): string => {
    if (/^[a-z0-9]+-\d{3}$/.test(ref)) {
      if (!outById.has(ref)) throw new Error(`combos.yaml: カードIDが無い: ${ref}`);
      return ref;
    }
    const [name, set] = ref.split("@");
    const cs = out.filter((c) => c.nameJa === name && (!set || c.sets.includes(set) || c.id.startsWith(`${set}-`)));
    if (!cs.length) throw new Error(`combos.yaml: カードが見つからない: ${ref}`);
    // 同じ名前が複数あれば、大会でいちばん使われているもの
    return cs.sort((a, b) => (usage[b.id] ?? 0) - (usage[a.id] ?? 0) || a.order - b.order)[0].id;
  };
  const doc = loadYaml(readFileSync(combosFile, "utf8")) as { deck: string; deckEn: string; source: string; combos: { cards: string[]; hub?: string; reason: string; reasonEn: string }[] }[];
  for (const d of doc)
    for (const c of d.combos) {
      if (!c.reasonEn || !d.deckEn) throw new Error(`combos.yaml: 英語の説明が無い: ${d.deck} ${c.cards}`);
      const base = { reason: c.reason, reasonEn: c.reasonEn, deck: d.deck, deckEn: d.deckEn, source: d.source };
      // hub: 中心のカードが、残りのカードとそれぞれ組む（残りどうしは関係ない。例: ルチアがリーシャンもコイルも持ってこられる）
      if (c.hub) {
        if (!c.cards.includes(c.hub)) throw new Error(`combos.yaml: hub が cards に無い: ${c.hub}`);
        for (const other of c.cards.filter((x) => x !== c.hub)) combos.push({ cards: [resolve(c.hub), resolve(other)], ...base });
      } else combos.push({ cards: c.cards.map(resolve), ...base });
    }
  console.log(`攻略記事の組み合わせ: ${combos.length} 件`);
}

// 大会のデッキリスト（data/meta/decks.json）→ src/data/decks.json（カード詳細の「このカードを使ったデッキ」用。必要になってから読み込む）
const decksFile = join(DATA, "meta/decks.json");
if (existsSync(decksFile)) {
  type RawDeck = [number, string, string, number, number, number, number, string, string, number];
  const raw = JSON.parse(readFileSync(decksFile, "utf8")) as { fetchedAt: string; tournaments: [string, string, number][]; decks: RawDeck[] };
  const archNames = new Map((meta?.archetypes ?? []).map((a) => [a.id, a.nameJa]));
  const archs: string[][] = []; // [ID, 日本語名, 英語名]
  const archIndex = new Map<string, number>();
  const decks: (string | number)[][] = [];
  let dropped = 0;
  for (const [t, archId, archEn, place, w, l, ties, energy, cardsStr, dup] of raw.decks) {
    const ids = cardsStr.split(" ").map((x) => x.split("*")[0]);
    if (ids.some((id) => !outById.has(id))) {
      dropped++;
      continue;
    }
    if (!archIndex.has(archId)) {
      archIndex.set(archId, archs.length);
      archs.push([archId, archNames.get(archId) ?? archName(archEn, ids).nameJa, archEn]);
    }
    decks.push([t, archIndex.get(archId)!, place, w, l, ties, energy, cardsStr, dup]);
  }
  writeFileSync(join(ROOT, "src/data/decks.json"), JSON.stringify({ fetchedAt: raw.fetchedAt, tournaments: raw.tournaments, archetypes: archs, decks }));
  console.log(`大会のデッキリスト: ${decks.length} 件（${archs.length} デッキタイプ）${dropped ? ` ・ 知らないカードを含むため除外 ${dropped} 件` : ""}`);
} else writeFileSync(join(ROOT, "src/data/decks.json"), JSON.stringify({ fetchedAt: "", tournaments: [], archetypes: [], decks: [] }));

// トレーナーズが効く相手（効果文を読んで書いた表）
const helpsFile = join(DATA, "trainer-synergy.yaml");
const helps: AppHelp[] = [];
if (existsSync(helpsFile)) {
  const doc = loadYaml(readFileSync(helpsFile, "utf8")) as Record<string, { to: HelpTarget; label: string; labelEn: string; weight?: number }[]>;
  const tagIds = new Set(tax.map((t) => t.id));
  for (const [id, list] of Object.entries(doc)) {
    const c = outById.get(id);
    if (!c || c.kind === "pokemon") throw new Error(`trainer-synergy.yaml: トレーナーズではない: ${id}`);
    for (const h of list) {
      for (const t of h.to.tags ?? []) if (!tagIds.has(t)) throw new Error(`trainer-synergy.yaml: タグが無い: ${t}（${id}）`);
      if (!h.labelEn) throw new Error(`trainer-synergy.yaml: labelEn が無い: ${id}`);
      helps.push({ card: id, to: h.to, label: h.label, labelEn: h.labelEn, weight: h.weight ?? 1.2 });
    }
  }
  console.log(`トレーナーズの効く相手: ${helps.length} 件`);
}

// 英語の検索用の表現辞書（語尾違いは作らず、そのまま使う）
const lexEnFile = join(DATA, "lexicon-en.yaml");
const lexiconEn: LexEntry[] = [];
if (existsSync(lexEnFile)) {
  const doc = loadYaml(readFileSync(lexEnFile, "utf8")) as Record<string, Record<string, string[]> | string[]>;
  const tagIds = new Set(tax.map((t) => t.id));
  const targetOf = (cat: string, key: string): LexEntry["target"] => {
    switch (cat) {
      case "tags":
        if (!tagIds.has(key)) throw new Error(`lexicon-en.yaml: タグが無い: ${key}`);
        return { tag: key };
      case "types": return { type: key } as LexEntry["target"];
      case "kinds": return { kind: key } as LexEntry["target"];
      case "stages": return { stage: key } as LexEntry["target"];
      case "rules": return { rule: key } as LexEntry["target"];
      case "groups": return { group: key } as LexEntry["target"];
      case "slots": return { slot: key } as LexEntry["target"];
      default: return { variable: true };
    }
  };
  const seen = new Map<string, number>();
  for (const [cat, v] of Object.entries(doc)) {
    const items: [string, string[]][] = Array.isArray(v) ? [["", v]] : Object.entries(v);
    for (const [key, exprs] of items)
      for (const expr of exprs) {
        const e = String(expr).toLowerCase().trim();
        seen.set(e, (seen.get(e) ?? 0) + 1);
        lexiconEn.push({ expr: e, target: targetOf(cat, key), weight: 1 });
      }
  }
  // 同じ表現が別の項目にもあれば、両方に結びつけて重みを下げる
  for (const e of lexiconEn) if (seen.get(e.expr)! > 1) e.weight = 0.7;
  console.log(`英語の表現辞書: ${lexiconEn.length} 件`);
}

// 漢字を含むカード名・表現のよみ（ローマ字検索用）
const readingOf = await createReader();
let nRead = 0;
for (const c of out) if (hasKanji(c.nameJa)) (c.nameKana = readingOf(c.nameJa)), nRead++;
for (const e of lexicon) if (hasKanji(e.expr)) (e.kana = readingOf(e.expr)), nRead++;
console.log(`よみ: ${nRead} 件`);

const data: AppData = {
  builtAt: new Date().toISOString(),
  sets: [...setMap.values()].sort((a, b) => a.released.localeCompare(b.released) || a.code.localeCompare(b.code)),
  cards: out,
  tags: tax.map((t) => ({
    id: t.id, ja: t.ja, ...(t.en ? { en: t.en } : {}),
    ...(t.parent ? { parent: t.parent } : {}),
    ...(t.supplies ? { supplies: t.supplies } : {}),
    ...(t.requires ? { requires: t.requires } : {}),
  })),
  lexicon,
  ...(lexiconEn.length ? { lexiconEn } : {}),
  ...(meta ? { meta } : {}),
  ...(combos.length ? { combos } : {}),
  ...(helps.length ? { helps } : {}),
};
mkdirSync(join(ROOT, "src/data"), { recursive: true });
writeFileSync(join(ROOT, "src/data/ja-image-urls.json"), JSON.stringify([...jaImageUrls].sort()));
const nLocal = [...jaImageUrls].filter((u) => existsSync(join(ROOT, "public", jaImageFile(u)))).length;
console.log(`日本語のカード画像: ${jaImageUrls.size} 枚（自前 ${nLocal} 枚）`);
console.log(`英語のカード画像: 自前 ${enLocalCount} 枚`);
writeFileSync(join(ROOT, "src/data/app-data.json"), JSON.stringify(data));
console.log(`カード ${out.length} / タグ ${data.tags.length} / 表現辞書 ${lexicon.length} → src/data/app-data.json (${(JSON.stringify(data).length / 1e6).toFixed(1)} MB)`);
