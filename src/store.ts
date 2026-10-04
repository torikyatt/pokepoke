// 状態管理（Zustand）。デッキとミスログは localStorage に保存する。
// localStorage が使えない環境（プライベートブラウズ等）でも落ちないよう、読み書きは try/catch で包む
import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import type { EnergyType } from "./types.ts";

const safeStorage: StateStorage = {
  getItem: (k) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  setItem: (k, v) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* 保存できない環境では保持しない */
    }
  },
  removeItem: (k) => {
    try {
      localStorage.removeItem(k);
    } catch {
      /* noop */
    }
  },
};

export interface Deck {
  id: string;
  name: string;
  cards: string[]; // カードID（同じカード2枚なら2回入る）
  energy: EnergyType[]; // エネルギーゾーン（最大3）
  updatedAt: number;
}

const newId = () => Math.random().toString(36).slice(2, 10);

interface DeckState {
  decks: Deck[];
  currentId?: string;
  create: (name?: string, init?: Partial<Deck>) => string;
  remove: (id: string) => void;
  update: (id: string, patch: Partial<Omit<Deck, "id">>) => void;
  select: (id: string) => void;
  add: (id: string, cardId: string) => void;
  removeCard: (id: string, cardId: string) => void;
  importDecks: (decks: Omit<Deck, "id" | "updatedAt">[]) => number;
}

export const useDecks = create<DeckState>()(
  persist(
    (set, get) => ({
      decks: [],
      currentId: undefined,
      create: (name, init) => {
        const id = newId();
        const deck: Deck = { id, name: name ?? `デッキ${get().decks.length + 1}`, cards: [], energy: [], updatedAt: Date.now(), ...init };
        set((s) => ({ decks: [...s.decks, deck], currentId: id }));
        return id;
      },
      remove: (id) =>
        set((s) => {
          const decks = s.decks.filter((d) => d.id !== id);
          return { decks, currentId: s.currentId === id ? decks[0]?.id : s.currentId };
        }),
      update: (id, patch) => set((s) => ({ decks: s.decks.map((d) => (d.id === id ? { ...d, ...patch, updatedAt: Date.now() } : d)) })),
      select: (id) => set({ currentId: id }),
      add: (id, cardId) => set((s) => ({ decks: s.decks.map((d) => (d.id === id ? { ...d, cards: [...d.cards, cardId], updatedAt: Date.now() } : d)) })),
      removeCard: (id, cardId) =>
        set((s) => ({
          decks: s.decks.map((d) => {
            if (d.id !== id) return d;
            const i = d.cards.lastIndexOf(cardId);
            return i < 0 ? d : { ...d, cards: [...d.cards.slice(0, i), ...d.cards.slice(i + 1)], updatedAt: Date.now() };
          }),
        })),
      importDecks: (decks) => {
        const added = decks.map((d) => ({ id: newId(), updatedAt: Date.now(), name: d.name || "読み込んだデッキ", cards: d.cards ?? [], energy: d.energy ?? [] }));
        set((s) => ({ decks: [...s.decks, ...added], currentId: added[0]?.id ?? s.currentId }));
        return added.length;
      },
    }),
    { name: "pokepoke.decks", storage: createJSONStorage(() => safeStorage), version: 1 },
  ),
);

// ミスログ: 条件が何も取れなかった検索文（SPEC 4.4）。書き出して表現辞書の追加に使う
export interface Miss {
  q: string;
  at: string;
}
interface MissState {
  misses: Miss[];
  log: (q: string) => void;
  clear: () => void;
}
export const useMisses = create<MissState>()(
  persist(
    (set) => ({
      misses: [],
      log: (q) =>
        set((s) => {
          const t = q.trim();
          if (!t || s.misses.some((m) => m.q === t)) return s;
          return { misses: [...s.misses, { q: t, at: new Date().toISOString() }].slice(-500) };
        }),
      clear: () => set({ misses: [] }),
    }),
    { name: "pokepoke.misses", storage: createJSONStorage(() => safeStorage), version: 1 },
  ),
);

// 一時メッセージ
interface ToastState {
  message?: string;
  tone: "ok" | "error";
  show: (m: string, tone?: "ok" | "error") => void;
}
let toastTimer: ReturnType<typeof setTimeout> | undefined;
export const useToast = create<ToastState>()((set) => ({
  tone: "ok",
  show: (message, tone = "ok") => {
    clearTimeout(toastTimer);
    set({ message, tone });
    toastTimer = setTimeout(() => set({ message: undefined }), 2200);
  },
}));
