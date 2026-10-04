// カード画像を縮小してサムネイルを作る（幅160px の WebP）。
// 出力: public/thumbs/<カードID>.webp（Web版はファイルとして配信、単一HTML版は base64 で埋め込む）
// 既にあるものは作り直さない。新弾が出たら差分だけ取りに行く。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import type { Card } from "./lib/types.ts";

const ROOT = join(import.meta.dirname, "..");
const OUT = join(ROOT, "public/thumbs");
mkdirSync(OUT, { recursive: true });
const cards: Card[] = JSON.parse(readFileSync(join(ROOT, "data/cards.json"), "utf8"));
const WIDTH = 160;
const CONCURRENCY = 6;

const todo = cards.filter((c) => !existsSync(join(OUT, `${c.id}.webp`)));
console.log(`サムネイル ${cards.length - todo.length} 枚は作成済み / ${todo.length} 枚を作る`);

let done = 0;
const failed: string[] = [];
async function one(c: Card) {
  for (const p of c.prints) {
    try {
      const res = await fetch(p.image);
      if (!res.ok) throw new Error(`${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      const out = await sharp(buf).resize({ width: WIDTH }).webp({ quality: 72 }).toBuffer();
      writeFileSync(join(OUT, `${c.id}.webp`), out);
      return;
    } catch {
      // 代表プリントの画像が無ければ、別の収録の画像を使う
    }
  }
  failed.push(c.id);
}

const queue = [...todo];
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    for (let c = queue.shift(); c; c = queue.shift()) {
      await one(c);
      if (++done % 200 === 0) console.log(`  ${done}/${todo.length}`);
    }
  }),
);
console.log(`完了。失敗 ${failed.length} 枚${failed.length ? `: ${failed.join(", ")}` : ""}`);
