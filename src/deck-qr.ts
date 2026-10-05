// デッキの QR コード: 画像に書き出すときに共有URLを QR にして入れ、画像（スクショ・保存した画像）から読み取って取り込む。
// スマホのカメラで読めば共有URLがそのまま開き、「マイデッキに保存」で取り込める
import qrcode from "qrcode-generator";
import { decodeShare, encodeShare } from "./deck.ts";
import type { Deck } from "./store.ts";

export const shareUrlOf = (deck: Pick<Deck, "name" | "cards" | "energy">) => `${location.href.split("#")[0]}#/share/${encodeShare(deck)}`;

/** 文字列を QR コードの画像（data URL）にする。1マス cell px、まわりに規格どおり4マスの白い余白。size は画像の幅（px） */
export function qrImage(text: string, cell = 4): { url: string; size: number } {
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
  const code = found.data.match(/#\/share\/([^/?#\s]+)/)?.[1] ?? found.data.trim();
  try {
    return decodeShare(code);
  } catch {
    return undefined;
  }
}
