// リスト（ツールタブの「リスト」）。デッキと違って枚数の上限がなく、絵柄違い（収録）とミラーを指定できる。
//   リスト: ふつうのカードの一覧
//   トレード用リスト: 「欲しいカード」と「出せるカード」の2つに分かれる
// 共有コード（URL の #/list/<コード>）と、その読み書き
import type { AppCard, AppPrint } from "./types.ts";

export type ListKind = "list" | "trade";
export type ListSide = "main" | "want" | "give";

export interface ListItem {
  print: string; // 収録ID（絵柄。ふつうの絵柄はカードIDと同じ）
  mirror?: boolean; // ミラー仕様
  n: number;
  side: ListSide;
}

export interface CardList {
  id: string;
  name: string;
  kind: ListKind;
  items: ListItem[];
  updatedAt: number;
}

/** リストの種類ごとの区分（リストは1つ、トレード用は「欲しい」「出せる」） */
export const SIDES: Record<ListKind, ListSide[]> = { list: ["main"], trade: ["want", "give"] };

export const MAX_COUNT = 99;

/** 同じ絵柄・同じミラー・同じ区分なら同じ行 */
export const sameItem = (a: Pick<ListItem, "print" | "mirror" | "side">, b: Pick<ListItem, "print" | "mirror" | "side">) =>
  a.print === b.print && !!a.mirror === !!b.mirror && a.side === b.side;

/**
 * ミラー仕様にできる絵柄: ex・メガシンカex 以外のカードの、◆1〜3 の絵柄（プロモ・★以上にはない）。
 * ゲーム内の「ミラー仕様」は ex にはない（Game8「ミラー仕様カード大量発生イベント」）
 */
export function canMirror(card: AppCard, print: AppPrint | undefined): boolean {
  return card.rule === "normal" && !!print && /^◊{1,3}$/.test(print.rarity);
}

/** そのカード（どの絵柄・ミラーでも）がその区分に何枚あるか */
export function countOf(items: ListItem[], side: ListSide, card: Pick<AppCard, "prints">): number {
  const prints = new Set(card.prints.map((p) => p.id));
  return items.reduce((n, x) => n + (x.side === side && prints.has(x.print) ? x.n : 0), 0);
}

/** 収録ID → [カード, 収録] */
export function printIndex(cards: AppCard[]): Map<string, [AppCard, AppPrint]> {
  const m = new Map<string, [AppCard, AppPrint]>();
  for (const c of cards) for (const p of c.prints) if (!m.has(p.id)) m.set(p.id, [c, p]);
  return m;
}

// ---- 共有コード ----
//   リスト:         L1~l~<カード>~<名前>
//   トレード用:     L1~t~<欲しい>~<出せる>~<名前>
//   カード: 「収録ID」＋ミラーなら「m」＋2枚以上なら「x枚数」を . でつなぐ（例: a1-001mx2.b3-081）。名前は URL エンコード
const itemCode = (it: ListItem) => `${it.print}${it.mirror ? "m" : ""}${it.n > 1 ? `x${it.n}` : ""}`;

export function encodeList(l: Pick<CardList, "name" | "kind" | "items">): string {
  const part = (side: ListSide) => l.items.filter((it) => it.side === side).map(itemCode).join(".");
  return ["L1", l.kind === "trade" ? "t" : "l", ...SIDES[l.kind].map(part), encodeURIComponent(l.name)].join("~");
}

export function decodeList(code: string, prints: Map<string, unknown>): Pick<CardList, "name" | "kind" | "items"> {
  const parts = code.split("~");
  if (parts[0] !== "L1" || (parts[1] !== "l" && parts[1] !== "t")) throw new Error("not a list code");
  const kind: ListKind = parts[1] === "t" ? "trade" : "list";
  const sides = SIDES[kind];
  const raw = parts.slice(2 + sides.length).join("~");
  let name = raw;
  try {
    name = decodeURIComponent(raw);
  } catch {
    /* そのまま */
  }
  const items: ListItem[] = [];
  sides.forEach((side, i) => {
    for (const x of (parts[2 + i] ?? "").split(".").filter(Boolean)) {
      const m = /^([a-z0-9]+-\d+)(m)?(?:x(\d+))?$/.exec(x);
      if (!m || !prints.has(m[1])) continue;
      items.push({ print: m[1], ...(m[2] ? { mirror: true } : {}), n: Math.min(MAX_COUNT, Math.max(1, Number(m[3]) || 1)), side });
    }
  });
  return { name, kind, items };
}

/** 共有URL・まわりに文字のある貼り付けから、リストの共有コードを取り出す */
export function listCodeOf(text: string): string {
  const t = text.trim();
  return t.match(/(?:#\/list|https?:\/\/[^/\s]+(?:\/en)?\/l)\/([^\s?#/]+)/)?.[1] ?? t.match(/(?:^|\s)(L1~[^\s]+)/)?.[1] ?? t;
}
