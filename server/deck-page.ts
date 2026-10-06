// デッキの共有リンク（/d/<共有コード>・/en/d/<共有コード>）のページ。
// アプリは # 以降で画面を切り替えるので、LINE・X・Discord などのリンクのプレビューからはトップページしか見えない。
// そこで、トップページ（index.html）に、デッキ名を頭にしたタイトル・説明・サムネ（デッキの主役のカードの画像）を書き足して返す。
// 人が開くと、index.html の起動スクリプトが /#/share/<共有コード> に切り替え、アプリの共有デッキの画面が開く。
//   カードの名前・画像・主役らしさは、ビルドで作る /deck-cards.json（scripts/seo-pages.ts）から引く
//   共有コードの読み方は src/deck.ts の decodeShare（v2: 「2~エネ~カード~名前」）と同じ

interface Assets {
  fetch(input: Request | string | URL): Promise<Response>;
}
interface DeckCtx {
  request: Request;
  env: { ASSETS: Assets };
}
/** カードID → [主役らしさ, 日本語名, 英語名, 日本語の画像, 英語の画像] */
type CardRow = [number, string, string, string, string];

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const cut = (s: string, n: number) => ([...s].length > n ? `${[...s].slice(0, n - 1).join("")}…` : s);

/** 共有コード（v2）から名前とカード（枚数つき）を読む。読めなければ undefined */
function decode(code: string): { name: string; cards: [string, number][] } | undefined {
  if (!code.startsWith("2~")) return undefined;
  const [, , c = "", ...rest] = code.split("~");
  let name = rest.join("~");
  try {
    name = decodeURIComponent(name);
  } catch {
    /* そのまま */
  }
  // 見出しに入れるので、制御文字を除いて短くする
  name = cut(name.replace(/[\u0000-\u001f\u007f]/g, "").trim(), 40);
  const cards = c
    .split(".")
    .filter(Boolean)
    .slice(0, 40)
    .map((x): [string, number] => {
      const [id, n] = x.split("x");
      return [id, Math.min(20, Math.max(1, Number(n) || 1))];
    })
    .filter(([id]) => /^[a-z0-9-]{1,24}$/.test(id));
  return { name, cards };
}

export async function deckPage({ request, env }: DeckCtx, lang: "ja" | "en"): Promise<Response> {
  const url = new URL(request.url);
  const code = url.pathname.replace(/^\/(?:en\/)?d\//, "").replace(/\/+$/, "");
  const top = await env.ASSETS.fetch(new URL("/", url));
  const deck = decode(code);
  if (!deck || !top.ok) return top;
  let cards: Record<string, CardRow> = {};
  try {
    cards = await (await env.ASSETS.fetch(new URL("/deck-cards.json", url))).json();
  } catch {
    /* カードが分からなくても、タイトルだけは出す */
  }

  const known = deck.cards.filter(([id]) => cards[id]);
  // 主役: ex（メガシンカex）を優先し、同じなら枚数が多いもの、さらに同じなら先に入れたもの
  const key = [...known].sort((a, b) => cards[b[0]][0] - cards[a[0]][0] || b[1] - a[1])[0];
  const nameOf = (id: string) => cards[id][lang === "en" ? 2 : 1];
  const count = deck.cards.reduce((s, [, n]) => s + n, 0);
  // 説明: 主なポケモン（主役らしい順に3枚まで）
  const mains = [...new Set([...known].filter(([id]) => cards[id][0] > 0).sort((a, b) => cards[b[0]][0] - cards[a[0]][0] || b[1] - a[1]).map(([id]) => nameOf(id)))].slice(0, 3);
  const deckName = deck.name || (lang === "en" ? "Shared deck" : "共有デッキ");
  const title = lang === "en" ? `${deckName} – Pokémon TCG Pocket deck | POKÉPOKE INDECKS` : `${deckName}｜ポケポケのデッキ｜POKÉPOKE INDECKS`;
  const desc =
    lang === "en"
      ? `A ${count}-card Pokémon TCG Pocket deck${mains.length ? ` with ${mains.join(", ")}` : ""}. Open it in POKÉPOKE INDECKS to see the cards and copy it to your decks.`
      : `ポケポケ（Pokémon TCG Pocket）の${count}枚のデッキ${mains.length ? `（${mains.join("・")}）` : ""}。POKÉPOKE INDECKS で開くと、カードの一覧を見たり、自分のデッキに取り込んだりできます。`;
  const image = key ? new URL(`/${cards[key[0]][lang === "en" ? 4 : 3]}`, url).href : "";

  const head = [
    `<base href="/">`,
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(desc)}">`,
    // 共有デッキは数かぎりなく作れるので、検索エンジンには載せない
    `<meta name="robots" content="noindex">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="POKÉPOKE INDECKS">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(desc)}">`,
    `<meta property="og:url" content="${esc(url.href)}">`,
    ...(image ? [`<meta property="og:image" content="${esc(image)}">`] : []),
    `<meta name="twitter:card" content="summary">`,
  ].join("\n    ");
  const html = (await top.text())
    .replace(/\s*<title>[\s\S]*?<\/title>/, "")
    .replace(/\s*<meta name="description"[^>]*>/, "")
    .replace(/\s*<link rel="canonical"[^>]*>/, "")
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
