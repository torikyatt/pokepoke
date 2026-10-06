// タイプ（エネルギー）とレアリティのアイコン画像（src/assets/）。
// ビルドで画像のURLになる（1ファイル版では data: URL としてHTMLに埋め込まれる）
import type { EnergyType } from "./types.ts";

const energy = import.meta.glob<string>("./assets/energy/*.png", { eager: true, query: "?url", import: "default" });
const rarity = import.meta.glob<string>("./assets/rarity/*.png", { eager: true, query: "?url", import: "default" });

export const energyIconUrl = (t: EnergyType) => energy[`./assets/energy/${t}.png`];

// レアリティ（データの書き方）→ アイコン。◊=ダイヤ ☆=スター。数字は画像に入っている
const RARITY_FILE: Record<string, string> = {
  "◊": "d1", "◊◊": "d2", "◊◊◊": "d3", "◊◊◊◊": "d4", "☆": "s1", "☆☆": "s2", "☆☆☆": "s3", "Crown Rare": "crown", Promo: "promo",
};
export const rarityIconUrl = (r: string): string | undefined => (RARITY_FILE[r] ? rarity[`./assets/rarity/${RARITY_FILE[r]}.png`] : undefined);
