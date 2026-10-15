// デッキの共有リンク（/d/<共有コード>・/en/d/<共有コード>）のページ。デッキ名を頭にしたタイトルと説明を出す（server/share-page.ts）。
// 人が開くと、index.html の起動スクリプトが /#/share/<共有コード> に切り替え、アプリの共有デッキの画面が開く。
//   カードの名前・主役らしさは、ビルドで作る /deck-cards.json（scripts/seo-pages.ts）から引く
//   共有コードの読み方は src/deck.ts の decodeShare（v2: 「2~エネ~カード~名前」）と同じ

import { cardRows, sharePage, shareName, type ShareCtx } from "./share-page.ts";

/** 共有コード（v2）から名前とカード（枚数つき）を読む。読めなければ undefined */
function decode(code: string): { name: string; cards: [string, number][] } | undefined {
  if (!code.startsWith("2~")) return undefined;
  const [, , c = "", ...rest] = code.split("~");
  const name = shareName(rest.join("~"));
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

export async function deckPage({ request, env }: ShareCtx, lang: "ja" | "en"): Promise<Response> {
  const url = new URL(request.url);
  const code = url.pathname.replace(/^\/(?:en\/)?d\//, "").replace(/\/+$/, "");
  const top = await env.ASSETS.fetch(new URL("/", url));
  const deck = decode(code);
  if (!deck || !top.ok) return top;
  const cards = await cardRows(env, url);

  const known = deck.cards.filter(([id]) => cards[id]);
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

  return sharePage(top, { url, lang, title, desc });
}
