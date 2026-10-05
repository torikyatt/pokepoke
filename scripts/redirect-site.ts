// 引っ越し後に、古いURL（GitHub Pages）に来た人に新しいサイトを案内するページを作る（自動では移動せず、ボタンで開いてもらう）。
//   NEW_SITE_URL=https://example.com npx tsx scripts/redirect-site.ts  → dist-redirect/ に index.html と 404.html
// # 以降（#/card/… のカード・#/share/… の共有デッキ）はボタンの行き先に引き継ぐので、前に共有したリンクも開ける
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
<link rel="icon" type="image/svg+xml" href="${url}icons/icon.svg">
<style>
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #e6ecf3; color: #3d4757;
         font: 15px/1.7 system-ui, -apple-system, "Hiragino Sans", "Yu Gothic UI", sans-serif; padding: 16px; box-sizing: border-box; }
  main { box-sizing: border-box; max-width: 420px; width: 100%; background: #eef2f7; border-radius: 24px; padding: 28px 24px; text-align: center;
         box-shadow: 6px 6px 14px rgb(176 189 206 / 0.6), -6px -6px 14px rgb(255 255 255 / 0.9); }
  .logo { font-weight: 800; letter-spacing: 0.06em; font-size: 22px; }
  .logo span { color: #22998b; }
  .sub { font-size: 10px; font-weight: 800; letter-spacing: 0.18em; color: #8794a7; margin-bottom: 18px; }
  p { margin: 0 0 12px; }
  .go { display: block; margin: 20px 0 10px; padding: 14px; border-radius: 999px; color: #fff; font-weight: 800; font-size: 16px; text-decoration: none;
        background: linear-gradient(180deg, #8fdcf2, #5cc6e6); box-shadow: 0 6px 14px rgb(92 198 230 / 0.45); }
  .url { font-size: 13px; font-weight: 700; color: #22998b; word-break: break-all; }
  .note { font-size: 12px; color: #8794a7; margin-top: 16px; }
  .en { font-size: 12px; color: #8794a7; margin-top: 18px; border-top: 1px solid #d5dde7; padding-top: 14px; }
</style>
</head>
<body>
<main>
  <div class="logo">POKÉPOKE IN<span>DECKS</span></div>
  <div class="sub">for Pokémon TCG Pocket</div>
  <p><b>POKÉPOKE LAB は「POKÉPOKE INDECKS」になり、<br>新しいアドレスに引っ越しました。</b></p>
  <p>下のボタンから新しいサイトを開いてください。<br>ブックマークやホーム画面のアイコンも、新しいサイトで登録し直してください。</p>
  <a class="go" id="go" href="${url}">新しいサイトを開く</a>
  <div class="url">${url.replace(/\/$/, "")}</div>
  <p class="note" id="note"></p>
  <p class="en">POKÉPOKE LAB is now POKÉPOKE INDECKS and has moved to a new address. Tap the button above to open the new site.</p>
</main>
<script>
  // ボタンの行き先: 開いていたカード・共有デッキ（# 以降）と、このブラウザに保存してあるデッキ・お気に入り・設定を一緒に渡す
  // （localStorage はサイトごとに別なので、渡さないと新しいサイトでは空になる）
  (function () {
    var d = {}, n = 0, decks = 0;
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf("pokepoke.") === 0 && k !== "pokepoke.nav") { d[k] = localStorage.getItem(k); n++; }
      }
      decks = JSON.parse(d["pokepoke.decks"] || "{}").state.decks.length;
    } catch (e) {}
    var to = n ? "#move=" + btoa(unescape(encodeURIComponent(JSON.stringify(d)))).replace(/\\+/g, "-").replace(/\\//g, "_").replace(/=+$/, "") + "&to=" + encodeURIComponent(location.hash) : location.hash;
    document.getElementById("go").href = ${js} + to;
    if (decks) document.getElementById("note").textContent = "このブラウザに保存しているデッキ（" + decks + "個）とお気に入りも、新しいサイトに引き継がれます。";
  })();
</script>
</body>
</html>
`;

mkdirSync("dist-redirect", { recursive: true });
writeFileSync("dist-redirect/index.html", html);
writeFileSync("dist-redirect/404.html", html); // /pokepoke/ 以下のどのURLに来ても同じ案内を出す
console.log(`転送ページを作りました → ${url}`);
