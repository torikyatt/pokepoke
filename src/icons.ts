// タイプ（エネルギー）とレアリティのアイコン画像（src/assets/）。
// ビルドで画像のURLになる（1ファイル版では data: URL としてHTMLに埋め込まれる）
import type { EnergyType } from "./types.ts";

const energy = import.meta.glob<string>("./assets/energy/*.png", { eager: true, query: "?url", import: "default" });
const rarity = import.meta.glob<string>("./assets/rarity/*.png", { eager: true, query: "?url", import: "default" });

export const energyIconUrl = (t: EnergyType) => energy[`./assets/energy/${t}.png`];

// レアリティ（データの書き方）→ アイコンの並び。◊◊◊ はダイヤ3つ、☆☆ はスター2つ、✵✵ は色違いの印2つ（◆◆◆・★★ と書いていたのと同じ）
const url = (f: string) => rarity[`./assets/rarity/${f}.png`];
export function rarityIcons(r: string): string[] | undefined {
  if (/^◊+$/.test(r)) return Array<string>(r.length).fill(url("diamond"));
  if (/^☆+$/.test(r)) return Array<string>(r.length).fill(url("star"));
  if (/^✵+$/.test(r)) return Array<string>(r.length).fill(url("shiny"));
  if (r === "Crown Rare") return [url("crown")];
  if (r === "Promo") return [url("promo")];
  return undefined;
}
