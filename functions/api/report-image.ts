// GET /api/report-image?key=合言葉&id=報告の番号&i=何枚目 … 誤りの報告に添付された画像（集計ページから見る）
import { ensure, type Ctx } from "../../server/search-db.ts";

export async function onRequestGet({ request, env }: Ctx) {
  const url = new URL(request.url);
  if (!env.REPORT_KEY || url.searchParams.get("key") !== env.REPORT_KEY || !env.DB) return new Response("Not found", { status: 404 });
  await ensure(env.DB);
  const { results } = await env.DB.prepare("SELECT data FROM report_images WHERE report_id = ? AND idx = ?")
    .bind(Number(url.searchParams.get("id")) || 0, Number(url.searchParams.get("i")) || 0)
    .all<{ data: ArrayBuffer | number[] }>();
  const data = results[0]?.data;
  if (!data) return new Response("Not found", { status: 404 });
  return new Response(data instanceof ArrayBuffer ? data : new Uint8Array(data), {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex" },
  });
}
