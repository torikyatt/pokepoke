// 日本語のカード画像を自前で置く場所（public/cards-ja/<URL のハッシュ>.webp）。同じ絵は1枚にまとまる
import { createHash } from "node:crypto";
export const jaImageFile = (url: string) => `cards-ja/${createHash("sha1").update(url).digest("hex").slice(0, 16)}.webp`;
