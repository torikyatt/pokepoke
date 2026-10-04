// 埋め込みデータの展開と画像URL
import packed from "virtual:app-data";
import thumbs from "virtual:thumbs";
import type { AppCard, AppData } from "../types.ts";

export async function loadData(): Promise<AppData> {
  const bin = Uint8Array.from(atob(packed), (c) => c.charCodeAt(0));
  const stream = new Blob([bin]).stream().pipeThrough(new DecompressionStream("gzip"));
  return JSON.parse(await new Response(stream).text());
}

/** 一覧用のサムネイル。単一HTML版は埋め込み、Web版は thumbs/ のファイル */
export function thumbUrl(card: AppCard): string {
  if (thumbs) {
    const b = thumbs[card.id];
    return b ? `data:image/webp;base64,${b}` : card.image;
  }
  return `thumbs/${card.id}.webp`;
}

export const isSingleFile = __SINGLE__;
