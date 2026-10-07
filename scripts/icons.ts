// public/icons/icon.svg から、ホーム画面用のアイコン（PNG）と、ブラウザ・検索結果用の favicon.ico を作る
//   npx tsx scripts/icons.ts
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const PUB = join(import.meta.dirname, "../public");
const DIR = join(PUB, "icons");
const svg = readFileSync(join(DIR, "icon.svg"));
const png = (size: number) => sharp(svg, { density: 300 }).resize(size, size).png().toBuffer();
// 48・96: 検索結果のアイコン（Google は48の倍数を勧めている）、180: iPhone のホーム画面、192・512: Android（Web アプリのマニフェスト）
for (const size of [48, 96, 180, 192, 512]) writeFileSync(join(DIR, `icon-${size}.png`), await png(size));

// favicon.ico（中身は16・32・48の PNG）。/favicon.ico を見に来るブラウザや検索エンジンのため
const sizes = [16, 32, 48];
const images = await Promise.all(sizes.map(png));
const header = Buffer.alloc(6 + 16 * sizes.length);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2); // アイコン
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
sizes.forEach((s, i) => {
  const e = 6 + 16 * i;
  header.writeUInt8(s, e);
  header.writeUInt8(s, e + 1);
  header.writeUInt16LE(1, e + 4); // 面の数
  header.writeUInt16LE(32, e + 6); // 色の深さ
  header.writeUInt32LE(images[i].length, e + 8);
  header.writeUInt32LE(offset, e + 12);
  offset += images[i].length;
});
writeFileSync(join(PUB, "favicon.ico"), Buffer.concat([header, ...images]));
console.log("アイコンを作りました");
