// カード画像を縮小してサムネイルを作る。既にあるものは作り直さない（新弾は差分だけ取りに行く）。
// どの絵柄から作ったかを sources.json に残し、基本の絵柄（lib/prints.ts）が変わったものだけ作り直す。
//   npm run thumbs           英語版 public/thumbs/<ID>.webp    幅160px（PocketDecks の画像）
//   npm run thumbs -- --ja   日本語版 public/thumbs-ja/<ID>.webp 幅200px（Game8 の画像。2秒に1枚）
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { jaImageIndex } from "./lib/game8.ts";
import { orderedPrints } from "./lib/prints.ts";
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
  if (!jaOf) src.set(c.id, orderedPrints(c.prints).map((p) => p.image));
  else {
    const url = jaOf(c);
    if (url) src.set(c.id, [url]);
  }
}

// どの画像から作ったか（無ければ以前のやり方 = 最初の収録の画像から作ったものとみなす）
const manifestFile = join(OUT, "sources.json");
const manifest: Record<string, string> = existsSync(manifestFile) ? JSON.parse(readFileSync(manifestFile, "utf8")) : {};
const oldJa = ja ? jaImageIndexOld(join(ROOT, "data")) : undefined;
for (const c of cards) {
  if (manifest[c.id] || !existsSync(join(OUT, `${c.id}.webp`))) continue;
  manifest[c.id] = ja ? (oldJa!(c) ?? "") : c.prints[0].image;
}
const todo = cards.filter((c) => src.has(c.id) && (!existsSync(join(OUT, `${c.id}.webp`)) || manifest[c.id] !== src.get(c.id)![0]));
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
      manifest[c.id] = url;
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
writeFileSync(manifestFile, JSON.stringify(manifest, null, 0).replace(/,"/g, ',\n"'));
console.log(`完了。失敗 ${failed.length} 枚${failed.length ? `: ${failed.join(", ")}` : ""}`);

/** 以前の選び方（最初の収録に当たる Game8 の画像）。作り直しが要るかの判定にだけ使う */
function jaImageIndexOld(dataDir: string) {
  const g8: { g8Id: number; set: string; number: number; image?: string }[] = JSON.parse(readFileSync(join(dataDir, "game8/cards.json"), "utf8"));
  const match: Record<string, { g8: number[] }> = JSON.parse(readFileSync(join(dataDir, "game8/match.json"), "utf8"));
  const byId = new Map(g8.map((c) => [c.g8Id, c]));
  const setOf = (s: string) => ({ pa: "PROMO-A", pb: "PROMO-B" } as Record<string, string>)[s] ?? s.charAt(0).toUpperCase() + s.slice(1);
  return (card: Card) => {
    const matched = (match[card.id]?.g8 ?? []).map((id) => byId.get(id)).filter((c) => !!c && !!c.image);
    const own = matched.find((m) => m!.set === setOf(card.prints[0].set) && m!.number === Number(card.id.split("-").pop()));
    return (own ?? matched[0])?.image;
  };
}
