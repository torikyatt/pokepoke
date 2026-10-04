// アプリに埋め込むデータを作る。
// 入力: data/cards.json, data/tags.json, data/taxonomy.yaml, data/lexicon/*.json
// 出力: src/data/app-data.json（生成物。コミットしない）
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { jaImageIndex } from "./lib/game8.ts";
import { loadTaxonomy } from "./lib/taxonomy.ts";
import type { Card, Effect } from "./lib/types.ts";
import type { AppAttack, AppCard, AppData, AppEffect, AppSet, EnergyType, LexEntry, Slot } from "../src/types.ts";

const ROOT = join(import.meta.dirname, "..");
const DATA = join(ROOT, "data");
const cards: Card[] = JSON.parse(readFileSync(join(DATA, "cards.json"), "utf8"));
const tags: Record<string, { ability?: string[]; attacks: string[][]; text?: string[]; refs: string[] }> = JSON.parse(
  readFileSync(join(DATA, "tags.json"), "utf8"),
);
const tax = loadTaxonomy(DATA);
const lexDir = join(DATA, "lexicon");
const lexicon: LexEntry[] = existsSync(lexDir)
  ? readdirSync(lexDir).filter((f) => f.endsWith(".json")).flatMap((f) => JSON.parse(readFileSync(join(lexDir, f), "utf8")))
  : [];

const CODE: Record<string, EnergyType> = {
  G: "grass", R: "fire", W: "water", L: "lightning", P: "psychic", F: "fighting", D: "darkness", M: "metal",
};
const byId = new Map(cards.map((c) => [c.id, c]));
const jaImageOf = jaImageIndex(DATA);

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
    for (const m of c.text.textEn.matchAll(/\[\s*([GRWLPFDM])\s*\]/g)) typeRefs.add(CODE[m[1]]);
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
    const ts = [...e.textEn.matchAll(/\[\s*([GRWLPFDMC])\s*\]/g)].map((m) => (m[1] === "C" ? "colorless" : CODE[m[1]]));
    if (new Set(ts).size < 5) for (const x of ts) accelTypes.add(x as EnergyType);
  }
  const card: AppCard = {
    id: c.id,
    nameJa: c.nameJa ?? c.nameEn,
    nameEn: c.nameEn,
    kind: c.kind,
    typeRefs: typeRefs.size >= 5 ? [] : [...typeRefs],
    accelTypes: [...accelTypes],
    rule: c.rule,
    groups: c.groups,
    evolvesFrom: c.evolvesFrom,
    evolvesTo: c.evolvesTo,
    attacks,
    prints: c.prints.map((p) => ({ id: p.id, set: p.set, setName: p.setName, rarity: p.rarity })),
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

// 収録パックの日本語名: Game8 の収録パック名（「最強の遺伝子ピカチュウ」など）の共通の頭の部分
const g8: { set: string; pack?: string }[] = JSON.parse(readFileSync(join(DATA, "game8/cards.json"), "utf8"));
const packNames = new Map<string, Map<string, number>>();
for (const c of g8) {
  if (!c.pack || c.pack === "-") continue;
  const m = packNames.get(c.set) ?? packNames.set(c.set, new Map()).get(c.set)!;
  m.set(c.pack, (m.get(c.pack) ?? 0) + 1);
}
const commonPrefix = (a: string, b: string) => {
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  return a.slice(0, i);
};
const setJa = (code: string) => {
  const g8code = ({ pa: "PROMO-A", pb: "PROMO-B" } as Record<string, string>)[code] ?? code.charAt(0).toUpperCase() + code.slice(1);
  const top = [...(packNames.get(g8code) ?? [])].sort((a, b) => b[1] - a[1]).map(([n]) => n);
  if (g8code.startsWith("PROMO") || !top.length) return g8code.replace("PROMO", "プロモ");
  return top.length > 1 && commonPrefix(top[0], top[1]).length >= 3 ? commonPrefix(top[0], top[1]) : top[0];
};
const setMap = new Map<string, AppSet>();
for (const c of cards) {
  for (const p of c.prints) {
    const cur = setMap.get(p.set);
    if (!cur) setMap.set(p.set, { code: p.set, name: p.setName, nameJa: setJa(p.set), released: p.released ?? "" });
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
