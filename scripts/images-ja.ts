// 日本語のカード画像（Game8 掲載のもの）を一度だけ取得して public/cards-ja/ に置く。取得済みのものは取り直さない。
// 取得マナー（lib/polite.ts）: robots.txt を守り、2秒に1枚、個人用と分かる UA。元の大きさ（約311×440px）のまま WebP にする
//   npm run images-ja      （先に npm run build-index で src/data/ja-image-urls.json を作っておく）
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { jaImageFile } from "./lib/ja-images.ts";
import { allowed, get } from "./lib/polite.ts";

const ROOT = join(import.meta.dirname, "..");
const urls: string[] = JSON.parse(readFileSync(join(ROOT, "src/data/ja-image-urls.json"), "utf8"));
mkdirSync(join(ROOT, "public/cards-ja"), { recursive: true });
// どの URL から作ったか（あとで確かめられるように）
const manifestFile = join(ROOT, "public/cards-ja/sources.json");
const manifest: Record<string, string> = existsSync(manifestFile) ? JSON.parse(readFileSync(manifestFile, "utf8")) : {};
const todo = urls.filter((u) => !existsSync(join(ROOT, "public", jaImageFile(u))));
console.log(`日本語のカード画像: ${urls.length} 枚中 ${todo.length} 枚を取得（約 ${Math.ceil((todo.length * 2) / 60)} 分）`);
let done = 0, failed = 0;
for (const url of todo) {
  try {
    if (!(await allowed(url))) {
      console.log(`  robots.txt で禁止: ${url}`);
      failed++;
      continue;
    }
    const res = await get(url, "https://game8.jp/");
    if (!res.ok) {
      failed++;
      continue;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const file = jaImageFile(url);
    await sharp(buf).webp({ quality: 85 }).toFile(join(ROOT, "public", file));
    manifest[file.replace("cards-ja/", "")] = url;
    done++;
    // 途中で止めても続きから取れるよう、こまめに記録する
    if (done % 50 === 0) {
      writeFileSync(manifestFile, JSON.stringify(manifest, null, 1));
      console.log(`  ${done}/${todo.length}`);
    }
  } catch (e) {
    console.log(`  失敗: ${url} ${e}`);
    failed++;
  }
}
writeFileSync(manifestFile, JSON.stringify(manifest, null, 1));
console.log(`取得 ${done} 枚 ・ 失敗 ${failed} 枚`);
