// 埋め込みデータの展開と画像URL
import packed from "virtual:app-data";
import thumbs from "virtual:thumbs";
import type { AppCard, AppData, AppPrint } from "../types.ts";
import { enImageFile, enImageRemote } from "../en-images.ts";

export type ImageLang = "ja" | "en";

export async function loadData(): Promise<AppData> {
  const bin = Uint8Array.from(atob(packed), (c) => c.charCodeAt(0));
  const stream = new Blob([bin]).stream().pipeThrough(new DecompressionStream("gzip"));
  return JSON.parse(await new Response(stream).text());
}

/** 自前の英語画像（cards-en/）は、単一HTML版ではサイトに無いので元の URL を使う */
const enWeb = (url: string) => (__SINGLE__ && url.startsWith("cards-en/") ? enImageRemote(url.slice(9, -5)) : url);

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
    return (lang === "en" ? [enWeb(card.image), embedded] : [embedded, enWeb(card.image)]).filter((u): u is string => !!u);
  }
  const ja = card.jaThumb ? `thumbs-ja/${card.id}.webp` : undefined;
  const en = `thumbs/${card.id}.webp`;
  return (lang === "ja" ? [ja, en] : [en, ja]).filter((u): u is string => !!u);
}
export const thumbUrl = (card: AppCard, lang: ImageLang) => thumbUrls(card, lang)[0];

/** 詳細画面の大きい画像（日本語は Game8、英語は PocketDecks の画像。どちらも自前で置いたもの） */
export function largeUrl(card: AppCard, lang: ImageLang): string {
  return lang === "ja" && card.imageJa ? card.imageJa : enWeb(card.image);
}

/** 絵柄（収録）ごとの大きい画像。英語は収録IDから決まる。日本語が無い絵柄は英語 */
export function printImageUrl(p: AppPrint, lang: ImageLang): string {
  return lang === "ja" && p.imageJa ? p.imageJa : enWeb(p.imageEn ?? enImageFile(p.id));
}

export const isSingleFile = __SINGLE__;
