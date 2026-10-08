// 表現辞書を作る（オフライン工程）。data/lexicon-seed.yaml の中心表現に語尾違いを足し、
// 1項目あたり30表現以上にして data/lexicon/*.json に書き出す。
// 衝突（同じ表現が別の項目を指す）は両方に結びつけたうえで weight を下げる（SPEC 3.8）。
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { load as loadYaml } from "js-yaml";
import { loadTaxonomy } from "./lib/taxonomy.ts";
import { normalize } from "../src/search/normalize.ts";
import type { LexEntry, LexTarget } from "../src/types.ts";

const DATA = join(import.meta.dirname, "../data");
const seed = loadYaml(readFileSync(join(DATA, "lexicon-seed.yaml"), "utf8")) as Record<string, any>;
const MIN = 30;

// 語尾違い。検索文の「〜できる」「〜系」なども辞書で食べておくと、全文検索語として余らない
const SUFFIX: Record<string, string[]> = {
  tags: ["", "する", "できる", "系", "持ち", "効果", "カード", "のやつ", "させる", "ができる"],
  types: ["", "タイプ", "属性", "ポケモン", "ポケ", "デッキ", "系", "の"],
  kinds: ["", "カード", "系", "札", "だけ"],
  stages: ["", "の", "ポケ", "だけ", "ポケモン"],
  rules: ["", "ポケモン", "の", "カード", "だけ"],
  groups: ["", "ポケモン", "の", "系"],
  slots: ["", "で", "が"],
  variable: ["", "ワザ"],
};

const targetOf = (cat: string, key: string): LexTarget => {
  switch (cat) {
    case "tags": return { tag: key };
    case "types": return { type: key } as LexTarget;
    case "kinds": return { kind: key } as LexTarget;
    case "stages": return { stage: key } as LexTarget;
    case "rules": return { rule: key } as LexTarget;
    case "groups": return { group: key } as LexTarget;
    case "slots": return { slot: key } as LexTarget;
    default: return { variable: true };
  }
};

interface Item { cat: string; key: string; entries: Map<string, { expr: string; weight: number }> }
const items: Item[] = [];
// タグの表示名（検索結果の条件の札に出る「相手がどくだと変わる」など）も、そのまま打てば当たるようにする。
// いちばん上の大きな分け方（エネルギー・ダメージ…）は、ほかの言葉の一部として出てきやすいので入れない。「・」で2つ並べた名前も入れない
const labelOf = new Map(loadTaxonomy(DATA).filter((t) => t.depth >= 2 && !/[・（(]/.test(t.ja)).map((t) => [t.id, t.ja]));
for (const cat of Object.keys(SUFFIX)) {
  const groups: Record<string, string[]> = cat === "variable" ? { variable: seed.variable } : seed[cat];
  for (const [key, seedCores] of Object.entries(groups)) {
    const label = cat === "tags" ? labelOf.get(key) : undefined;
    const cores = label && !seedCores.includes(label) ? [...seedCores, label] : seedCores;
    const entries = new Map<string, { expr: string; weight: number }>();
    for (const core of cores) {
      for (const suf of SUFFIX[cat]) {
        const expr = core + suf;
        const n = normalize(expr);
        if (!n || entries.has(n)) continue;
        entries.set(n, { expr, weight: suf ? 0.85 : 1 });
      }
    }
    items.push({ cat, key, entries });
  }
}

// 衝突の検出
const owners = new Map<string, Item[]>();
for (const it of items) for (const n of it.entries.keys()) (owners.get(n) ?? owners.set(n, []).get(n)!).push(it);
const collisions = [...owners].filter(([, its]) => its.length > 1);

const byCat = new Map<string, LexEntry[]>();
for (const it of items) {
  const list = byCat.get(it.cat) ?? byCat.set(it.cat, []).get(it.cat)!;
  for (const [n, e] of it.entries) {
    // 語尾を足して作った表現が、ほかの項目で人が書いた表現（weight 1）とぶつかるなら、作った方は捨てる
    // （「入れ替え」＋「させる」が、「相手を入れ替えさせる」の「入れ替えさせる」を横取りしないように）
    if (e.weight < 1 && owners.get(n)!.some((o) => o !== it && o.entries.get(n)?.weight === 1)) continue;
    const shared = owners.get(n)!.filter((o) => !(o.entries.get(n)!.weight < 1 && owners.get(n)!.some((x) => x !== o && x.entries.get(n)?.weight === 1))).length > 1;
    list.push({ expr: e.expr, target: targetOf(it.cat, it.key), weight: Math.round(e.weight * (shared ? 0.7 : 1) * 100) / 100 });
  }
}

const dir = join(DATA, "lexicon");
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
for (const [cat, list] of byCat) writeFileSync(join(dir, `${cat}.json`), JSON.stringify(list, null, 0).replace(/},{/g, "},\n{"));

// 検査: 全タグに辞書があるか、1項目30以上か
const errors: string[] = [];
const tagKeys = new Set(Object.keys(seed.tags));
for (const t of loadTaxonomy(DATA)) if (!tagKeys.has(t.id)) errors.push(`タグ ${t.id} の表現が無い`);
for (const k of tagKeys) if (!loadTaxonomy(DATA).some((t) => t.id === k)) errors.push(`seed に未定義タグ ${k}`);
for (const it of items) {
  if (["slots", "variable"].includes(it.cat)) continue;
  if (it.entries.size < MIN) errors.push(`${it.cat}.${it.key}: 表現 ${it.entries.size} 件（${MIN}件未満）`);
}
const total = [...byCat.values()].reduce((s, l) => s + l.length, 0);
console.log(`表現 ${total} 件（項目 ${items.length}）/ 衝突 ${collisions.length} 件（weight を下げて両方に結びつけた）`);
for (const [n, its] of collisions.slice(0, 10)) console.log(`  衝突: ${n} → ${its.map((i) => `${i.cat}.${i.key}`).join(", ")}`);
for (const e of errors) console.log(`  ✗ ${e}`);
if (errors.length) process.exit(1);
