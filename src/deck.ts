// デッキの検証・書き出し・共有URL
import type { Deck } from "./store.ts";
import type { AppCard, EnergyType } from "./types.ts";
import { cardName, getLang, tr } from "./i18n.ts";

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
  if (cards.length !== DECK_SIZE) problems.push(tr(`デッキは${DECK_SIZE}枚ちょうど（今 ${cards.length} 枚）`, `A deck needs exactly ${DECK_SIZE} cards (now ${cards.length})`));
  const byName = new Map<string, number>();
  for (const c of cards) byName.set(c.nameEn, (byName.get(c.nameEn) ?? 0) + 1);
  for (const [name, n] of byName) {
    if (n > MAX_SAME_NAME) {
      const nm = cardName(cards.find((c) => c.nameEn === name)!, getLang());
      problems.push(tr(`「${nm}」が ${n} 枚（同名カードは${MAX_SAME_NAME}枚まで）`, `${n} copies of ${nm} (max ${MAX_SAME_NAME} with the same name)`));
    }
  }
  if (!cards.some((c) => c.kind === "pokemon" && c.stage === "basic")) problems.push(tr("たねポケモンが1枚もない", "No Basic Pokémon"));
  if (!deck.energy.length) problems.push(tr("エネルギーゾーンのタイプが未設定", "Energy Zone type not set"));
  if (deck.energy.length > MAX_ENERGY) problems.push(tr(`エネルギーゾーンは${MAX_ENERGY}タイプまで`, `Energy Zone allows up to ${MAX_ENERGY} types`));
  return { ok: !problems.length, problems };
}

/** 追加できるか（20枚・同名2枚の上限） */
export function canAdd(deck: Pick<Deck, "cards">, card: AppCard, byId: Map<string, AppCard>): string | undefined {
  if (deck.cards.length >= DECK_SIZE) return tr(`デッキは${DECK_SIZE}枚まで`, `A deck holds up to ${DECK_SIZE} cards`);
  const same = deck.cards.filter((id) => byId.get(id)?.nameEn === card.nameEn).length;
  if (same >= MAX_SAME_NAME) return tr(`「${card.nameJa}」はもう${MAX_SAME_NAME}枚入っています`, `Already ${MAX_SAME_NAME} copies of ${card.nameEn}`);
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
  if (f?.format !== "pokepoke-decks" || !Array.isArray(f.decks)) throw new Error(tr("POKÉPOKE LAB のデッキファイルではありません", "Not a POKÉPOKE LAB deck file"));
  return f.decks.map((d) => ({
    name: String(d.name ?? tr("読み込んだデッキ", "Imported deck")),
    energy: (d.energy ?? []).slice(0, MAX_ENERGY),
    cards: (d.cards ?? []).filter((id) => byId.has(id)),
  }));
}

// ---- 共有URL（#/share/<code>）----
const b64url = (s: string) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64url = (s: string) => decodeURIComponent(escape(atob(s.replace(/-/g, "+").replace(/_/g, "/"))));
// 共有コード（v2）: 「2~エネ~カード~名前」。QR コードに入れても目が細かくなりすぎないよう短く書く
//   エネ: タイプの1文字（G R W L P F D M N C）、カード: 「カードIDx枚数」を . でつなぐ、名前: URL エンコード
//   例: 2~F~b3-081x3.a2-092x2.pa-007x2~%E3%83%A1%E3%82%AC
// 以前の形（JSON を base64url にしたもの）も読める
const E_CODE: Record<EnergyType, string> = {
  grass: "G", fire: "R", water: "W", lightning: "L", psychic: "P", fighting: "F", darkness: "D", metal: "M", dragon: "N", colorless: "C",
};
const E_OF = Object.fromEntries(Object.entries(E_CODE).map(([k, v]) => [v, k])) as Record<string, EnergyType>;
export function encodeShare(d: Pick<Deck, "name" | "cards" | "energy">): string {
  const counts = new Map<string, number>();
  for (const id of d.cards) counts.set(id, (counts.get(id) ?? 0) + 1);
  const cards = [...counts].map(([id, n]) => (n > 1 ? `${id}x${n}` : id)).join(".");
  return `2~${d.energy.map((e) => E_CODE[e]).join("")}~${cards}~${encodeURIComponent(d.name)}`;
}
export function decodeShare(code: string): { name: string; energy: EnergyType[]; cards: string[] } {
  if (code.startsWith("2~")) {
    const [, e = "", c = "", ...rest] = code.split("~");
    const raw = rest.join("~");
    let name = raw;
    try {
      name = decodeURIComponent(raw); // ブラウザによってはすでに戻してあることがある
    } catch {
      /* そのまま */
    }
    name ||= tr("共有デッキ", "Shared deck");
    const cards = c.split(".").filter(Boolean).flatMap((x) => {
      const [id, n] = x.split("x");
      return Array<string>(Math.min(20, Math.max(1, Number(n) || 1))).fill(id);
    });
    return { name, energy: [...e].map((ch) => E_OF[ch]).filter(Boolean), cards };
  }
  const o = JSON.parse(unb64url(code));
  return { name: String(o.n ?? tr("共有デッキ", "Shared deck")), energy: o.e ?? [], cards: String(o.c ?? "").split(",").filter(Boolean) };
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
