// デッキの検証・書き出し・共有URL
import type { Deck } from "./store.ts";
import type { AppCard, EnergyType } from "./types.ts";

export const DECK_SIZE = 20;
export const MAX_SAME_NAME = 2;
export const MAX_ENERGY = 3;

export interface DeckCheck {
  ok: boolean;
  problems: string[];
}

export function checkDeck(deck: Pick<Deck, "cards" | "energy">, byId: Map<string, AppCard>): DeckCheck {
  const problems: string[] = [];
  const cards = deck.cards.map((id) => byId.get(id)).filter((c): c is AppCard => !!c);
  if (cards.length !== DECK_SIZE) problems.push(`デッキは${DECK_SIZE}枚ちょうど（今 ${cards.length} 枚）`);
  const byName = new Map<string, number>();
  for (const c of cards) byName.set(c.nameEn, (byName.get(c.nameEn) ?? 0) + 1);
  for (const [name, n] of byName) {
    if (n > MAX_SAME_NAME) {
      const ja = cards.find((c) => c.nameEn === name)!.nameJa;
      problems.push(`「${ja}」が ${n} 枚（同名カードは${MAX_SAME_NAME}枚まで）`);
    }
  }
  if (!cards.some((c) => c.kind === "pokemon" && c.stage === "basic")) problems.push("たねポケモンが1枚もない");
  if (!deck.energy.length) problems.push("エネルギーゾーンのタイプが未設定");
  if (deck.energy.length > MAX_ENERGY) problems.push(`エネルギーゾーンは${MAX_ENERGY}タイプまで`);
  return { ok: !problems.length, problems };
}

/** 追加できるか（20枚・同名2枚の上限） */
export function canAdd(deck: Pick<Deck, "cards">, card: AppCard, byId: Map<string, AppCard>): string | undefined {
  if (deck.cards.length >= DECK_SIZE) return `デッキは${DECK_SIZE}枚まで`;
  const same = deck.cards.filter((id) => byId.get(id)?.nameEn === card.nameEn).length;
  if (same >= MAX_SAME_NAME) return `「${card.nameJa}」はもう${MAX_SAME_NAME}枚入っています`;
}

/** デッキのポケモンのタイプからエネルギーゾーンを推定（多い順に最大3） */
export function guessEnergy(deck: Pick<Deck, "cards">, byId: Map<string, AppCard>): EnergyType[] {
  const n = new Map<EnergyType, number>();
  for (const id of deck.cards) {
    const c = byId.get(id);
    if (!c || c.kind !== "pokemon") continue;
    for (const a of c.attacks) for (const [t, k] of Object.entries(a.cost)) if (t !== "colorless") n.set(t as EnergyType, (n.get(t as EnergyType) ?? 0) + (k ?? 0));
    // 無色コストのワザしかないときは、ポケモンのタイプで数える
    if (c.type && c.type !== "colorless" && c.type !== "dragon") n.set(c.type, (n.get(c.type) ?? 0) + 0.1);
  }
  return [...n].sort((a, b) => b[1] - a[1]).slice(0, MAX_ENERGY).map(([t]) => t);
}

/** 並び: ポケモン（進化ライン順）→ サポート → グッズ → どうぐ → スタジアム */
const KIND_ORDER = { pokemon: 0, fossil: 1, supporter: 2, item: 3, tool: 4, stadium: 5 } as const;
export function sortDeckCards(ids: string[], byId: Map<string, AppCard>): AppCard[] {
  return ids
    .map((id) => byId.get(id))
    .filter((c): c is AppCard => !!c)
    .sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || (a.type ?? "").localeCompare(b.type ?? "") || a.id.localeCompare(b.id, "en", { numeric: true }));
}

// ---- JSON 書き出し・読み込み ----
export interface DeckFile {
  format: "pokepoke-decks";
  version: 1;
  decks: { name: string; energy: EnergyType[]; cards: string[] }[];
}
export function toFile(decks: Deck[]): DeckFile {
  return { format: "pokepoke-decks", version: 1, decks: decks.map((d) => ({ name: d.name, energy: d.energy, cards: d.cards })) };
}
export function fromFile(json: unknown, byId: Map<string, AppCard>): DeckFile["decks"] {
  const f = json as Partial<DeckFile>;
  if (f?.format !== "pokepoke-decks" || !Array.isArray(f.decks)) throw new Error("POKÉPOKE LAB のデッキファイルではありません");
  return f.decks.map((d) => ({
    name: String(d.name ?? "読み込んだデッキ"),
    energy: (d.energy ?? []).slice(0, MAX_ENERGY),
    cards: (d.cards ?? []).filter((id) => byId.has(id)),
  }));
}

// ---- 共有URL（#/share/<code>）----
const b64url = (s: string) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64url = (s: string) => decodeURIComponent(escape(atob(s.replace(/-/g, "+").replace(/_/g, "/"))));
export function encodeShare(d: Pick<Deck, "name" | "cards" | "energy">): string {
  return b64url(JSON.stringify({ n: d.name, e: d.energy, c: d.cards.join(",") }));
}
export function decodeShare(code: string): { name: string; energy: EnergyType[]; cards: string[] } {
  const o = JSON.parse(unb64url(code));
  return { name: String(o.n ?? "共有デッキ"), energy: o.e ?? [], cards: String(o.c ?? "").split(",").filter(Boolean) };
}

export function download(filename: string, content: Blob | string, type = "application/json") {
  const blob = typeof content === "string" ? new Blob([content], { type }) : content;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
