// POST /api/q … 検索ワードを1件記録する（src/search-log.ts から送られる）
//   { q, hits, where, lang }   … その言葉で探して hits 件当たった
//   { q, open: 1, lang }       … その言葉の結果からカードを開いた
// データベースが結びついていなければ、何もせずに 204 を返す
import { ensure, type Ctx } from "../../server/search-db.ts";

const none = (status = 204) => new Response(null, { status, headers: { "Cache-Control": "no-store" } });

export async function onRequestPost({ request, env }: Ctx) {
  if (!env.DB) return none();
  // ほかのサイトから送られたものは受けない
  const origin = request.headers.get("Origin");
  if (origin && new URL(origin).host !== new URL(request.url).host) return none(403);
  const text = await request.text();
  if (text.length > 1000) return none(413);
  let body: { q?: unknown; hits?: unknown; open?: unknown; lang?: unknown };
  try {
    body = JSON.parse(text);
  } catch {
    return none(400);
  }
  const q = typeof body.q === "string" ? body.q.replace(/\s+/g, " ").trim() : "";
  // 空・長すぎる・個人の情報かもしれない言葉（メール・URL・長い数字）は残さない
  if (!q || q.length > 60 || /@|https?:|www\.|\d{5,}/i.test(q)) return none(400);
  const lang = body.lang === "en" ? "en" : "ja";
  const day = new Date().toISOString().slice(0, 10);
  await ensure(env.DB);
  if (body.open === 1) {
    await env.DB.prepare("INSERT INTO searches (day, q, lang, n, opened) VALUES (?, ?, ?, 0, 1) ON CONFLICT (day, q, lang) DO UPDATE SET opened = opened + 1")
      .bind(day, q, lang)
      .run();
  } else {
    const hits = typeof body.hits === "number" && Number.isFinite(body.hits) ? Math.max(0, Math.min(99999, Math.round(body.hits))) : null;
    await env.DB.prepare("INSERT INTO searches (day, q, lang, n, hits) VALUES (?, ?, ?, 1, ?) ON CONFLICT (day, q, lang) DO UPDATE SET n = n + 1, hits = excluded.hits")
      .bind(day, q, lang, hits)
      .run();
  }
  return none();
}
