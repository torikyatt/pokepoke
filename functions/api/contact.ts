// POST /api/contact … お問い合わせを1件受け取る（src/components/contact.tsx から）
//   { name, email, category, body, lang, website, turnstile }
//   website は人には見えない入力欄（ロボットよけ。入っていたら受けたふりをして捨てる）
//   turnstile は Cloudflare Turnstile の確認の印。TURNSTILE_SECRET があるときは、Cloudflare に確かめて通ったものだけ受ける
// 1. D1 の contacts 表に残す（集計ページで見る）
// 2. Resend（RESEND_API_KEY があるとき）で noreply@ から2通送る
//    ・contact@ へ: 問い合わせの中身。返信先（Reply-To）は送り主なので、メーラーで返信すれば contact@ から相手に返せる
//    ・送り主へ: 受け付けた知らせ（決まった文面と受付番号だけ。だれでも他人のアドレスを入れられるので、書かれた文は載せない）
//      同じアドレスへは1日3通まで・全体で1日50通まで
import { CONTACT_CATEGORIES, ensure, type Ctx, type Env } from "../../server/search-db.ts";

const json = (status: number, body: object) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
const EMAIL = /^[^\s@<>()",;:]{1,64}@[A-Za-z0-9.-]{1,253}\.[A-Za-z]{2,}$/;
const PER_ADDRESS = 3;
const PER_DAY = 50;

async function sendMail(env: Env, mail: { to: string; subject: string; text: string; replyTo?: string }) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: `POKÉPOKE INDECKS <${env.MAIL_FROM || "noreply@pokepokeindex.com"}>`,
      to: [mail.to],
      subject: mail.subject,
      text: mail.text,
      ...(mail.replyTo ? { reply_to: mail.replyTo } : {}),
    }),
  });
  return res.ok;
}

export async function onRequestPost({ request, env }: Ctx) {
  if (!env.DB) return json(503, { error: "unavailable" });
  const origin = request.headers.get("Origin");
  if (origin && new URL(origin).host !== new URL(request.url).host) return json(403, { error: "forbidden" });
  const text = await request.text();
  if (text.length > 20_000) return json(413, { error: "too large" });
  let b: { name?: unknown; email?: unknown; category?: unknown; body?: unknown; lang?: unknown; website?: unknown; turnstile?: unknown };
  try {
    b = JSON.parse(text);
  } catch {
    return json(400, { error: "bad json" });
  }
  if (typeof b.website === "string" && b.website) return json(200, { ok: true }); // ロボット
  if (env.TURNSTILE_SECRET) {
    const token = typeof b.turnstile === "string" ? b.turnstile : "";
    if (!token || token.length > 4096) return json(403, { error: "verification required" });
    const form = new FormData();
    form.append("secret", env.TURNSTILE_SECRET);
    form.append("response", token);
    const v = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form })
      .then((r) => r.json() as Promise<{ success?: boolean }>)
      .catch(() => ({ success: false }));
    if (!v.success) return json(403, { error: "verification failed" });
  }
  const name = typeof b.name === "string" ? b.name.replace(/[\r\n]+/g, " ").trim().slice(0, 40) : "";
  const email = typeof b.email === "string" ? b.email.trim() : "";
  const category = typeof b.category === "string" && b.category in CONTACT_CATEGORIES ? b.category : "";
  const body = typeof b.body === "string" ? b.body.replace(/\r\n?/g, "\n").trim() : "";
  if (!EMAIL.test(email) || email.length > 254 || !category || !body || [...body].length > 1000) return json(400, { error: "invalid" });
  const lang = b.lang === "en" ? "en" : "ja";
  const now = new Date();
  await ensure(env.DB);
  const { results } = await env.DB.prepare("INSERT INTO contacts (at, name, email, category, body, lang) VALUES (?, ?, ?, ?, ?, ?) RETURNING id")
    .bind(now.toISOString(), name, email, category, body, lang)
    .all<{ id: number }>();
  const id = results[0]?.id ?? 0;
  if (!env.RESEND_API_KEY) return json(200, { ok: true, id });

  const no = `#${String(id).padStart(4, "0")}`;
  const at = now.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
  const cat = CONTACT_CATEGORIES[category];
  const mailed: string[] = [];
  // contact@ へ: 中身（返信先は送り主）
  const notified = await sendMail(env, {
    to: env.MAIL_TO || "contact@pokepokeindex.com",
    replyTo: email,
    subject: `[お問い合わせ ${no}] ${cat}${name ? ` - ${name}` : ""}`,
    text: `受付番号: ${no}\n日時: ${at}\n種類: ${cat}\nお名前: ${name || "（なし）"}\nメール: ${email}\n表示言語: ${lang}\n\n${body}\n`,
  }).catch(() => false);
  if (notified) mailed.push("notify");
  // 送り主へ: 受け付けた知らせ（回数を制限）
  const day = now.toISOString().slice(0, 10);
  const { results: counts } = await env.DB.prepare(
    "SELECT SUM(CASE WHEN lower(email) = lower(?) THEN 1 ELSE 0 END) AS mine, COUNT(*) AS total FROM contacts WHERE at >= ? AND mailed LIKE '%confirm%'",
  )
    .bind(email, day)
    .all<{ mine: number | null; total: number }>();
  const c = counts[0];
  if ((c?.mine ?? 0) < PER_ADDRESS && (c?.total ?? 0) < PER_DAY) {
    const ja = `${name ? `${name} 様\n\n` : ""}POKÉPOKE INDECKS へのお問い合わせを受け付けました。\nお送りいただきありがとうございます。\n\n受付番号: ${no}\n受付日時: ${at}\n種類: ${cat}\n\n内容を確認し、お返事が必要なものには contact@pokepokeindex.com からご連絡します。\nお返事までお時間をいただくことや、内容によってはお返事できないこともございます。あらかじめご了承ください。\n\n※このメールは送信専用のアドレスから自動でお送りしています。このメールに返信いただいても届きませんので、ご了承ください。\n※お心当たりのない場合は、どなたかが誤ってこのアドレスを入力した可能性があります。お手数ですが、このメールは破棄してください。\n\nPOKÉPOKE INDECKS\nhttps://pokepokeindex.com/\n`;
    const en = `Thank you for contacting POKÉPOKE INDECKS. We've received your message.\n\nReference: ${no}\nReceived: ${now.toUTCString()}\n\nWe'll reply from contact@pokepokeindex.com if a response is needed.\n\nThis is an automated message from a send-only address. Replies to this email will not be received.\nIf you didn't submit this, someone may have entered your address by mistake. Please disregard this email.\n\nPOKÉPOKE INDECKS\nhttps://pokepokeindex.com/\n`;
    const confirmed = await sendMail(env, {
      to: email,
      subject: lang === "en" ? `We received your message (${no}) | POKÉPOKE INDECKS` : `お問い合わせを受け付けました（${no}）｜POKÉPOKE INDECKS`,
      text: lang === "en" ? en : ja,
    }).catch(() => false);
    if (confirmed) mailed.push("confirm");
  }
  await env.DB.prepare("UPDATE contacts SET mailed = ? WHERE id = ?").bind(mailed.join(","), id).run();
  return json(200, { ok: true, id });
}
