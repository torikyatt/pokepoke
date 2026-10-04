// カード画像を縮小してサムネイルを作る。既にあるものは作り直さない（新弾は差分だけ取りに行く）。
//   npm run thumbs           英語版 public/thumbs/<ID>.webp    幅160px（PocketDecks の画像）
//   npm run thumbs -- --ja   日本語版 public/thumbs-ja/<ID>.webp 幅200px（Game8 の画像。2秒に1枚）
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { jaImageIndex } from "./lib/game8.ts";
import type { Card } from "./lib/types.ts";

const ROOT = join(import.meta.dirname, "..");
const ja = process.argv.includes("--ja");
const OUT = join(ROOT, ja ? "public/thumbs-ja" : "public/thumbs");
mkdirSync(OUT, { recursive: true });
const cards: Card[] = JSON.parse(readFileSync(join(ROOT, "data/cards.json"), "utf8"));
const WIDTH = ja ? 200 : 160;
// Game8 には SPEC 3.4 の取得マナー（2秒に1リクエスト、個人用のUA）を守る
const CONCURRENCY = ja ? 1 : 6;
const INTERVAL_MS = ja ? 2000 : 0;
const UA = "pokepoke-personal/0.1 (personal, non-commercial deck builder; max 1 req / 2s)";

const src = new Map<string, string[]>();
const jaOf = ja ? jaImageIndex(join(ROOT, "data")) : undefined;
for (const c of cards) {
  if (!jaOf) src.set(c.id, c.prints.map((p) => p.image));
  else {
    const url = jaOf(c);
    if (url) src.set(c.id, [url]);
  }
}

const todo = cards.filter((c) => src.has(c.id) && !existsSync(join(OUT, `${c.id}.webp`)));
console.log(`${ja ? "日本語" : "英語"}サムネイル: 作成済み ${cards.length - todo.length} 枚 / これから ${todo.length} 枚${ja ? `（約${Math.ceil((todo.length * INTERVAL_MS) / 60000)}分）` : ""}`);
if (ja) console.log(`日本語画像の無いカード ${cards.length - src.size} 枚（英語画像で代用）`);

let last = 0;
let done = 0;
const failed: string[] = [];
async function one(c: Card) {
  for (const url of src.get(c.id)!) {
    const wait = last + INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    last = Date.now();
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA } });
      if (!res.ok) throw new Error(`${res.status}`);
      const out = await sharp(Buffer.from(await res.arrayBuffer())).resize({ width: WIDTH }).webp({ quality: 74 }).toBuffer();
      writeFileSync(join(OUT, `${c.id}.webp`), out);
      return;
    } catch {
      // 次の候補へ
    }
  }
  failed.push(c.id);
}

const queue = [...todo];
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    for (let c = queue.shift(); c; c = queue.shift()) {
      await one(c);
      if (++done % 100 === 0) console.log(`  ${done}/${todo.length}`);
    }
  }),
);
console.log(`完了。失敗 ${failed.length} 枚${failed.length ? `: ${failed.join(", ")}` : ""}`);
