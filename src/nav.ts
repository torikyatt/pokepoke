// 下のタブごとに「最後にいた場所」を覚える。
// 各タブは自分の画面を持ち続ける（カード詳細はタブとは別に、下からのシートで開く: detail.ts）。
// タブを切り替えても、検索文・絞り込み・読み込んだ件数・スクロール位置がそのまま残る。
import { create } from "zustand";
import { openCard } from "./detail.ts";
import { createJSONStorage, persist } from "zustand/middleware";

export type Tab = "search" | "deck" | "settings";
export const TAB_ROOT: Record<Tab, string> = { search: "#/", deck: "#/deck", settings: "#/settings" };

export function parseHash(hash: string) {
  const [path, qs = ""] = (hash || "#/").replace(/^#/, "").split("?");
  return { parts: path.split("/").filter(Boolean), params: new URLSearchParams(qs) };
}

/** そのURLが属するタブ。#/card/<id> はどのタブにも属さない（詳細を開くだけ） */
export function tabOf(hash: string): Tab | undefined {
  const p = parseHash(hash).parts[0];
  if (p === "card") return undefined;
  if (p === "deck" || p === "share") return "deck";
  if (p === "settings" || p === "review") return "settings";
  return "search";
}

/** 各タブのスクロール位置（描き直しを起こさないよう、ストアの外に置く） */
export const scrollPos: Partial<Record<Tab, number>> = {};

interface NavState {
  active: Tab;
  base: Record<Tab, string>; // 各タブの画面
  visited: Tab[];
  /** URLが変わったときに呼ぶ（戻る・進むも含む） */
  sync: (hash: string) => void;
  /** 下のタブを押したとき */
  goTab: (t: Tab) => void;
}

export const useNav = create<NavState>()(
  persist(
    (set, get) => ({
      active: "search",
      base: { ...TAB_ROOT },
      visited: ["search"],
      sync: (hash) => {
        const s = get();
        const t = tabOf(hash);
        if (!t) {
          // 古いリンクや共有された #/card/<id>: URLを今のタブに戻して詳細を開く
          const id = parseHash(hash).parts[1];
          history.replaceState(null, "", s.base[s.active]);
          window.dispatchEvent(new HashChangeEvent("hashchange"));
          if (id) openCard(id, []); // 共有リンクなどから開いたときは前・次の一覧がない
          return;
        }
        // 同じタブの中で画面や条件が変わったら先頭から（別タブから戻ってきたときは位置を戻す）
        if (s.base[t] !== hash && t === s.active) scrollPos[t] = 0;
        set({
          active: t,
          base: { ...s.base, [t]: hash },
          visited: s.visited.includes(t) ? s.visited : [...s.visited, t],
        });
      },
      goTab: (t) => {
        const s = get();
        if (t === s.active) {
          // 同じタブをもう一度押したら、タブの最初の画面へ（最初の画面なら上へ）
          scrollPos[t] = 0;
          if (s.base[t] !== TAB_ROOT[t]) location.hash = TAB_ROOT[t];
          else window.scrollTo({ top: 0, behavior: "smooth" });
          return;
        }
        set({ active: t, visited: s.visited.includes(t) ? s.visited : [...s.visited, t] });
        location.hash = s.base[t];
      },
    }),
    {
      name: "pokepoke.nav",
      version: 1,
      storage: createJSONStorage(() => ({
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
            /* noop */
          }
        },
        removeItem: (k) => {
          try {
            localStorage.removeItem(k);
          } catch {
            /* noop */
          }
        },
      })),
      // 開き直したとき、今開いているタブ以外の場所も戻せるように覚えておく
      partialize: (s) => ({ base: s.base }),
    },
  ),
);
