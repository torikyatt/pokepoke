// GET /api/report?key=合言葉[&days=30][&sort=time][&format=tsv]   sort=time で新しい順（ふだんは回数順） … 集めた検索ワードの集計（サイトの持ち主が見る用）
//   合言葉は Cloudflare Pages の設定の REPORT_KEY。設定していなければ、このページは無い（404）
//   ・お問い合わせ            … 設定画面のフォームから（新しい順。メールが送れたかも出す）
//   ・誤りの報告              … カード詳細の左上のボタンから送られたもの（新しい順・画像つき）
//   ・辞書で読めなかった言葉    … 検索文の中で読めなかった部分（ほかの言葉で当たっていても）。辞書に足す候補
//   ・0件だった検索            … 辞書に無い言い回しか、条件に合うカードが無いか
//   ・よく探される言葉
//   ・カードが開かれなかった検索 … 参考。試しに探しただけ・合うカードが少なかっただけのことも多く、結果の誤りとは限らない
import { CONTACT_CATEGORIES, ensure, REPORT_CATEGORIES, type Ctx } from "../../server/search-db.ts";

interface Row {
  q: string;
  lang: string;
  n: number;
  opened: number;
  hits: number | null;
  last: string;
}

interface Contact {
  id: number;
  at: string;
  name: string;
  email: string;
  category: string;
  body: string;
  lang: string;
  mailed: string;
}

interface Report {
  id: number;
  at: string;
  card: string;
  category: string;
  body: string;
  lang: string;
  images: number;
}

interface Miss {
  term: string;
  lang: string;
  n: number;
  q: string | null;
  last: string;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const HEAD = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };
/** 最後に探された日時を日本時間で（時刻の無い古い行は日付だけ） */
const when = (last: string) =>
  last.length <= 10 ? last.slice(5).split("-").map(Number).join("/") : new Date(last).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

