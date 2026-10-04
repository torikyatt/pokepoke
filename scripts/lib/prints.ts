// 絵柄（収録）の並び。カードの画像・サムネイルは「いちばん基本の絵柄」を使う。
//   ◇（通常レアリティ）→ プロモ → ☆（AR）→ ☆☆（SAR など）→ ☆☆☆（IM）→ 王冠 の順。同じなら早く出たもの
// カードIDは最初に出た収録のまま変えない（デッキや大会データがIDで持っているため）
const RANK: Record<string, number> = { "◊": 0, "◊◊": 0, "◊◊◊": 0, "◊◊◊◊": 0, Promo: 1, "☆": 2, "☆☆": 3, "☆☆☆": 4, "Crown Rare": 5 };

type P = { id: string; rarity: string; released?: string };

export function orderedPrints<T extends P>(prints: T[]): T[] {
  return [...prints].sort(
    (a, b) => (RANK[a.rarity] ?? 9) - (RANK[b.rarity] ?? 9) || (a.released ?? "9").localeCompare(b.released ?? "9") || a.id.localeCompare(b.id, "en", { numeric: true }),
  );
}

export const basePrint = <T extends P>(prints: T[]): T => orderedPrints(prints)[0];
