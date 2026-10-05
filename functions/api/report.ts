// GET /api/report?key=合言葉[&days=30][&format=tsv] … 集めた検索ワードの集計（サイトの持ち主が見る用）
//   合言葉は Cloudflare Pages の設定の REPORT_KEY。設定していなければ、このページは無い（404）
//   ・0件だった言葉            … 表現辞書に足すべき言い回しの候補
//   ・当たったのに開かれなかった … 結果がずれているかもしれない言葉
//   ・よく探される言葉
import { ensure, type Ctx } from "../../server/search-db.ts";

interface Row {
  q: string;
  lang: string;
  n: number;
  opened: number;
  hits: number | null;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const HEAD = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };

export async function onRequestGet({ request, env }: Ctx) {
  const url = new URL(request.url);
  if (!env.REPORT_KEY || url.searchParams.get("key") !== env.REPORT_KEY) return new Response("Not found", { status: 404, headers: HEAD });
  if (!env.DB) return new Response("データベース（DB）が結びついていません", { status: 503, headers: { ...HEAD, "Content-Type": "text/plain; charset=utf-8" } });
  const days = Math.max(1, Math.min(365, Number(url.searchParams.get("days")) || 30));
  const since = new Date(Date.now() - (days - 1) * 86400000).toISOString().slice(0, 10);
  await ensure(env.DB);
  const { results: rows } = await env.DB.prepare(
    `SELECT q, lang, SUM(n) AS n, SUM(opened) AS opened,
       (SELECT hits FROM searches t WHERE t.q = s.q AND t.lang = s.lang AND t.hits IS NOT NULL AND t.day >= ? ORDER BY t.day DESC LIMIT 1) AS hits
     FROM searches s WHERE day >= ? GROUP BY q, lang HAVING SUM(n) > 0 ORDER BY n DESC, q LIMIT 2000`,
  )
    .bind(since, since)
    .all<Row>();

  const zero = rows.filter((r) => r.hits === 0);
  const unopened = rows.filter((r) => (r.hits ?? 0) > 0 && r.opened === 0);
  const top = rows.slice(0, 200);
  const tsv = (rs: Row[]) => rs.map((r) => [r.q, r.lang, r.n, r.hits ?? "", r.opened].join("\t")).join("\n");
  const all = `# 検索ワード（直近${days}日・${since}〜）\n# 言葉\t言語\t回数\t件数\t開いた回数\n## 0件だった言葉\n${tsv(zero)}\n## 当たったのに開かれなかった言葉\n${tsv(unopened)}\n## よく探される言葉\n${tsv(top)}\n`;
  if (url.searchParams.get("format") === "tsv") return new Response(all, { headers: { ...HEAD, "Content-Type": "text/plain; charset=utf-8" } });

  const total = rows.reduce((s, r) => s + r.n, 0);
  const table = (title: string, note: string, rs: Row[]) => `
<section><h2>${title} <small>${rs.length}語</small></h2><p class="note">${note}</p>
${rs.length ? `<table><thead><tr><th>言葉</th><th>回数</th><th>件数</th><th>開いた</th></tr></thead><tbody>${rs
    .map((r) => `<tr><td>${esc(r.q)}${r.lang === "en" ? ' <span class="en">EN</span>' : ""}</td><td>${r.n}</td><td>${r.hits ?? "-"}</td><td>${r.opened}</td></tr>`)
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
nav{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
nav a,button{font:inherit;font-size:12px;font-weight:700;color:#22998b;background:#eef2f7;border:0;border-radius:999px;padding:6px 12px;text-decoration:none;cursor:pointer;box-shadow:2px 2px 5px rgb(176 189 206/.6),-2px -2px 5px #fff}
</style></head><body><main>
<h1>検索ワードの集計</h1>
<p class="note">直近${days}日（${since}〜）・${rows.length}語・のべ${total}回。「件数」は最後に探されたときの当たった数。</p>
<nav>${[7, 30, 90].map((d) => `<a href="?key=${encodeURIComponent(env.REPORT_KEY!)}&days=${d}">${d}日</a>`).join("")}
<button type="button" id="copy">全部をコピー（Claude に渡す用）</button><span id="done" class="note"></span></nav>
${table("0件だった言葉", "表現辞書に足すべき言い回しの候補", zero)}
${table("当たったのに開かれなかった言葉", "結果がずれているかもしれない言葉", unopened)}
${table("よく探される言葉", "上位200語", top)}
<textarea id="tsv" hidden>${esc(all)}</textarea>
<script>document.getElementById("copy").onclick=async()=>{await navigator.clipboard.writeText(document.getElementById("tsv").value);document.getElementById("done").textContent="コピーしました";};</script>
</main></body></html>`;
  return new Response(html, { headers: { ...HEAD, "Content-Type": "text/html; charset=utf-8" } });
}
