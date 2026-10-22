import { createContext, useContext } from "react";
import { canAdd } from "./deck.ts";
import type { Engine } from "./search/engine.ts";
import { useDecks, useEditTarget, useLists, useToast } from "./store.ts";
import type { createSynergy } from "./synergy.ts";
import type { AppCard, AppData } from "./types.ts";
import { tr, upcomingMsg } from "./i18n.ts";

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
    if (card.upcoming) return show(upcomingMsg(card), "error");
    // リストを編集しているときは、そのリストに足す（ふつうの絵柄で1枚）
    const target = useEditTarget.getState().list;
    const list = target && useLists.getState().lists.find((l) => l.id === target.id);
    if (target && list) {
      useLists.getState().add(list.id, { print: card.id, side: target.side });
      const prints = card.prints.map((p) => p.id);
      const n = useLists.getState().lists.find((l) => l.id === list.id)!.items.filter((x) => x.side === target.side && prints.includes(x.print)).reduce((a, x) => a + x.n, 0);
      show(tr(`「${card.nameJa}」を ${list.name} に追加（${n}枚）`, `Added ${card.nameEn} to ${list.name} (${n})`));
      return;
    }
    const st = useDecks.getState();
    let deck = st.decks.find((d) => d.id === st.currentId) ?? st.decks[0];
    if (!deck) {
      const id = st.create();
      deck = useDecks.getState().decks.find((d) => d.id === id)!;
    } else if (deck.id !== st.currentId) st.select(deck.id);
    const err = canAdd(deck, card, byId);
    if (err) return show(err, "error");
    st.add(deck.id, card.id);
    show(tr(`「${card.nameJa}」を ${deck.name} に追加（${deck.cards.length + 1}/20）`, `Added ${card.nameEn} to ${deck.name} (${deck.cards.length + 1}/20)`));
  };
}
