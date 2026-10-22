// 実装前のカード（data/upcoming.yaml）を data/cards.json に足す。npm run data の match-ja のあと・translate の前に動かす。
// 元データに実装予定日以降のプリントが出たら（＝実装されて本物のデータが入ったら）、そのパックのカードは足さない
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { load as loadYaml } from "js-yaml";
import type { Attack, Card, EnergyType, Upcoming } from "./lib/types.ts";

const DATA = join(import.meta.dirname, "../data");
const COST: Record<string, EnergyType> = {
  G: "grass", R: "fire", W: "water", L: "lightning", P: "psychic",
  F: "fighting", D: "darkness", M: "metal", N: "dragon", C: "colorless",
};

interface YEffect { nameJa?: string; nameEn?: string; textJa?: string; textEn?: string; unknown?: boolean }
interface YAttack extends YEffect { cost: string; damage?: number | string }
interface YCard {
  id: string; set: string; rarity: string; image?: string; source?: string;
  nameEn: string; nameJa: string; type: EnergyType[]; stage: Card["stage"]; evolvesFrom?: string; rule: Card["rule"];
  hp: number; weakness?: EnergyType; retreat?: number; unknown?: Upcoming["unknown"]; machine?: boolean;
  ability?: YEffect; attacks: YAttack[];
}
interface YSet { code: string; nameEn: string; nameJa: string; date?: string; source: string }
const y = loadYaml(readFileSync(join(DATA, "upcoming.yaml"), "utf8")) as { sets: YSet[]; cards: YCard[] };

const cards: Card[] = JSON.parse(readFileSync(join(DATA, "cards.json"), "utf8")).filter((c: Card) => !c.upcoming);
const released = (c: Card) => c.prints.map((p) => p.released ?? "").filter(Boolean);
// 実装済みになったか: パックは「予定日以降のプリントが元データにある」。
// 日付の無いもの（プロモ・スペシャルパック）は「名前・HP・ワザのコストとダメージが同じカードが元データにある」
// （フシギダネのように同じ名前の別のカードが前からあるので、名前だけでは決めない）
const atkKey = (cost: string, damage: number | string | undefined, name?: string) => `${name ?? "?"}:${[...cost].sort().join("")}:${String(damage ?? "").replace(/[+×]/, "")}`;
const CODE: Record<string, string> = Object.fromEntries(Object.entries(COST).map(([k, v]) => [v, k]));
// ワザ名が分かっていないもの（?）は、名前を比べない
const realKey = (c: Card, x: YCard) =>
  c.attacks.map((a, i) => atkKey(Object.entries(a.cost).flatMap(([t, n]) => Array(n).fill(CODE[t])).join(""), a.damage, x.attacks[i]?.nameEn ? a.nameEn : undefined)).join("|");
const arrived = (date: string | undefined, x: YCard) =>
  date
    ? cards.some((c) => released(c).some((d) => d >= date))
    : cards.some((c) => c.nameEn === x.nameEn && c.hp === x.hp && realKey(c, x) === x.attacks.map((a) => atkKey(a.cost, a.damage, a.nameEn)).join("|"));

const effect = (e: YEffect, machine: boolean) => ({
  ...(e.unknown ? { unknown: true as const } : {}),
  ...(e.nameEn ? { nameEn: e.nameEn } : {}),
  ...(e.nameJa ? { nameJa: e.nameJa } : {}),
  textEn: e.textEn ?? "",
  ...(e.textJa ? { textJa: e.textJa } : {}),
  ...(e.unknown ? {} : { jaSource: machine ? ("machine" as const) : ("official" as const) }),
  tags: [],
});
function attack(a: YAttack, machine: boolean): Attack {
  const cost: Attack["cost"] = {};
  for (const ch of a.cost) cost[COST[ch]] = (cost[COST[ch]] ?? 0) + 1;
  const costTotal = a.cost.length;
  const dmg = a.damage === undefined ? undefined : String(a.damage);
  return {
    ...effect(a, machine),
    cost, costTotal, costTyped: costTotal - (cost.colorless ?? 0),
    ...(dmg ? { damage: Number(dmg.replace(/[+×]/, "")) } : {}),
    damageVariable: !!dmg && /[+×]/.test(dmg),
  };
}

const added: Card[] = [];
const skipped: string[] = [];
for (const x of y.cards) {
  const set = y.sets.find((s) => s.code === x.set);
  if (arrived(set?.date, x)) {
    skipped.push(x.nameEn);
    continue;
  }
  const upcoming: Upcoming = { ...(set?.date ? { date: set.date } : {}), source: x.source ?? set!.source, ...(x.unknown ? { unknown: x.unknown } : {}) };
  const card: Card = {
    id: x.id, nameEn: x.nameEn, nameJa: x.nameJa, kind: "pokemon",
    type: x.type[0], ...(x.type[1] ? { type2: x.type[1] } : {}),
    stage: x.stage, ...(x.evolvesFrom ? { evolvesFromName: x.evolvesFrom } : {}),
    evolvesFrom: [], evolvesTo: [], rule: x.rule, groups: [],
    points: x.rule === "mega_ex" ? 3 : x.rule === "ex" ? 2 : 1,
    hp: x.hp, ...(x.weakness ? { weakness: x.weakness } : {}), ...(x.retreat !== undefined ? { retreat: x.retreat } : {}),
    ...(x.ability ? { ability: effect(x.ability, !!x.machine) } : {}),
    attacks: x.attacks.map((a) => attack(a, !!x.machine)),
    prints: [{ id: x.id, set: x.set, setName: set?.nameEn ?? cards.flatMap((c) => c.prints).find((p) => p.set === x.set)?.setName ?? x.set, rarity: x.rarity, image: x.image ?? "", ...(set?.date ? { released: set.date } : {}) }],
    tags: [],
    upcoming,
  };
  added.push(card);
}

// 進化のつながり（名前で結ぶ。既存のカードの進化先にも足す）
const nameKey = (n: string) => n.replace(/\s+/g, "").toLowerCase();
const all = [...cards, ...added];
for (const c of added) {
  for (const p of all) {
    if (c.evolvesFromName && nameKey(p.nameEn) === nameKey(c.evolvesFromName)) {
      c.evolvesFrom.push(p.id);
      p.evolvesTo.push(c.id);
    }
    if (p.evolvesFromName && nameKey(p.evolvesFromName) === nameKey(c.nameEn)) {
      p.evolvesFrom.push(c.id);
      c.evolvesTo.push(p.id);
    }
  }
}

writeFileSync(join(DATA, "cards.json"), JSON.stringify(all, null, 1));
console.log(`実装前のカード ${added.length} 枚を追加${skipped.length ? ` / 実装済みなので外した ${skipped.length} 枚: ${skipped.join(", ")}` : ""}`);
