// リストの共有リンク（/l/<共有コード>・/en/l/<共有コード>）のページ。リスト名を頭にしたタイトルと説明を出す（server/share-page.ts）。
// 人が開くと、index.html の起動スクリプトが /#/list/<共有コード> に切り替え、アプリの共有リストの画面が開く。
//   共有コードの読み方は src/lists.ts の decodeList（「L1~l~カード~名前」「L1~t~欲しい~出せる~名前」）と同じ
import { cardRows, sharePage, shareName, type ShareCtx } from "./share-page.ts";

type Part = [string, number][]; // [収録ID, 枚数]

/** 共有コードから名前・種類・カードを読む。読めなければ undefined */
export function decodeListCode(code: string): { name: string; trade: boolean; parts: Part[] } | undefined {
  const p = code.replace(/%7E/gi, "~").split("~");
  if (p[0] !== "L1" || (p[1] !== "l" && p[1] !== "t")) return undefined;
  const trade = p[1] === "t";
  const n = trade ? 2 : 1;
  const parts = p.slice(2, 2 + n).map((s) =>
    (s ?? "")
      .split(".")
      .filter(Boolean)
      .slice(0, 300)
      .flatMap((x): [string, number][] => {
        const m = /^([a-z0-9]+-\d+)m?(?:x(\d+))?$/.exec(x);
        return m ? [[m[1], Math.min(99, Math.max(1, Number(m[2]) || 1))]] : [];
      }),
  );
  return { name: shareName(p.slice(2 + n).join("~")), trade, parts };
}

export async function listPage({ request, env }: ShareCtx, lang: "ja" | "en"): Promise<Response> {
  const url = new URL(request.url);
  const code = url.pathname.replace(/^\/(?:en\/)?l\//, "").replace(/\/+$/, "");
  const top = await env.ASSETS.fetch(new URL("/", url));
  const list = decodeListCode(code);
  if (!list || !top.ok) return top;
  const cards = await cardRows(env, url);
  const en = lang === "en";
  // カードの名前（主役らしい順に3枚まで）と枚数
  const summary = (part: Part) => {
    const count = part.reduce((s, [, n]) => s + n, 0);
    const names = [...new Set(part.filter(([id]) => cards[id]).sort((a, b) => cards[b[0]][0] - cards[a[0]][0]).map(([id]) => cards[id][en ? 2 : 1]))].slice(0, 3);
    return { count, names };
  };
  const listName = list.name || (en ? "Shared list" : "共有リスト");
  const kind = list.trade ? (en ? "trade list" : "トレード用リスト") : en ? "card list" : "カードリスト";
  const title = en ? `${listName} – Pokémon TCG Pocket ${kind} | POKÉPOKE INDECKS` : `${listName}｜ポケポケの${kind}｜POKÉPOKE INDECKS`;
  const part = (label: string, s: ReturnType<typeof summary>) =>
    en ? `${label} ${s.count}${s.names.length ? ` (${s.names.join(", ")})` : ""}` : `${label} ${s.count}枚${s.names.length ? `（${s.names.join("・")}）` : ""}`;
  const body = list.trade
    ? [part(en ? "Want:" : "欲しいカード", summary(list.parts[0])), part(en ? "Have:" : "出せるカード", summary(list.parts[1]))].join(en ? " / " : "／")
    : part(en ? "Cards:" : "カード", summary(list.parts[0]));
  const desc = en
    ? `A Pokémon TCG Pocket ${kind}. ${body}. Open it in POKÉPOKE INDECKS to see the cards and save it to your lists.`
    : `ポケポケ（Pokémon TCG Pocket）の${kind}。${body}。POKÉPOKE INDECKS で開くと、カードの一覧を見たり、自分のリストに保存したりできます。`;
  return sharePage(top, { url, lang, title, desc });
}
