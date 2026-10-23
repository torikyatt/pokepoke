// 状態管理（Zustand）。デッキと設定は localStorage に保存する。
// localStorage が使えない環境（プライベートブラウズ等）でも落ちないよう、読み書きは try/catch で包む
import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import { useDetail } from "./detail.ts";
import type { EnergyType } from "./types.ts";
import { MAX_COUNT, sameItem, type CardList, type ListItem, type ListKind, type ListSide } from "./lists.ts";

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
        const deck: Deck = { id, name: name ?? `${useSettings.getState().lang === "en" ? "Deck " : "デッキ"}${get().decks.length + 1}`, cards: [], energy: [], updatedAt: Date.now(), ...init };
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
        const added = decks.map((d) => ({ id: newId(), updatedAt: Date.now(), name: d.name || (useSettings.getState().lang === "en" ? "Imported deck" : "読み込んだデッキ"), cards: d.cards ?? [], energy: d.energy ?? [] }));
        set((s) => ({ decks: [...s.decks, ...added], currentId: added[0]?.id ?? s.currentId }));
        return added.length;
      },
    }),
    { name: "pokepoke.decks", storage: createJSONStorage(() => safeStorage), version: 1 },
  ),
);

// 設定
interface SettingsState {
  lang: "ja" | "en"; // 表示言語（画面の文字・カード名・効果文）
  setLang: (l: "ja" | "en") => void;
  imageLang: "ja" | "en"; // カード画像の言語
  setImageLang: (l: "ja" | "en") => void;
  deckView: "grid" | "list"; // デッキ内容の見せ方
  setDeckView: (v: "grid" | "list") => void;
  slotSize: "s" | "m" | "l"; // デッキ編集画面の上の枠の大きさ
  setSlotSize: (v: "s" | "m" | "l") => void;
  theme: Theme; // 画面の明るさ（はじめはライト。auto は端末の設定に合わせる）
  setTheme: (v: Theme) => void;
}
export type Theme = "auto" | "light" | "dark";
const defaultLang = (): "ja" | "en" =>
  typeof navigator === "undefined" || /bot|crawl|spider|slurp|google|bing|yandex|baidu|lighthouse/i.test(navigator.userAgent) || /^ja\b/i.test(navigator.language ?? "ja") ? "ja" : "en";
export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      // はじめて開いたときは、ブラウザの言語が日本語なら日本語、それ以外は英語。
      // 検索エンジン（Googlebot など英語の環境で開く）には日本語で見せる（英語のページは /en/card/… にある）
      lang: defaultLang(),
      // 表示言語を変えたら、カード画像の言語も合わせる（画像だけ別の言語にもできる）
      setLang: (lang) => set({ lang, imageLang: lang }),
      imageLang: defaultLang(),
      setImageLang: (imageLang) => set({ imageLang }),
      deckView: "grid",
      setDeckView: (deckView) => set({ deckView }),
      slotSize: "s",
      setSlotSize: (slotSize) => set({ slotSize }),
      theme: "light",
      setTheme: (theme) => set({ theme }),
    }),
    {
      name: "pokepoke.settings",
      storage: createJSONStorage(() => safeStorage),
      // v2: 画面の明るさのはじめの値を「自動」から「ライト」に変えた（v1 で保存された「自動」はライトにする）
      version: 2,
      migrate: (s, v) => {
        const st = s as Partial<SettingsState>;
        if (v < 2 && (!st.theme || st.theme === "auto")) st.theme = "light";
        return st as SettingsState;
      },
    },
  ),
);

