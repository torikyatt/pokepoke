// デッキの QR コード: 画像に書き出すときに共有URLを QR にして入れ、画像（スクショ・保存した画像）から読み取って取り込む。
// スマホのカメラで読めば共有URLがそのまま開き、「マイデッキに保存」で取り込める
import qrcode from "qrcode-generator";
import { isSingleFile } from "./data/load.ts";
import { decodeShare, encodeShare } from "./deck.ts";
import { getLang } from "./i18n.ts";
import type { Deck } from "./store.ts";

/** デッキの共有URL。サイトでは /d/<共有コード>（英語なら /en/d/…）にして、リンクのプレビューにデッキ名とカードの画像を出す
 *  （server/deck-page.ts）。1ファイル版（file://）では、そのファイルの #/share/<共有コード> */
export function shareUrlOf(deck: Pick<Deck, "name" | "cards" | "energy">): string {
  const code = encodeShare(deck);
  if (isSingleFile || !/^https?:$/.test(location.protocol)) return `${location.href.split("#")[0]}#/share/${code}`;
  return `${location.origin}${getLang() === "en" ? "/en" : ""}/d/${code}`;
}

/** 共有URL（/d/<共有コード>・#/share/<共有コード>）や、まわりに文字のある貼り付けから、共有コードを取り出す。URLでなければそのまま */
export function shareCodeOf(text: string): string {
  const t = text.trim();
  return t.match(/(?:#\/share|https?:\/\/[^/\s]+(?:\/en)?\/d)\/([^/?#\s]+)/)?.[1] ?? t.match(/(?:^|\s)(2~[^\s]+)/)?.[1] ?? t;
}

/** 文字列を QR コードの画像（data URL）にする。1マス cell px、まわりに規格どおり4マスの白い余白。size は画像の幅（px） */
export function qrImage(text: string, cell = 3): { url: string; size: number } {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  return { url: qr.createDataURL(cell, cell * 4), size: (qr.getModuleCount() + 8) * cell };
}

/** 画像の中の QR コードからデッキを読む。見つからなければ undefined */
export async function deckFromImage(file: Blob): Promise<ReturnType<typeof decodeShare> | undefined> {
  const { default: jsQR } = await import("jsqr");
  const bmp = await createImageBitmap(file);
  // 大きすぎる画像は縮める（QR のマスがつぶれない程度に）
  const scale = Math.min(1, 3000 / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0, w, h);
  const found = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: "dontInvert" });
  if (!found) return undefined;
  const code = shareCodeOf(found.data);
  try {
    return decodeShare(code);
  } catch {
    return undefined;
  }
}
