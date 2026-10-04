// データの欠けと不整合を洗い出す。エラーがあれば終了コード1。
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Card } from "./lib/types.ts";

const DATA = join(import.meta.dirname, "../data");
const cards: Card[] = JSON.parse(readFileSync(join(DATA, "cards.base.json"), "utf8"));
const namesJa: Record<string, string> = existsSync(join(DATA, "names-ja.json"))
  ? JSON.parse(readFileSync(join(DATA, "names-ja.json"), "utf8"))
  : {};

const errors: string[] = [];
const warns: string[] = [];
const ids = new Set(cards.map((c) => c.id));

for (const c of cards) {
  const at = `${c.id} ${c.nameEn}`;
  if (c.kind === "pokemon") {
    if (!c.type) errors.push(`${at}: タイプなし`);
    if (!c.stage) errors.push(`${at}: 進化段階なし`);
    if (!c.hp) errors.push(`${at}: HPなし`);
    if (!c.attacks.length && !c.ability) errors.push(`${at}: ワザも特性もない`);
    if (c.stage !== "basic" && !c.evolvesFrom.length) errors.push(`${at}: 進化元が見つからない (${c.evolvesFromName})`);
    if (!namesJa[c.nameEn]) warns.push(`${at}: 日本語名なし`);
    for (const a of c.attacks) {
      if (a.damage === undefined && !a.textEn) warns.push(`${at}: ワザ「${a.nameEn}」にダメージも効果もない`);
    }
  } else if (!c.text?.textEn) {
    errors.push(`${at}: トレーナーズの効果文なし`);
  }
  for (const id of [...c.evolvesFrom, ...c.evolvesTo]) {
    if (!ids.has(id)) errors.push(`${at}: 存在しない進化リンク ${id}`);
  }
}

const pokemon = cards.filter((c) => c.kind === "pokemon");
const jaRate = pokemon.filter((c) => namesJa[c.nameEn]).length / pokemon.length;
console.log(`カード ${cards.length} 種 / ポケモン名の日本語化率 ${(jaRate * 100).toFixed(1)}%`);
console.log(`エラー ${errors.length} 件 / 警告 ${warns.length} 件`);
for (const e of errors.slice(0, 30)) console.log(`  ✗ ${e}`);
for (const w of warns.slice(0, 15)) console.log(`  △ ${w}`);
if (errors.length) process.exit(1);