export async function onRequestGet({ request, env }: Ctx) {
  const url = new URL(request.url);
  if (!env.REPORT_KEY || url.searchParams.get("key") !== env.REPORT_KEY) return new Response("Not found", { status: 404, headers: HEAD });
  if (!env.DB) return new Response("データベース（DB）が結びついていません", { status: 503, headers: { ...HEAD, "Content-Type": "text/plain; charset=utf-8" } });
  const days = Math.max(1, Math.min(365, Number(url.searchParams.get("days")) || 30));
  const since = new Date(Date.now() - (days - 1) * 86400000).toISOString().slice(0, 10);
  const byTime = url.searchParams.get("sort") === "time";
  await ensure(env.DB);
  const { results: rows } = await env.DB.prepare(
    `SELECT q, lang, SUM(n) AS n, SUM(opened) AS opened, COALESCE(MAX(last), MAX(day)) AS last,
       (SELECT hits FROM searches t WHERE t.q = s.q AND t.lang = s.lang AND t.hits IS NOT NULL AND t.day >= ? ORDER BY t.day DESC LIMIT 1) AS hits
     FROM searches s WHERE day >= ? GROUP BY q, lang HAVING SUM(n) > 0 ORDER BY ${byTime ? "last DESC, n DESC" : "n DESC, last DESC"} LIMIT 2000`,
  )
    .bind(since, since)
    .all<Row>();

  const { results: misses } = await env.DB.prepare(
    `SELECT term, lang, SUM(n) AS n, COALESCE(MAX(last), MAX(day)) AS last,
       (SELECT q FROM misses t WHERE t.term = m.term AND t.lang = m.lang AND t.day >= ? ORDER BY t.day DESC LIMIT 1) AS q
     FROM misses m WHERE day >= ? GROUP BY term, lang ORDER BY ${byTime ? "last DESC, n DESC" : "n DESC, last DESC"} LIMIT 500`,
  )
    .bind(since, since)
    .all<Miss>();

  const { results: contacts } = await env.DB.prepare("SELECT id, at, name, email, category, body, lang, mailed FROM contacts WHERE at >= ? ORDER BY id DESC LIMIT 200")
    .bind(since)
    .all<Contact>();
  const { results: reports } = await env.DB.prepare("SELECT id, at, card, category, body, lang, images FROM reports WHERE at >= ? ORDER BY id DESC LIMIT 200")
    .bind(since)
    .all<Report>();

  const zero = rows.filter((r) => r.hits === 0);
  const unopened = rows.filter((r) => (r.hits ?? 0) > 0 && r.opened === 0);
  const top = rows.slice(0, 200);
  const topTitle = byTime ? "最近の検索" : "よく探される言葉";
  const tsv = (rs: Row[]) => rs.map((r) => [r.q, r.lang, r.n, r.hits ?? "", r.opened, when(r.last)].join("\t")).join("\n");
  const missTsv = misses.map((m) => [m.term, m.lang, m.n, m.q ?? "", when(m.last)].join("\t")).join("\n");
  const reportTsv = reports.map((r) => [when(r.at), r.card, REPORT_CATEGORIES[r.category] ?? r.category, r.body.replace(/\s+/g, " "), r.images ? `画像${r.images}枚` : ""].join("\t")).join("\n");
  const contactTsv = contacts.map((c) => [`#${c.id}`, when(c.at), CONTACT_CATEGORIES[c.category] ?? c.category, c.body.replace(/\s+/g, " ")].join("\t")).join("\n");
  const all = `# 検索ワード（直近${days}日・${since}〜）\n## お問い合わせ（番号\t日時\t種類\t内容。名前・メールアドレスは除く）\n${contactTsv}\n## 誤りの報告（日時\t対象カード\t種類\t内容\t画像）\n${reportTsv}\n## 辞書で読めなかった言葉（言葉\t言語\t回数\t例の検索文\t最後）\n${missTsv}\n# 以下は 言葉\t言語\t回数\t件数\t開いた回数\t最後\n## 0件だった検索\n${tsv(zero)}\n## ${topTitle}\n${tsv(top)}\n## カードが開かれなかった検索（参考。結果の誤りとは限らない）\n${tsv(unopened)}\n`;
  if (url.searchParams.get("format") === "tsv") return new Response(all, { headers: { ...HEAD, "Content-Type": "text/plain; charset=utf-8" } });

  const total = rows.reduce((s, r) => s + r.n, 0);
  // 期間・並べ方の切り替え（もう一方の指定はそのまま）
  const link = (p: { days?: number; sort?: string }, text: string, on: boolean) =>
    `<a class="${on ? "on" : ""}" href="?key=${encodeURIComponent(env.REPORT_KEY!)}&days=${p.days ?? days}&sort=${p.sort ?? (byTime ? "time" : "count")}">${text}</a>`;
  const table = (title: string, note: string, rs: Row[]) => `
<section><h2>${title} <small>${rs.length}語</small></h2><p class="note">${note}</p>
${rs.length ? `<table><thead><tr><th>言葉</th><th>回数</th><th>件数</th><th>開いた</th><th>最後</th></tr></thead><tbody>${rs
    .map((r) => `<tr><td>${esc(r.q)}${r.lang === "en" ? ' <span class="en">EN</span>' : ""}</td><td>${r.n}</td><td>${r.hits ?? "-"}</td><td>${r.opened}</td><td class="t">${when(r.last)}</td></tr>`)
    .join("")}</tbody></table>` : '<p class="note">まだありません</p>'}</section>`;
  const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>検索ワードの集計｜POKÉPOKE INDECKS</title>
<style>
body{margin:0;background:#e6ecf3;color:#3d4757;font:14px/1.6 system-ui,-apple-system,"Hiragino Sans","Yu Gothic UI",sans-serif}
main{max-width:760px;margin:0 auto;padding:16px}
h1{font-size:18px;margin:8px 0}h2{font-size:15px;margin:0 0 4px}small,.note{color:#8794a7;font-size:12px}
section{background:#eef2f7;border-radius:18px;padding:14px 16px;margin:12px 0;box-shadow:4px 4px 10px rgb(176 189 206/.5),-4px -4px 10px #fff}
table{width:100%;border-collapse:collapse;font-size:13px}th,td{padding:4px 6px;border-bottom:1px solid #d5dde7;text-align:right}
th:first-child,td:first-child{text-align:left;word-break:break-all}th{color:#8794a7;font-size:11px}
.en{font-size:10px;color:#22998b;font-weight:700}
td.ex{text-align:left;color:#8794a7;font-size:12px;word-break:break-all}
td.t{color:#8794a7;font-size:11px;white-space:nowrap}
.rep{border-top:1px solid #d5dde7;padding:8px 0}.rep:first-of-type{border-top:0}
.rh{display:flex;flex-wrap:wrap;gap:6px;align-items:baseline}.rh .t{margin-left:auto;color:#8794a7;font-size:11px}
.cat{font-size:11px;font-weight:700;color:#fff;background:#22998b;border-radius:999px;padding:1px 8px}
.rb{margin:4px 0 0;white-space:pre-wrap;word-break:break-all}
.imgs{display:flex;gap:6px;margin-top:6px}.imgs img{width:88px;height:88px;object-fit:cover;border-radius:8px;background:#d5dde7}
nav a.on{background:#22998b;color:#fff}
nav{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
nav a,button{font:inherit;font-size:12px;font-weight:700;color:#22998b;background:#eef2f7;border:0;border-radius:999px;padding:6px 12px;text-decoration:none;cursor:pointer;box-shadow:2px 2px 5px rgb(176 189 206/.6),-2px -2px 5px #fff}
</style></head><body><main>
<h1>検索ワードの集計</h1>
<p class="note">直近${days}日（${since}〜）・${rows.length}語・のべ${total}回・${byTime ? "新しい順" : "回数順"}。「件数」は最後に探されたときの当たった数、「最後」は最後に探された日時（日本時間）。</p>
<nav>${[7, 30, 90].map((d) => link({ days: d }, `${d}日`, d === days)).join("")}
${link({ sort: "count" }, "回数順", !byTime)}${link({ sort: "time" }, "新しい順", byTime)}
<button type="button" id="copy">全部をコピー（Claude に渡す用）</button><span id="done" class="note"></span></nav>
<section><h2>お問い合わせ <small>${contacts.length}件</small></h2><p class="note">設定画面のフォームから（新しい順）。メールの「通知」は contact@ へ、「受付」は送り主への自動返信が送れたか</p>
${contacts.length ? contacts
    .map((c) => `<div class="rep"><div class="rh"><b>#${String(c.id).padStart(4, "0")}</b><span class="cat">${esc(CONTACT_CATEGORIES[c.category] ?? c.category)}</span>${c.lang === "en" ? '<span class="en">EN</span>' : ""}<span>${esc(c.name || "（名前なし）")}</span><a href="mailto:${esc(c.email)}">${esc(c.email)}</a><span class="t">${when(c.at)}</span></div>
<p class="rb">${esc(c.body)}</p><p class="note">メール: ${c.mailed.includes("notify") ? "通知○" : "通知×"} ・ ${c.mailed.includes("confirm") ? "受付○" : "受付×"}</p></div>`)
    .join("") : '<p class="note">まだありません</p>'}</section>
<section><h2>誤りの報告 <small>${reports.length}件</small></h2><p class="note">カード詳細の左上のボタンから送られたもの（新しい順）。画像はタップで大きく</p>
${reports.length ? reports
    .map((r) => `<div class="rep"><div class="rh"><b>${esc(r.card || "（カードの指定なし）")}</b><span class="cat">${esc(REPORT_CATEGORIES[r.category] ?? r.category)}</span>${r.lang === "en" ? '<span class="en">EN</span>' : ""}<span class="t">${when(r.at)}</span></div>
${r.body ? `<p class="rb">${esc(r.body)}</p>` : ""}${r.images ? `<div class="imgs">${Array.from({ length: r.images }, (_, i) => { const src = `/api/report-image?key=${encodeURIComponent(env.REPORT_KEY!)}&id=${r.id}&i=${i}`; return `<a href="${src}" target="_blank" rel="noreferrer"><img src="${src}" loading="lazy" alt="添付画像${i + 1}"></a>`; }).join("")}</div>` : ""}</div>`)
    .join("") : '<p class="note">まだありません</p>'}</section>
<section><h2>辞書で読めなかった言葉 <small>${misses.length}語</small></h2><p class="note">検索文の中で読めなかった部分（ほかの言葉で当たって結果が出ていても）。辞書に足す言い回しの候補</p>
${misses.length ? `<table><thead><tr><th>言葉</th><th>回数</th><th>例の検索文</th><th>最後</th></tr></thead><tbody>${misses
    .map((m) => `<tr><td>${esc(m.term)}${m.lang === "en" ? ' <span class="en">EN</span>' : ""}</td><td>${m.n}</td><td class="ex">${esc(m.q ?? "")}</td><td class="t">${when(m.last)}</td></tr>`)
    .join("")}</tbody></table>` : '<p class="note">まだありません</p>'}</section>
${table("0件だった検索", "辞書に無い言い回しか、条件に合うカードがそもそも無いか", zero)}
${table(topTitle, byTime ? "新しい順・200語" : "回数の多い順・200語", top)}
${table("カードが開かれなかった検索", "参考。試しに探しただけ・合うカードが少なかっただけのことも多く、結果の誤りとは限らない。読めなかった言葉と合わせて見る", unopened)}
<textarea id="tsv" hidden>${esc(all)}</textarea>
<script>document.getElementById("copy").onclick=async()=>{await navigator.clipboard.writeText(document.getElementById("tsv").value);document.getElementById("done").textContent="コピーしました";};</script>
</main></body></html>`;
  return new Response(html, { headers: { ...HEAD, "Content-Type": "text/html; charset=utf-8" } });
}
