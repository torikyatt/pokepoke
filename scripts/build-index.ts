// アプリに埋め込むデータを作る。
// 入力: data/cards.json, data/tags.json, data/taxonomy.yaml, data/lexicon/*.json
// 出力: src/data/app-data.json（生成物。コミットしない）
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { jaImageIndex } from "./lib/game8.ts";
import { requireInfoOf, selectorOf } from "./lib/targets.ts";
import { loadTaxonomy } from "./lib/taxonomy.ts";
import type { Card, Effect } from "./lib/types.ts";
import type { G8Card } from "./lib/game8.ts";
import type { AppAttack, AppCard, AppData, AppEffect, AppPrint, AppSet, EnergyType, LexEntry, Selector, Slot } from "../src/types.ts";

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

function printOf(c: Card, p: Card["prints"][number]): AppPrint {
  const out: AppPrint = { id: p.id, set: p.set, setName: p.setName, rarity: p.rarity };
  const g = (g8Match[c.id]?.g8 ?? []).map((id) => g8ById.get(id)).find((x) => x && x.set === g8SetOf(p.set) && x.number === Number(p.id.split("-").pop()));
  if (!g) return out;
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
    prints: c.prints.map((p) => printOf(c, p)),
    image: c.prints[0].image,
    ...(jaImageOf(c) ? { imageJa: jaImageOf(c) } : {}),
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

const data: AppData = {
  builtAt: new Date().toISOString(),
  sets: [...setMap.values()].sort((a, b) => a.released.localeCompare(b.released) || a.code.localeCompare(b.code)),
  cards: out,
  tags: tax.map((t) => ({
    id: t.id, ja: t.ja,
    ...(t.parent ? { parent: t.parent } : {}),
    ...(t.supplies ? { supplies: t.supplies } : {}),
    ...(t.requires ? { requires: t.requires } : {}),
  })),
  lexicon,
};
mkdirSync(join(ROOT, "src/data"), { recursive: true });
writeFileSync(join(ROOT, "src/data/app-data.json"), JSON.stringify(data));
console.log(`カード ${out.length} / タグ ${data.tags.length} / 表現辞書 ${lexicon.length} → src/data/app-data.json (${(JSON.stringify(data).length / 1e6).toFixed(1)} MB)`);