// リスト（ツールタブ）。デッキと違って枚数の上限がなく、絵柄違い・ミラーを指定できる（lists.ts）
interface ListState {
  lists: CardList[];
  create: (kind: ListKind, name?: string, items?: ListItem[]) => string;
  remove: (id: string) => void;
  rename: (id: string, name: string) => void;
  /** カードを足す（同じ絵柄・ミラー・区分があれば枚数を増やす） */
  add: (id: string, item: Omit<ListItem, "n"> & { n?: number }) => void;
  /** 行を置き換える（絵柄・ミラー・区分を変えたとき、同じ行があればまとめる）。n が 0 なら外す */
  setItem: (id: string, index: number, item: ListItem) => void;
  /** そのカード（どの絵柄でも）を1枚減らす。ふつうの絵柄・ミラーでないものから先に減らす */
  removeOne: (id: string, side: ListSide, prints: string[]) => void;
}
const touch = (l: CardList, items: ListItem[]): CardList => ({ ...l, items, updatedAt: Date.now() });
export const useLists = create<ListState>()(
  persist(
    (set, get) => ({
      lists: [],
      create: (kind, name, items = []) => {
        const id = newId();
        const en = useSettings.getState().lang === "en";
        const n = get().lists.filter((l) => l.kind === kind).length + 1;
        const fallback = kind === "trade" ? (en ? `Trade list ${n}` : `トレード用リスト${n}`) : en ? `List ${n}` : `リスト${n}`;
        set((s) => ({ lists: [...s.lists, { id, name: name || fallback, kind, items, updatedAt: Date.now() }] }));
        return id;
      },
      remove: (id) => set((s) => ({ lists: s.lists.filter((l) => l.id !== id) })),
      rename: (id, name) => set((s) => ({ lists: s.lists.map((l) => (l.id === id ? { ...l, name, updatedAt: Date.now() } : l)) })),
      add: (id, item) =>
        set((s) => ({
          lists: s.lists.map((l) => {
            if (l.id !== id) return l;
            const n = item.n ?? 1;
            const i = l.items.findIndex((x) => sameItem(x, item));
            if (i < 0) return touch(l, [...l.items, { ...item, n }]);
            return touch(l, l.items.map((x, j) => (j === i ? { ...x, n: Math.min(MAX_COUNT, x.n + n) } : x)));
          }),
        })),
      setItem: (id, index, item) =>
        set((s) => ({
          lists: s.lists.map((l) => {
            if (l.id !== id) return l;
            const rest = l.items.filter((_, j) => j !== index);
            if (item.n <= 0) return touch(l, rest);
            const k = rest.findIndex((x) => sameItem(x, item));
            const n = Math.min(MAX_COUNT, item.n);
            if (k < 0) return touch(l, [...rest.slice(0, index), { ...item, n }, ...rest.slice(index)]);
            return touch(l, rest.map((x, j) => (j === k ? { ...x, n: Math.min(MAX_COUNT, x.n + n) } : x)));
          }),
        })),
      removeOne: (id, side, prints) => {
        const l = get().lists.find((x) => x.id === id);
        if (!l) return;
        const match = (x: ListItem) => x.side === side && prints.includes(x.print);
        let i = l.items.findIndex((x) => match(x) && x.print === prints[0] && !x.mirror);
        if (i < 0) i = l.items.findLastIndex(match);
        if (i >= 0) get().setItem(id, i, { ...l.items[i], n: l.items[i].n - 1 });
      },
    }),
    { name: "pokepoke.lists", storage: createJSONStorage(() => safeStorage), version: 1 },
  ),
);

// リストを編集している間は、カード一覧の長押し・カード詳細の ＋／− をデッキではなくそのリストに向ける（ListBuilderPage が出し入れする）
export const useEditTarget = create<{ list?: { id: string; side: ListSide } }>()(() => ({}));

// お気に入り（毎回入れる必須級のカードや、いつか使いたいカードを覚えておく）。新しく入れたものが先頭
interface FavState {
  ids: string[];
  toggle: (id: string) => void;
}
export const useFavorites = create<FavState>()(
  persist(
    (set) => ({
      ids: [],
      toggle: (id) => set((s) => ({ ids: s.ids.includes(id) ? s.ids.filter((x) => x !== id) : [id, ...s.ids] })),
    }),
    { name: "pokepoke.favorites", storage: createJSONStorage(() => safeStorage), version: 1 },
  ),
);

// 見たカードの履歴（新しい順・100件まで）。カード詳細でカードを表示するたびに先頭へ（同じカードは1つにまとめる）
export const VIEWED_MAX = 100;
interface ViewedState {
  ids: string[];
  clear: () => void;
}
export const useViewed = create<ViewedState>()(
  persist(
    (set) => ({
      ids: [],
      clear: () => set({ ids: [] }),
    }),
    { name: "pokepoke.viewed", storage: createJSONStorage(() => safeStorage), version: 1, partialize: (s) => ({ ids: s.ids }) },
  ),
);
useDetail.subscribe((s, prev) => {
  const id = s.open ? s.stack[s.pos] : undefined;
  if (!id || (prev.open && prev.stack[prev.pos] === id)) return;
  useViewed.setState((v) => ({ ids: [id, ...v.ids.filter((x) => x !== id)].slice(0, VIEWED_MAX) }));
});

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

// 以前のミスログ（廃止）の保存データを消す
try {
  localStorage.removeItem("pokepoke.misses");
} catch {
  /* noop */
}
