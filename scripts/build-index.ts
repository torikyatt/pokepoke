// アプリに埋め込むデータを作る。
// 入力: data/cards.json, data/tags.json, data/taxonomy.yaml, data/lexicon/*.json
// 出力: src/data/app-data.json（生成物。コミットしない）
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadTaxonomy } from "./lib/taxonomy.ts";
import type { Card, Effect } from "./lib/types.ts";
import type { AppAttack, AppCard, AppData, AppEffect, EnergyType, LexEntry, Slot } from "../src/types.ts";

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
  const card: AppCard = {
    id: c.id,
    nameJa: c.nameJa ?? c.nameEn,
    nameEn: c.nameEn,
    kind: c.kind,
    typeRefs: typeRefs.size >= 5 ? [] : [...typeRefs],
    rule: c.rule,
    groups: c.groups,
    evolvesFrom: c.evolvesFrom,
    evolvesTo: c.evolvesTo,
    attacks,
    prints: c.prints.map((p) => ({ id: p.id, set: p.set, setName: p.setName, rarity: p.rarity })),
    image: c.prints[0].image,
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

const data: AppData = {
  builtAt: new Date().toISOString(),
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
