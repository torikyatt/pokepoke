// カード一覧の並べ替えと詳細な絞り込み（検索画面とデッキ編集画面で共通）
import { createContext, useContext } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { AppCard, CardGroup, CardKind, EnergyType, Rule, Stage } from "./types.ts";

export type SortKey = "order" | "score" | "usage" | "hp" | "damage" | "retreat" | "cost" | "name" | "new" | "rarity";

export const SORTS: { key: SortKey; label: string; en: string; desc: boolean }[] = [
  { key: "order", label: "図鑑順", en: "Pokédex order", desc: false },
  { key: "score", label: "一致度順", en: "Best match", desc: true },
  { key: "usage", label: "大会での採用率", en: "Tournament usage", desc: true },
  { key: "hp", label: "HP", en: "HP", desc: true },
  { key: "damage", label: "最大ダメージ", en: "Max damage", desc: true },
  { key: "retreat", label: "にげるエネ", en: "Retreat Cost", desc: false },
  { key: "cost", label: "ワザのエネ数", en: "Attack cost", desc: false },
  { key: "rarity", label: "レアリティ", en: "Rarity", desc: true },
  { key: "new", label: "新しい順", en: "Newest", desc: true },
  { key: "name", label: "名前順", en: "Name", desc: false },
];

export interface Filters {
  types: EnergyType[];
  kinds: CardKind[];
  stages: Stage[];
  rules: Rule[];
  ability: "" | "yes" | "no";
  hpMin?: number;
  hpMax?: number;
  retreat: number[]; // 4 は「4以上」
  weakness: EnergyType[];
  damageMin?: number;
  costMax?: number;
  tags: string[]; // どれかを持つ（親タグは子タグも含む）
  groups: CardGroup[];
  sets: string[];
  rarities: string[];
}

export const EMPTY_FILTERS: Filters = {
  types: [], kinds: [], stages: [], rules: [], ability: "", retreat: [], weakness: [], tags: [], groups: [], sets: [], rarities: [],
};

export function activeCount(f: Filters): number {
  let n = 0;
  for (const v of Object.values(f)) {
    if (Array.isArray(v)) n += v.length ? 1 : 0;
    else if (v !== undefined && v !== "") n += 1;
  }
  return n;
}

const has = <T>(list: T[], v: T | undefined) => !list.length || (v !== undefined && list.includes(v));

export function matchFilters(c: AppCard, f: Filters): boolean {
  if (f.types.length && !f.types.some((t) => c.type === t || c.typeRefs.includes(t))) return false;
  if (!has(f.kinds, c.kind)) return false;
  if (f.stages.length && !has(f.stages, c.stage)) return false;
  if (f.rules.length && (c.kind !== "pokemon" || !f.rules.includes(c.rule))) return false;
  if (f.ability === "yes" && !c.ability) return false;
  if (f.ability === "no" && (c.kind !== "pokemon" || c.ability)) return false;
  if (f.hpMin !== undefined && (c.hp ?? -1) < f.hpMin) return false;
  if (f.hpMax !== undefined && (c.hp === undefined || c.hp > f.hpMax)) return false;
  if (f.retreat.length && (c.retreat === undefined || !f.retreat.includes(Math.min(c.retreat, 4)))) return false;
  if (f.weakness.length && !has(f.weakness, c.weakness)) return false;
  if (f.damageMin !== undefined && c.maxDamage < f.damageMin) return false;
  if (f.costMax !== undefined && (c.minCost === undefined || c.minCost > f.costMax)) return false;
  if (f.tags.length && !f.tags.some((t) => c.tags.some((x) => x === t || x.startsWith(t + ".")))) return false;
  if (f.groups.length && !f.groups.some((g) => c.groups.includes(g))) return false;
  if (f.sets.length && !f.sets.some((s) => c.sets.includes(s))) return false;
  if (f.rarities.length && !f.rarities.some((r) => c.rarities.includes(r))) return false;
  return true;
}

