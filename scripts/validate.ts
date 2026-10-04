// データの欠けと不整合を洗い出す。エラーがあれば終了コード1。
// data/cards.json（日本語付き）があればそれを、無ければ data/cards.base.json を検査する。
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadTaxonomy } from "./lib/taxonomy.ts";
import type { Card } from "./lib/types.ts";

const DATA = join(import.meta.dirname, "../data");
const withJa = existsSync(join(DATA, "cards.json"));
const cards: Card[] = JSON.parse(readFileSync(join(DATA, withJa ? "cards.json" : "cards.base.json"), "utf8"));
const namesJa: Record<string, string> = existsSync(join(DATA, "names-ja.json"))
  ? JSON.parse(readFileSync(join(DATA, "names-ja.json"), "utf8"))
  : {};
const nameJaOf = (c: Card) => (withJa ? c.nameJa : namesJa[c.nameEn]);

// M1の完了条件: 9割以上のカードに公式日本語（Game8）が付く
const OFFICIAL_RATE_MIN = 0.9;

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
    if (!nameJaOf(c)) warns.push(`${at}: 日本語名なし`);
    for (const a of c.attacks) {
      if (a.damage === undefined && !a.textEn) warns.push(`${at}: ワザ「${a.nameEn}」にダメージも効果もない`);
    }
  } else if (!c.text?.textEn) {
    errors.push(`${at}: トレーナーズの効果文なし`);
  }
  for (const id of [...c.evolvesFrom, ...c.evolvesTo]) {
    if (!ids.has(id)) errors.push(`${at}: 存在しない進化リンク ${id}`);
  }
  if (withJa) {
    for (const [label, e] of [["特性", c.ability], ...c.attacks.map((a) => ["ワザ", a] as const), ["効果", c.text]] as const) {
      if (!e) continue;
      if (e.jaSource && !e.nameJa && label !== "効果") errors.push(`${at}: ${label}「${e.nameEn}」に日本語の名前がない`);
      if (e.jaSource && e.textEn && !e.textJa) warns.push(`${at}: ${label}「${e.nameEn ?? ""}」の日本語の効果文がない`);
    }
  }
}

const pokemon = cards.filter((c) => c.kind === "pokemon");
const jaRate = pokemon.filter(nameJaOf).length / pokemon.length;
console.log(`カード ${cards.length} 種 / ポケモン名の日本語化率 ${(jaRate * 100).toFixed(1)}%`);
if (withJa) {
  const effects = (c: Card) => [c.ability, ...c.attacks, c.text].filter((e) => e !== undefined);
  const official = cards.filter((c) => c.nameJa && effects(c).every((e) => e.jaSource === "official")).length;
  const rate = official / cards.length;
  const missing = cards.flatMap((c) => effects(c).filter((e) => !e.jaSource)).length;
  console.log(`公式日本語がそろったカード ${(rate * 100).toFixed(1)}%（${official}/${cards.length}）/ 日本語の無いワザ・特性・効果 ${missing} 件`);
  if (rate < OFFICIAL_RATE_MIN) errors.push(`公式日本語の付いたカードが ${(OFFICIAL_RATE_MIN * 100).toFixed(0)}% 未満`);
}
// タグ（M2）: 未定義タグ・タグの無い効果
if (existsSync(join(DATA, "tags.json"))) {
  const known = new Set(loadTaxonomy(DATA).map((t) => t.id));
  const tags: Record<string, { ability?: string[]; attacks: string[][]; text?: string[]; refs: string[] }> = JSON.parse(
    readFileSync(join(DATA, "tags.json"), "utf8"),
  );
  let untagged = 0;
  for (const c of cards) {
    const ct = tags[c.id];
    if (!ct) {
      errors.push(`${c.id} ${c.nameEn}: tags.json に無い`);
      continue;
    }
    const slots: [string, string[] | undefined, string | undefined][] = [
      ["特性", ct.ability, c.ability?.textEn],
      ...c.attacks.map((a, i) => ["ワザ", ct.attacks[i], a.textEn] as [string, string[] | undefined, string | undefined]),
      ["効果", ct.text, c.text?.textEn],
    ];
    for (const [label, ts, text] of slots) {
      for (const t of ts ?? []) if (!known.has(t)) errors.push(`${c.id} ${c.nameEn}: ${label}に未定義タグ ${t}`);
      // 化石は種別で引けるので効果タグが無くてよい
      if (text && !ts?.length && c.kind !== "fossil") {
        untagged++;
        warns.push(`${c.id} ${c.nameEn}: ${label}にタグが無い`);
      }
    }
    for (const id of ct.refs) if (!ids.has(id)) errors.push(`${c.id} ${c.nameEn}: 存在しない名前指定 ${id}`);
  }
  console.log(`タグの無い効果 ${untagged} 件`);
}
if (withJa) {
  const noJa = cards.flatMap((c) => [c.ability, ...c.attacks, c.text].filter((e) => e && ((e.textEn && !e.textJa) || (e.nameEn && !e.nameJa))).map(() => c.id));
  if (noJa.length) errors.push(`日本語の無いワザ・特性・効果 ${noJa.length} 件（npm run translate）: ${noJa.slice(0, 5).join(", ")}`);
}
console.log(`エラー ${errors.length} 件 / 警告 ${warns.length} 件`);
for (const e of errors.slice(0, 30)) console.log(`  ✗ ${e}`);
for (const w of warns.slice(0, 15)) console.log(`  △ ${w}`);
if (errors.length) process.exit(1);
