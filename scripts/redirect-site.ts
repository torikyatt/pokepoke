// 引っ越し後に、古いURL（GitHub Pages）に来た人を新しいサイトへ送るページを作る。
//   NEW_SITE_URL=https://example.com npx tsx scripts/redirect-site.ts  → dist-redirect/ に index.html と 404.html
// # 以降（#/card/… のカード・#/share/… の共有デッキ）はそのまま引き継ぐので、前に共有したリンクも開ける
import { mkdirSync, writeFileSync } from "node:fs";

const raw = process.env.NEW_SITE_URL?.trim();
if (!raw || !/^https:\/\/[^\s"'<>]+$/.test(raw)) {
  console.error("NEW_SITE_URL に https:// から始まる新しいサイトのURLを入れてください");
  process.exit(1);
}
const url = raw.replace(/\/+$/, "") + "/";
const js = JSON.stringify(url);

const html = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<link rel="canonical" href="${url}">
<title>POKÉPOKE INDECKS に引っ越しました</title>
<script>location.replace(${js} + location.hash);</script>
<noscript><meta http-equiv="refresh" content="0; url=${url}"></noscript>
<style>
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #e8edf3; color: #3d4757;
         font: 15px/1.7 system-ui, -apple-system, "Hiragino Sans", sans-serif; text-align: center; padding: 16px; box-sizing: border-box; }
  a { color: #1f8fbf; font-weight: 800; }
</style>
</head>
<body>
<main>
  <p><b>POKÉPOKE LAB は「POKÉPOKE INDECKS」になり、新しいアドレスに引っ越しました。</b><br>自動で移動しない場合は、こちらを開いてください。</p>
  <p>POKÉPOKE LAB is now POKÉPOKE INDECKS and has moved. If you are not redirected, open the new site:</p>
  <p><a id="go" href="${url}">${url}</a></p>
</main>
<script>document.getElementById("go").href = ${js} + location.hash;</script>
</body>
</html>
`;

mkdirSync("dist-redirect", { recursive: true });
writeFileSync("dist-redirect/index.html", html);
writeFileSync("dist-redirect/404.html", html); // /pokepoke/ 以下のどのURLに来ても同じく送る
console.log(`転送ページを作りました → ${url}`);
