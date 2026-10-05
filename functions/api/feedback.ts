// POST /api/feedback … カードの誤りの報告を1件受け取る（src/components/report-error.tsx から）
//   { card, category, body, lang, images: [JPEG の base64, …] }
//   card: 対象カード（「マタドガス（A1-177）」・書き換えてもよい）/ category: 種類のキー / body: 任意・120字まで / images: 任意・2枚まで
// 誰が送ったか（IPアドレスなど）は残さない。データベースが結びついていなければ 503
import { ensure, REPORT_CATEGORIES, type Ctx } from "../../server/search-db.ts";

const json = (status: number, body: object) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
const MAX_IMAGE = 800_000; // 1枚の大きさ（バイト）。端末で長い辺1280pxのJPEGに縮めてから送る

export async function onRequestPost({ request, env }: Ctx) {
  if (!env.DB) return json(503, { error: "unavailable" });
  // ほかのサイトから送られたものは受けない
  const origin = request.headers.get("Origin");
  if (origin && new URL(origin).host !== new URL(request.url).host) return json(403, { error: "forbidden" });
  const text = await request.text();
  if (text.length > 2_500_000) return json(413, { error: "too large" });
  let b: { card?: unknown; category?: unknown; body?: unknown; lang?: unknown; images?: unknown };
  try {
    b = JSON.parse(text);
  } catch {
    return json(400, { error: "bad json" });
  }
  const card = typeof b.card === "string" ? b.card.replace(/\s+/g, " ").trim().slice(0, 80) : "";
  const category = typeof b.category === "string" && b.category in REPORT_CATEGORIES ? b.category : "";
  const body = typeof b.body === "string" ? b.body.trim() : "";
  if (!category || [...body].length > 120) return json(400, { error: "invalid" });
  const lang = b.lang === "en" ? "en" : "ja";
  // 画像: JPEG だけ（先頭が FF D8 FF）・2枚まで・1枚 800KB まで
  const images: Uint8Array[] = [];
  for (const s of Array.isArray(b.images) ? b.images.slice(0, 2) : []) {
    if (typeof s !== "string" || s.length > (MAX_IMAGE * 4) / 3 + 8) return json(413, { error: "image too large" });
    let bytes: Uint8Array;
    try {
      bytes = Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
    } catch {
      return json(400, { error: "bad image" });
    }
    if (bytes.length > MAX_IMAGE || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return json(400, { error: "bad image" });
    images.push(bytes);
  }
  // 内容・画像は任意。ただし対象カードも内容も画像も無いものは受けない
  if (!card && !body && !images.length) return json(400, { error: "empty" });
  await ensure(env.DB);
  const { results } = await env.DB.prepare("INSERT INTO reports (at, card, category, body, lang, images) VALUES (?, ?, ?, ?, ?, ?) RETURNING id")
    .bind(new Date().toISOString(), card, category, body, lang, images.length)
    .all<{ id: number }>();
  const id = results[0]?.id;
  if (id !== undefined) for (const [i, img] of images.entries()) await env.DB.prepare("INSERT INTO report_images (report_id, idx, data) VALUES (?, ?, ?)").bind(id, i, img).run();
  return json(200, { ok: true });
}
