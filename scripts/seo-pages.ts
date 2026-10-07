// 検索エンジン（Google など）に載せるための、カードごとのページ・サイトマップ・robots.txt を作る。
//   dist/card/<ID>.html      日本語のカードページ（/card/<ID>）
//   dist/en/card/<ID>.html   英語のカードページ（/en/card/<ID>）
//   dist/sitemap.xml         全ページの一覧（日本語・英語の対応つき）
//   dist/robots.txt          /api/ は載せない・サイトマップの場所
//   dist/_redirects          以前の共有リンク（/c/<ID>）を /card/<ID> へ
//   dist/deck-cards.json     デッキの共有リンクのページ（server/deck-page.ts）で使う、カードの名前
// アプリは URL の # 以降で画面を切り替えるので、検索エンジンからはトップページしか見えない。そこで、
// アプリと同じ index.html に、そのカードの中身（効果・進化ライン・相性のいいカード・収録）を最初から書いたページを置く。
// 人が開くと、index.html の起動スクリプトが /#/card/<ID> に切り替え、アプリのカード詳細が開く（中身はアプリが描き直す）
//   SITE_URL（既定 https://pokepokeindex.com）: 正規の URL・画像は絶対 URL で書く
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createSynergy } from "../src/synergy.ts";
import type { AppAttack, AppCard, AppData, AppEffect, EnergyType } from "../src/types.ts";
import { KIND_EN, KIND_JA, STAGE_EN, STAGE_JA, TYPE_EN, TYPE_JA } from "../src/types.ts";

const ROOT = join(import.meta.dirname, "..");
const DIST = join(ROOT, "dist");
const SITE = (process.env.SITE_URL ?? "https://pokepokeindex.com").replace(/\/+$/, "");
const data: AppData = JSON.parse(readFileSync(join(ROOT, "src/data/app-data.json"), "utf8"));
const synergy = createSynergy(data);
const template = readFileSync(join(DIST, "index.html"), "utf8");
const setNameJa = new Map(data.sets.map((s) => [s.code, s.nameJa || s.name]));
const setNameEn = new Map(data.sets.map((s) => [s.code, s.name]));
const day = data.builtAt.slice(0, 10);

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const cut = (s: string, n: number) => ([...s].length > n ? `${[...s].slice(0, n - 1).join("")}…` : s);
type L = "ja" | "en";
const url = (c: AppCard, l: L) => `${SITE}${l === "en" ? "/en" : ""}/card/${c.id}`;
const path = (c: AppCard, l: L) => `${l === "en" ? "/en" : ""}/card/${c.id}`;
const name = (c: AppCard, l: L) => (l === "en" ? c.nameEn : c.nameJa || c.nameEn);
const effName = (e: AppEffect, l: L) => (l === "en" ? e.nameEn ?? e.nameJa : e.nameJa ?? e.nameEn) ?? "";
const effText = (e: AppEffect, l: L) => (l === "en" ? e.textEn ?? e.textJa : e.textJa ?? e.textEn) ?? "";
const typeName = (t: EnergyType, l: L) => (l === "en" ? TYPE_EN[t] : TYPE_JA[t]);
const cost = (a: AppAttack, l: L) =>
  (Object.entries(a.cost) as [EnergyType, number][]).flatMap(([t, n]) => Array<string>(n).fill(l === "en" ? TYPE_EN[t][0] : TYPE_JA[t][0])).join("") || (l === "en" ? "Free" : "なし");
const dmg = (a: AppAttack) => (a.damage !== undefined ? `${a.damage}${a.damageVariable ? (/for each/i.test(a.textEn ?? "") ? "×" : "+") : ""}` : "");
const image = (c: AppCard, l: L) => `${SITE}/${l === "ja" && c.imageJa && !/^https?:/.test(c.imageJa) ? c.imageJa : c.image}`;

