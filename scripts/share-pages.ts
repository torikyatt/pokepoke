// カードの共有用ページ（dist/c/<カードID>.html）を作る。
// X・LINE・Discord などのリンクのプレビューは JavaScript を動かさず、URL の # 以降も見ないので、
// カードごとに「タイトル（カード名）と画像」を書いた小さなページを置き、開いた人はアプリのカード詳細（#/card/<ID>）へ送る。
//   SITE_URL（既定 https://pokepokeindex.com）: プレビューの画像は絶対URLで書く必要がある
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AppData } from "../src/types.ts";

const ROOT = join(import.meta.dirname, "..");
const SITE = (process.env.SITE_URL ?? "https://pokepokeindex.com").replace(/\/+$/, "");
const data: AppData = JSON.parse(readFileSync(join(ROOT, "src/data/app-data.json"), "utf8"));
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const dir = join(ROOT, "dist/c");
mkdirSync(dir, { recursive: true });
for (const c of data.cards) {
  const name = c.nameJa || c.nameEn;
  const title = `${name}｜POKÉPOKE INDECKS`;
  const desc = `${name}（${c.nameEn}）の効果・相性のいいカード・大会での使われ方。ふだんの言葉で引ける、ポケポケ（Pokémon TCG Pocket）のカード図鑑。`;
  // 画像は自前で置いた大きい画像（日本語があれば日本語）
  const img = `${SITE}/${c.imageJa && !/^https?:/.test(c.imageJa) ? c.imageJa : c.image}`;
  const to = `../#/card/${c.id}`;
  writeFileSync(
    join(dir, `${c.id}.html`),
    `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${SITE}/c/${c.id}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="POKÉPOKE INDECKS">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${SITE}/c/${c.id}">
<meta property="og:image" content="${esc(img)}">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:image" content="${esc(img)}">
<link rel="icon" type="image/svg+xml" href="../icons/icon.svg">
<script>location.replace(${JSON.stringify(to)});</script>
<noscript><meta http-equiv="refresh" content="0; url=${to}"></noscript>
</head>
<body><a href="${to}">${esc(name)}</a></body>
</html>
`,
  );
}
console.log(`共有用のカードページ ${data.cards.length} 枚 → dist/c/`);
