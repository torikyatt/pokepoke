// PocketDecks の全プリントを、ゲーム上の同一カードごとに1レコードへまとめる。
// 出力: data/cards.base.json
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Attack, Card, CardKind, EnergyType, Print } from "./lib/types.ts";

const DATA = join(import.meta.dirname, "../data");
const raw: any[] = JSON.parse(readFileSync(join(DATA, "raw/pocketdecks.cards.json"), "utf8"));

const COST: Record<string, EnergyType> = {
  G: "grass", R: "fire", W: "water", L: "lightning", P: "psychic",
  F: "fighting", D: "darkness", M: "metal", C: "colorless",
};
const TYPE: Record<string, EnergyType> = {
  Grass: "grass", Fire: "fire", Water: "water", Lightning: "lightning", Psychic: "psychic",
  Fighting: "fighting", Darkness: "darkness", Metal: "metal", Dragon: "dragon", Colorless: "colorless",
};
const STAGE: Record<string, Card["stage"]> = { Basic: "basic", "Stage 1": "stage1", "Stage 2": "stage2" };

// 「30ダメージ×表の数」「さらに30ダメージ」など、ダメージが変動するワザ
const VARIABLE_DAMAGE = /more damage|damage for each|for each .* this attack does|this attack does \d+ damage .* times|less damage/i;

function parseAttack(a: any): Attack {
  const cost: Partial<Record<EnergyType, number>> = {};
  for (const ch of a.cost ?? "") {
    const t = COST[ch];
    if (t) cost[t] = (cost[t] ?? 0) + 1;
  }
  const costTotal = Object.values(cost).reduce((s, n) => s + (n ?? 0), 0);
  const textEn = a.effect ?? "";
  return {
    nameEn: a.name,
    textEn,
    tags: [],
    cost,
    costTotal,
    costTyped: costTotal - (cost.colorless ?? 0),
    damage: typeof a.damage === "number" ? a.damage : undefined,
    damageVariable: VARIABLE_DAMAGE.test(textEn),
  };
}

function kindOf(x: any): CardKind {
  if (x.type !== "Trainer") return "pokemon";
  // 「ひみつのコハク」(Old Amber) のように名前が Fossil で終わらない化石もあるので効果文でも見る
  if (/Fossil$/.test(x.name) || /as if it were a \d+-HP Basic/.test(x.card_text ?? "")) return "fossil";
  return ({ Supporter: "supporter", Item: "item", Tool: "tool", Stadium: "stadium" } as const)[
    x.subtype as "Supporter"
  ] ?? "item";
}

// ゲーム上の同一性: 名前・HP・特性・ワザ・トレーナーズ効果がすべて同じ
function gameplayKey(x: any): string {
  const attacks = Object.values(x.attacks ?? {}).filter((a: any) => a?.name);
  return JSON.stringify([x.name, x.health ?? null, x.ability?.exists ? x.ability : null, attacks, x.card_text ?? null]);
}

const groups = new Map<string, any[]>();
for (const x of raw) {
  const k = gameplayKey(x);
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k)!.push(x);
}

const cards: Card[] = [];
for (const xs of groups.values()) {
  // 代表プリントは最も早く出た通常レアリティのもの
  const sorted = [...xs].sort((a, b) => (a.release_date ?? "").localeCompare(b.release_date ?? "") || a.id.localeCompare(b.id));
  const x = sorted[0];
  const kind = kindOf(x);
  const prints: Print[] = sorted.map((p) => ({
    id: p.id, set: p.set_code, setName: p.set_name, rarity: p.rarity, image: p.image,
  }));
  const card: Card = {
    id: x.id,
    nameEn: x.name,
    kind,
    evolvesFrom: [],
    evolvesTo: [],
    rule: x.mega ? "mega_ex" : x.ex ? "ex" : "normal",
    attacks: [],
    prints,
    tags: [],
  };
  if (kind === "pokemon") {
    card.type = TYPE[x.subtype];
    card.stage = STAGE[x.stage];
    card.evolvesFromName = x.evolves_from ?? undefined;
    card.points = x.points ?? undefined;
    card.hp = x.health ?? undefined;
    card.weakness = TYPE[x.weakness] ?? undefined;
    card.retreat = x.retreat ?? undefined;
    if (x.ability?.exists) card.ability = { nameEn: x.ability.name, textEn: x.ability.effect ?? "", tags: [] };
    card.attacks = Object.values(x.attacks ?? {}).filter((a: any) => a?.name).map(parseAttack);
  } else {
    card.text = { textEn: x.card_text ?? "", tags: [] };
  }
  cards.push(card);
}

// 進化リンク（名前で結ぶ。同名の別バージョンは全部候補。元データの空白揺れを吸収）
const nameKey = (n: string) => n.replace(/\s+/g, "").toLowerCase();
const byName = new Map<string, Card[]>();
for (const c of cards) {
  const k = nameKey(c.nameEn);
  if (!byName.has(k)) byName.set(k, []);
  byName.get(k)!.push(c);
}
for (const c of cards) {
  if (!c.evolvesFromName) continue;
  for (const p of byName.get(nameKey(c.evolvesFromName)) ?? []) {
    c.evolvesFrom.push(p.id);
    p.evolvesTo.push(c.id);
  }
}

cards.sort((a, b) => a.id.localeCompare(b.id, "en", { numeric: true }));
writeFileSync(join(DATA, "cards.base.json"), JSON.stringify(cards, null, 1));

const count = (k: CardKind) => cards.filter((c) => c.kind === k).length;
console.log(`プリント ${raw.length} 枚 → カード ${cards.length} 種`);
console.log(`ポケモン ${count("pokemon")} / グッズ ${count("item")} / 化石 ${count("fossil")} / サポート ${count("supporter")} / どうぐ ${count("tool")} / スタジアム ${count("stadium")}`);