// レアリティの順位（◊ < ◊◊ < … < ☆ < ☆☆ < ☆☆☆ < 王冠）。プロモは最下位
export const RARITIES: { key: string; label: string; en?: string }[] = [
  { key: "◊", label: "◆1" }, { key: "◊◊", label: "◆2" }, { key: "◊◊◊", label: "◆3" }, { key: "◊◊◊◊", label: "◆4" },
  { key: "☆", label: "★1" }, { key: "☆☆", label: "★2" }, { key: "☆☆☆", label: "★3" }, { key: "Crown Rare", label: "👑" }, { key: "Promo", label: "プロモ", en: "Promo" },
];
const RANK = new Map(RARITIES.map((r, i) => [r.key, r.key === "Promo" ? 0 : i + 1]));
// カードの代表レアリティ = 通常版（いちばん低いもの）
const baseRarity = (c: AppCard) => {
  const ranks = c.rarities.filter((r) => r !== "Promo").map((r) => RANK.get(r) ?? 0);
  return ranks.length ? Math.min(...ranks) : 0;
};

const collator = { ja: new Intl.Collator("ja"), en: new Intl.Collator("en") };
export function sortHits<T extends { card: AppCard; score: number }>(list: T[], key: SortKey, desc: boolean, usage: Record<string, number> = {}, lang: "ja" | "en" = "ja"): T[] {
  const val = (h: T): number | string => {
    const c = h.card;
    switch (key) {
      case "score": return h.score;
      case "usage": return usage[c.id] ?? 0;
      case "hp": return c.hp ?? -1;
      case "damage": return c.maxDamage;
      case "retreat": return c.retreat ?? -1;
      case "cost": return c.minCost ?? 99;
      case "rarity": return baseRarity(c);
      case "new": return c.released;
      case "name": return lang === "en" ? c.nameEn : c.nameJa;
      default: return c.order;
    }
  };
  const sign = desc ? -1 : 1;
  return [...list].sort((a, b) => {
    const x = val(a), y = val(b);
    const d = typeof x === "string" ? collator[lang].compare(x, y as string) : x - (y as number);
    return d * sign || a.card.order - b.card.order || a.card.id.localeCompare(b.card.id, "en", { numeric: true });
  });
}

interface PoolState {
  columns: 3 | 5;
  sort: SortKey;
  desc: boolean;
  filters: Filters;
  favOnly: boolean; // お気に入りだけを並べる
  setFavOnly: (v: boolean) => void;
  setColumns: (n: 3 | 5) => void;
  setSort: (key: SortKey, desc: boolean) => void;
  setFilters: (f: Filters) => void;
}

const safeStorage = createJSONStorage(() => ({
  getItem: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  setItem: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* noop */
    }
  },
  removeItem: (k: string) => {
    try {
      localStorage.removeItem(k);
    } catch {
      /* noop */
    }
  },
}));

// 一覧の状態は画面ごとに別々に持つ（検索タブとデッキ編集で絞り込みが混ざらないように）
function createPoolStore(scope: string) {
  return create<PoolState>()(
    persist(
      (set) => ({
        columns: 5,
        sort: "order",
        desc: false,
        filters: EMPTY_FILTERS,
        favOnly: false,
        setFavOnly: (favOnly) => set({ favOnly }),
        setColumns: (columns) => set({ columns }),
        setSort: (sort, desc) => set({ sort, desc }),
        setFilters: (filters) => set({ filters }),
      }),
      { name: `pokepoke.pool.${scope}`, version: 1, storage: safeStorage, partialize: (s) => ({ columns: s.columns, sort: s.sort, desc: s.desc, filters: s.filters }) },
    ),
  );
}
export const poolStores = { search: createPoolStore("search"), builder: createPoolStore("builder") };
export const PoolScope = createContext<keyof typeof poolStores>("search");
export function usePool(): PoolState {
  return poolStores[useContext(PoolScope)]();
}