const T = {
  ja: {
    title: (c: AppCard) => `${name(c, "ja")}（${c.id.toUpperCase()}）の効果・相性のいいカード｜ポケポケ POKÉPOKE INDECKS`,
    desc: (c: AppCard, top: string[]) =>
      `ポケポケ（Pokémon TCG Pocket）「${name(c, "ja")}」の${c.ability ? "特性・" : ""}${c.attacks.length ? "ワザ" : "効果"}と、相性のいいカード${top.length ? `（${top.slice(0, 3).join("・")}など）` : ""}・進化ライン・収録パックをまとめています。`,
    type: "タイプ", hp: "HP", weak: "弱点", retreat: "にげる", ability: "特性", attack: "ワザ", effect: "効果", evo: "進化ライン", partners: "相性のいいカード", prints: "収録",
    open: "POKÉPOKE INDECKS でこのカードを開く", crumb: "カード図鑑", none: "なし",
  },
  en: {
    title: (c: AppCard) => `${name(c, "en")} (${c.id.toUpperCase()}) – Effects & Best Partners | Pokémon TCG Pocket | POKÉPOKE INDECKS`,
    desc: (c: AppCard, top: string[]) =>
      `${name(c, "en")} in Pokémon TCG Pocket: ${c.ability ? "ability, " : ""}${c.attacks.length ? "attacks" : "effect"}, best partner cards${top.length ? ` (${top.slice(0, 3).join(", ")} and more)` : ""}, evolution line and where to get it.`,
    type: "Type", hp: "HP", weak: "Weakness", retreat: "Retreat", ability: "Ability", attack: "Attack", effect: "Effect", evo: "Evolution line", partners: "Good partners", prints: "Printings",
    open: "Open this card in POKÉPOKE INDECKS", crumb: "Card dex", none: "None",
  },
};

const STYLE = `<style>
.seo{max-width:760px;margin:0 auto;padding:16px;color:#3d4757;font:15px/1.7 system-ui,-apple-system,"Hiragino Sans","Yu Gothic UI",sans-serif}
.seo a{color:#22998b}.seo nav{font-size:12px;margin-bottom:8px}.seo .top{display:flex;gap:16px;align-items:flex-start}
.seo img.card{width:180px;max-width:42%;height:auto;border-radius:10px}.seo h1{font-size:22px;margin:0 0 4px}.seo h2{font-size:16px;margin:20px 0 6px}
.seo .meta{font-size:13px;color:#677385}.seo .eff{background:#eef2f7;border-radius:14px;padding:10px 14px;margin:8px 0}.seo .eff b{font-size:15px}
.seo ul{padding-left:20px;margin:4px 0}.seo li{margin:2px 0}.seo small{color:#8794a7}
</style>`;

function body(c: AppCard, l: L): { html: string; top: string[] } {
  const t = T[l];
  const parts: string[] = [];
  const meta =
    c.kind === "pokemon"
      ? [c.type && `${t.type}: ${typeName(c.type, l)}`, c.stage && (l === "en" ? STAGE_EN[c.stage] : STAGE_JA[c.stage]), c.hp && `${t.hp} ${c.hp}`, c.weakness && `${t.weak}: ${typeName(c.weakness, l)}`, c.retreat !== undefined && `${t.retreat}: ${c.retreat}`]
      : [l === "en" ? KIND_EN[c.kind] : KIND_JA[c.kind]];
  parts.push(`<nav><a href="/">POKÉPOKE INDECKS</a> › ${t.crumb}</nav>`);
  parts.push(
    `<div class="top"><img class="card" src="${esc(image(c, l).slice(SITE.length))}" alt="${esc(name(c, l))}" width="367" height="512"><div><h1>${esc(name(c, l))}</h1><p class="meta">${esc(l === "en" ? c.nameJa || "" : c.nameEn)} ・ ${c.id.toUpperCase()}</p><p class="meta">${esc(meta.filter(Boolean).join(" ・ "))}</p></div></div>`,
  );
  if (c.ability) parts.push(`<div class="eff"><b>${t.ability}「${esc(effName(c.ability, l))}」</b><p>${esc(effText(c.ability, l))}</p></div>`);
  for (const a of c.attacks)
    parts.push(`<div class="eff"><b>${t.attack}「${esc(effName(a, l))}」</b> <small>${esc(cost(a, l))}${dmg(a) ? ` ・ ${dmg(a)}` : ""}</small>${effText(a, l) ? `<p>${esc(effText(a, l))}</p>` : ""}</div>`);
  if (c.text) parts.push(`<div class="eff"><b>${t.effect}</b><p>${esc(effText(c.text, l))}</p></div>`);
  // 進化ライン（2枚以上のとき）
  const line = synergy.evolutionLine(c);
  if (line.reduce((n, lv) => n + lv.cards.length, 0) > 1)
    parts.push(
      `<h2>${t.evo}</h2><ul>${line
        .map((lv) => `<li>${esc(lv.stage ? (l === "en" ? STAGE_EN[lv.stage] : STAGE_JA[lv.stage]) : lv.label)}: ${lv.cards.map((x) => (x.id === c.id ? `<b>${esc(name(x, l))}</b>` : `<a href="${path(x, l)}">${esc(name(x, l))}</a>`) + ` <small>${x.id.toUpperCase()}</small>`).join(l === "en" ? ", " : "・")}</li>`)
        .join("")}</ul>`,
    );
  // 相性のいいカード（理由つき）
  const partners = synergy.partners(c, 12);
  if (partners.length)
    parts.push(
      `<h2>${t.partners}</h2><ul>${partners.map((p) => `<li><a href="${path(p.card, l)}">${esc(name(p.card, l))}</a>${(l === "en" ? p.reasonsEn : p.reasons)[0] ? ` <small>— ${esc((l === "en" ? p.reasonsEn : p.reasons)[0])}</small>` : ""}</li>`).join("")}</ul>`,
    );
  // 収録
  parts.push(
    `<h2>${t.prints}</h2><ul>${c.prints
      .map((p) => `<li>${esc((l === "en" ? setNameEn : setNameJa).get(p.set) ?? p.setName)}${p.pack && l === "ja" ? `（${esc(p.pack)}）` : ""} ${p.id.toUpperCase()} ${esc(p.rarity)}</li>`)
      .join("")}</ul>`,
  );
  parts.push(`<p><a href="/#/card/${c.id}">${t.open}</a></p>`);
  return { html: `<main class="seo" lang="${l}">${parts.join("\n")}</main>`, top: partners.map((p) => name(p.card, l)) };
}

