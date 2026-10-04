// Game8のカード一覧から日本語カード情報を取得する。
// 一覧ページは個別ページを辿らずとも、全カード・全ワザ/特性をまとめたJSONを1本読み込んで描画している。
// そのJSONを取れば数リクエストで済むので、個別ページは取りに行かない。
//
//   npm run scrape-game8              キャッシュがあればネットに出ない
//   npm run scrape-game8 -- --refresh 一覧ページを取り直し、JSONの版が上がっていれば取り直す（新弾対応）
//
// キャッシュ: data/game8/cache/（コミットしない）
// 出力:       data/game8/cards.json, data/game8/moves.json（抽出結果。コミットする）
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { G8Card, G8Move } from "./lib/game8.ts";
import { fetchCached } from "./lib/polite.ts";

const DIR = join(import.meta.dirname, "../data/game8");
const CACHE = join(DIR, "cache");
mkdirSync(CACHE, { recursive: true });

const LIST_URL = "https://game8.jp/pokemon-tcg-pocket/639698";
const refresh = process.argv.includes("--refresh");

async function fetchText(url: string, cacheFile: string, force: boolean, referer?: string): Promise<string> {
  return fetchCached(url, join(CACHE, cacheFile), force, referer);
}

// ---- 取得 ----

console.log("Game8 一覧ページ");
const html = await fetchText(LIST_URL, "639698.html", refresh);
const version = html.match(/const cacheVersion = '(\d+)'/)?.[1];
const jsonBase = html.match(/fetch\(`(https:\/\/assets\.game8\.jp\/[^`?]+pokemon_card\.json)\?version=/)?.[1];
if (!version || !jsonBase) throw new Error("一覧ページの構造が変わった: カードデータJSONのURLが見つからない");
console.log(`カードデータ版 ${version}`);
const tables: { id: number; db_data: Record<string, any>[] }[] = JSON.parse(
  await fetchText(`${jsonBase}?version=${version}`, `pokemon_card.v${version}.json`, false, LIST_URL),
);

// ---- 抽出 ----
// 列の意味は一覧ページのスクリプトと中身を突き合わせて決めた。Game8側で列が変わったら下のレポートで気づける

const s = (v: unknown) => (typeof v === "string" ? v.normalize("NFKC").trim() : v == null ? "" : String(v).trim());
const num = (v: unknown) => (/^\d+$/.test(s(v)) ? Number(s(v)) : undefined);

const [cardRows, moveRows] = [tables[0]?.db_data ?? [], tables[1]?.db_data ?? []];

const cards: G8Card[] = cardRows.map((r) => ({
  g8Id: r.id,
  url: s(r.url) || undefined,
  title: s(r.title),
  set: s(r.col_3),
  number: Number(s(r.col_2)),
  numberLabel: s(r.col_4),
  rarity: s(r.col_1),
  category: s(r.col_5),
  trainerType: s(r.col_6) || undefined,
  stage: s(r.col_7) || undefined,
  hp: num(r.col_8),
  type: s(r.col_9) || undefined,
  weakness: s(r.col_10) || undefined,
  retreat: num(r.col_11),
  name: s(r.col_20),
  text: s(r.col_17) || undefined,
  pack: s(r.col_23) || undefined,
  image: s(r.image_url) || undefined,
  acquire: s(r.col_22) || undefined,
  howTo: s(r.col_56) || undefined,
  group: s(r.col_35) || undefined,
}));

const moves: G8Move[] = moveRows.map((r) => ({
  g8Id: r.id,
  kind: s(r.col_1) === "特性" ? "ability" : "attack",
  name: s(r.title),
  pokemon: s(r.col_2),
  set: s(r.col_3),
  index: num(r.col_4),
  cost: ["col_5", "col_6", "col_7", "col_8", "col_9"].map((k) => s(r[k])).filter(Boolean),
  damage: s(r.col_16) || undefined,
  text: s(r.col_15) || undefined,
}));

// ---- 件数と必須項目の欠けをレポート ----

const report: string[] = [];
const check = (label: string, bad: (G8Card | G8Move)[]) => {
  const at = (x: G8Card | G8Move) => ("title" in x ? x.title : `${x.pokemon || "?"}(${x.set || "?"})「${x.name}」#${x.g8Id}`);
  if (bad.length) report.push(`${label} ${bad.length} 件（例: ${bad.slice(0, 3).map(at).join(" / ")}）`);
};
const isPokemon = (c: G8Card) => c.category === "ポケモン" && !c.trainerType;
check("カード名なし", cards.filter((c) => !c.name));
check("収録パック/番号なし", cards.filter((c) => !c.set || !Number.isFinite(c.number)));
check("ポケモンのHPなし", cards.filter((c) => isPokemon(c) && !c.hp));
check("ポケモンのタイプなし", cards.filter((c) => isPokemon(c) && !c.type));
check("トレーナーズの効果文なし", cards.filter((c) => !isPokemon(c) && !c.text));
check("ワザ/特性名なし", moves.filter((m) => !m.name));
check("ワザ/特性の持ち主・収録パックなし", moves.filter((m) => !m.pokemon || !m.set));
check("ワザのコストなし", moves.filter((m) => m.kind === "attack" && !m.cost.length));
check("特性の効果文なし", moves.filter((m) => m.kind === "ability" && !m.text));

writeFileSync(join(DIR, "cards.json"), JSON.stringify(cards, null, 1));
writeFileSync(join(DIR, "moves.json"), JSON.stringify(moves, null, 1));
writeFileSync(
  join(DIR, "SOURCE.json"),
  JSON.stringify({ url: LIST_URL, data: `${jsonBase}?version=${version}`, version, extractedAt: new Date().toISOString() }, null, 2),
);

const bySet = new Map<string, number>();
for (const c of cards) bySet.set(c.set, (bySet.get(c.set) ?? 0) + 1);
console.log(`カード ${cards.length} 枚（ポケモン ${cards.filter(isPokemon).length} / トレーナーズ ${cards.filter((c) => !isPokemon(c)).length}）`);
console.log(`ワザ ${moves.filter((m) => m.kind === "attack").length} / 特性 ${moves.filter((m) => m.kind === "ability").length}`);
console.log(`収録パック ${[...bySet].map(([k, n]) => `${k}:${n}`).join(" ")}`);
console.log(report.length ? `欠け:\n${report.map((r) => `  △ ${r}`).join("\n")}` : "欠けなし");
