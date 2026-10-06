// 単一HTML版（dist-single/index.html）を dist/pokepoke.html に置く。Web版からダウンロードできるようにする
import { createHash } from "node:crypto";
import { copyFileSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
copyFileSync(join(ROOT, "dist-single/index.html"), join(ROOT, "dist/pokepoke.html"));
rmSync(join(ROOT, "dist-single"), { recursive: true, force: true });
console.log(`dist/pokepoke.html ${(statSync(join(ROOT, "dist/pokepoke.html")).size / 1e6).toFixed(1)} MB`);

// セキュリティのためのヘッダー（Cloudflare Pages の _headers）。
//   ・ほかのサイトの枠（iframe）に入れさせない／カメラなどは使わない／https だけで開く
//   ・アプリのページ（/ と、検索エンジン用のカードページ /card/*・/en/card/*。中身は同じ index.html）には CSP: 読み込めるのは自分のサイトと、フォント（Google Fonts）・英語画像の予備（GitHub）だけ。
//     index.html の中に直接書いたスクリプトは、中身のハッシュで許す（書き換えたら、ここで計算し直される）
//   デッキ画像の保存（html-to-image）はフォントの CSS とファイルを fetch で読むので、connect-src にも入れる。
//   Cloudflare のアクセス解析（Web Analytics）は Cloudflare がページに足すので、その読み込みと送り先も許す
{
  const html = readFileSync(join(ROOT, "dist/index.html"), "utf8");
  const hashes = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => `'sha256-${createHash("sha256").update(m[1]).digest("base64")}'`);
  const csp = [
    "default-src 'self'",
    `script-src 'self' ${hashes.join(" ")} https://static.cloudflareinsights.com`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob: https://raw.githubusercontent.com",
    "connect-src 'self' data: blob: https://fonts.googleapis.com https://fonts.gstatic.com https://raw.githubusercontent.com https://cloudflareinsights.com",
    "manifest-src 'self'",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
  const headers = `/*
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
  Strict-Transport-Security: max-age=31536000

/
  Content-Security-Policy: ${csp}

/index.html
  Content-Security-Policy: ${csp}

/card/*
  Content-Security-Policy: ${csp}

/en/card/*
  Content-Security-Policy: ${csp}
`;
  writeFileSync(join(ROOT, "dist/_headers"), headers);
  console.log(`dist/_headers（直接書いたスクリプト ${hashes.length} 個を許可）`);
}
