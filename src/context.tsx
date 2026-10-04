import { createContext, useContext } from "react";
import { canAdd } from "./deck.ts";
import type { Engine } from "./search/engine.ts";
import { useDecks, useToast } from "./store.ts";
import type { createSynergy } from "./synergy.ts";
import type { AppCard, AppData } from "./types.ts";

export interface Ctx {
  data: AppData;
  engine: Engine;
  synergy: ReturnType<typeof createSynergy>;
  byId: Map<string, AppCard>;
}
export const DataContext = createContext<Ctx | null>(null);
export const useData = () => useContext(DataContext)!;

/** 今のデッキにカードを1枚足す（デッキが無ければ作る） */
export function useAddToDeck() {
  const { byId } = useData();
  const show = useToast((s) => s.show);
  return (card: AppCard) => {
    const st = useDecks.getState();
    let deck = st.decks.find((d) => d.id === st.currentId) ?? st.decks[0];
    if (!deck) {
      const id = st.create();
      deck = useDecks.getState().decks.find((d) => d.id === id)!;
    } else if (deck.id !== st.currentId) st.select(deck.id);
    const err = canAdd(deck, card, byId);
    if (err) return show(err, "error");
    st.add(deck.id, card.id);
    show(`「${card.nameJa}」を ${deck.name} に追加（${deck.cards.length + 1}/20）`);
  };
}