function page(c: AppCard, l: L): string {
  const t = T[l];
  const { html, top } = body(c, l);
  const title = t.title(c);
  const desc = cut(t.desc(c, top), 160);
  const head = [
    `<base href="/">`,
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(desc)}">`,
    `<link rel="canonical" href="${url(c, l)}">`,
    `<link rel="alternate" hreflang="ja" href="${url(c, "ja")}">`,
    `<link rel="alternate" hreflang="en" href="${url(c, "en")}">`,
    `<link rel="alternate" hreflang="x-default" href="${url(c, "ja")}">`,
    `<meta property="og:type" content="article">`,
    `<meta property="og:site_name" content="POKÉPOKE INDECKS">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(desc)}">`,
    `<meta property="og:url" content="${url(c, l)}">`,
    `<meta property="og:image" content="${esc(image(c, l))}">`,
    `<meta name="twitter:card" content="summary">`,
    STYLE,
  ].join("\n    ");
  // トップページ用のタイトル・説明・正規URLを外してから、このカードのものを入れる
  return template
    .replace(/\s*<title>[\s\S]*?<\/title>/, "")
    .replace(/\s*<meta name="description"[^>]*>/, "")
    .replace(/\s*<link rel="canonical"[^>]*>/, "")
    .replace(/<html lang="[^"]*">/, `<html lang="${l}">`)
    .replace("<head>", `<head>\n    ${head}`)
    .replace('<div id="root"></div>', `<div id="root">${html}</div>`);
}

let n = 0;
for (const l of ["ja", "en"] as const) {
  const dir = join(DIST, l === "en" ? "en/card" : "card");
  mkdirSync(dir, { recursive: true });
  for (const c of data.cards) {
    writeFileSync(join(dir, `${c.id}.html`), page(c, l));
    n++;
  }
}

// サイトマップ（日本語・英語の対応つき）
const alt = (c: AppCard) => (["ja", "en"] as const).map((l) => `<xhtml:link rel="alternate" hreflang="${l}" href="${url(c, l)}"/>`).join("");
const urls = [
  `<url><loc>${SITE}/</loc><lastmod>${day}</lastmod></url>`,
  ...data.cards.flatMap((c) => (["ja", "en"] as const).map((l) => `<url><loc>${url(c, l)}</loc><lastmod>${day}</lastmod>${alt(c)}</url>`)),
];
writeFileSync(
  join(DIST, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.join("\n")}\n</urlset>\n`,
);
writeFileSync(join(DIST, "robots.txt"), `User-agent: *\nDisallow: /api/\n\nSitemap: ${SITE}/sitemap.xml\n`);
// デッキの共有リンク（/d/<共有コード>、server/deck-page.ts）のタイトル・説明に使う、カードの名前・主役らしさ
//   主役らしさ: メガシンカex 4・ex 3・2進化 2・ほかのポケモン 1・トレーナーズ 0
const rank = (c: AppCard) => (c.kind !== "pokemon" ? 0 : c.rule === "mega_ex" ? 4 : c.rule === "ex" ? 3 : c.stage === "stage2" ? 2 : 1);
writeFileSync(join(DIST, "deck-cards.json"), JSON.stringify(Object.fromEntries(data.cards.map((c) => [c.id, [rank(c), name(c, "ja"), name(c, "en")]]))));
// 以前の共有リンク（/c/<ID>）は新しいカードページへ
writeFileSync(join(DIST, "_redirects"), `/c/:id /card/:id 301\n`);
console.log(`カードページ ${n} 枚（日本語・英語）・sitemap.xml（${urls.length} URL）・robots.txt・_redirects → dist/`);
