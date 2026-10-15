// 共有リンクのページ（デッキ /d/…・リスト /l/…）で共通の部分。
// アプリは # 以降で画面を切り替えるので、LINE・X・Discord などのリンクのプレビューからはトップページしか見えない。
// そこで、トップページ（index.html）のタイトル・説明・プレビュー用のタグを、その共有のものに差し替えて返す。
// サムネはトップページと同じサイトのアイコン。人が開くと、index.html の起動スクリプトがアプリの画面に切り替える

interface Assets {
  fetch(input: Request | string | URL): Promise<Response>;
}
export interface ShareCtx {
  request: Request;
  env: { ASSETS: Assets };
}
/** カードID（絵柄違いの収録IDも）→ [主役らしさ, 日本語名, 英語名]。ビルドで作る /deck-cards.json（scripts/seo-pages.ts） */
export type CardRow = [number, string, string];

export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export const cut = (s: string, n: number) => ([...s].length > n ? `${[...s].slice(0, n - 1).join("")}…` : s);

/** 共有の名前: URL エンコードを戻し、制御文字を除いて短くする */
export function shareName(raw: string): string {
  let name = raw;
  try {
    name = decodeURIComponent(raw);
  } catch {
    /* そのまま */
  }
  return cut(name.replace(/[\u0000-\u001f\u007f]/g, "").trim(), 40);
}

export async function cardRows(env: ShareCtx["env"], url: URL): Promise<Record<string, CardRow>> {
  try {
    return await (await env.ASSETS.fetch(new URL("/deck-cards.json", url))).json();
  } catch {
    return {}; // カードが分からなくても、タイトルだけは出す
  }
}

/** トップページに、共有のタイトル・説明を書き足して返す。共有は数かぎりなく作れるので、検索エンジンには載せない */
export async function sharePage(top: Response, { url, lang, title, desc }: { url: URL; lang: "ja" | "en"; title: string; desc: string }): Promise<Response> {
  const head = [
    `<base href="/">`,
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(desc)}">`,
    `<meta name="robots" content="noindex">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="POKÉPOKE INDECKS">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(desc)}">`,
    `<meta property="og:url" content="${esc(url.href)}">`,
    // サムネはカードの画像ではなく、トップページと同じサイトのアイコン
    `<meta property="og:image" content="${esc(new URL("/icons/icon-512.png", url).href)}">`,
    `<meta name="twitter:card" content="summary">`,
  ].join("\n    ");
  const html = (await top.text())
    .replace(/\s*<title>[\s\S]*?<\/title>/, "")
    .replace(/\s*<meta name="description"[^>]*>/, "")
    .replace(/\s*<link rel="canonical"[^>]*>/, "")
    .replace(/\s*<meta (?:property="og:|name="twitter:)[^>]*>/g, "")
    .replace(/<html lang="[^"]*">/, `<html lang="${lang}">`)
    // 文字コードの指定より後ろに入れる
    .replace(/<meta charset="[^"]*"\s*\/?>/, (m) => `${m}\n    ${head}`);
  // トップページの応答のヘッダー（CSP など）をそのまま使う
  const headers = new Headers(top.headers);
  headers.delete("Content-Length");
  headers.delete("ETag");
  headers.set("Cache-Control", "public, max-age=0, must-revalidate");
  return new Response(html, { status: 200, headers });
}
