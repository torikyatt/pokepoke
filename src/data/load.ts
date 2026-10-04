// 埋め込みデータの展開と画像URL
import packed from "virtual:app-data";
import thumbs from "virtual:thumbs";
import type { AppCard, AppData } from "../types.ts";

export type ImageLang = "ja" | "en";

export async function loadData(): Promise<AppData> {
  const bin = Uint8Array.from(atob(packed), (c) => c.charCodeAt(0));
  const stream = new Blob([bin]).stream().pipeThrough(new DecompressionStream("gzip"));
  return JSON.parse(await new Response(stream).text());
}

/**
 * 一覧用のサムネイルの候補（上から順に試す）。
 *   Web版: thumbs-ja/（日本語・Game8）と thumbs/（英語・PocketDecks）のファイル
 *   単一HTML版: 日本語のサムネイルを埋め込み（日本語が無いカードは英語）。英語を選んだときはネットの英語画像を使い、
 *              オフラインなら埋め込みに戻す
 */
export function thumbUrls(card: AppCard, lang: ImageLang): string[] {
  if (thumbs) {
    const b = thumbs[card.id];
    const embedded = b ? `data:image/webp;base64,${b}` : undefined;
    return (lang === "en" ? [card.image, embedded] : [embedded, card.image]).filter((u): u is string => !!u);
  }
  const ja = card.jaThumb ? `thumbs-ja/${card.id}.webp` : undefined;
  const en = `thumbs/${card.id}.webp`;
  return (lang === "ja" ? [ja, en] : [en, ja]).filter((u): u is string => !!u);
}
export const thumbUrl = (card: AppCard, lang: ImageLang) => thumbUrls(card, lang)[0];

/** 詳細画面の大きい画像（日本語は Game8、英語は PocketDecks） */
export function largeUrl(card: AppCard, lang: ImageLang): string {
  return lang === "ja" && card.imageJa ? card.imageJa : card.image;
}

export const isSingleFile = __SINGLE__;
