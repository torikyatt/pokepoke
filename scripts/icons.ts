// public/icons/icon.svg から、ホーム画面用のアイコン（PNG）を作る
//   npx tsx scripts/icons.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const DIR = join(import.meta.dirname, "../public/icons");
const svg = readFileSync(join(DIR, "icon.svg"));
// 180: iPhone のホーム画面、192・512: Android（Web アプリのマニフェスト）
for (const size of [180, 192, 512]) await sharp(svg, { density: 300 }).resize(size, size).png().toFile(join(DIR, `icon-${size}.png`));
console.log("アイコンを作りました");
