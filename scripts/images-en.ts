// 英語のカード画像（PocketDecks）を一度だけ取得して public/cards-en/ に置く。取得済みのものは取り直さない。
// GitHub の配信に負担をかけないよう、同時に4枚まで・合間に少し待つ。画像はそのまま（約367×512px の WebP）
//   npm run images-en      （先に npm run normalize で data/cards.base.json を作っておく）
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { enImageFile, enImageRemote } from "../src/en-images.ts";
import type { Card } from "./lib/types.ts";

const ROOT = join(import.meta.dirname, "..");
const cards: Card[] = JSON.parse(readFileSync(join(ROOT, "data/cards.base.json"), "utf8"));
mkdirSync(join(ROOT, "public/cards-en"), { recursive: true });
const ids = [...new Set(cards.flatMap((c) => c.prints.map((p) => p.id)))];
const todo = ids.filter((id) => !existsSync(join(ROOT, "public", enImageFile(id))));
console.log(`英語のカード画像: ${ids.length} 枚中 ${todo.length} 枚を取得`);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let done = 0;
const failed: string[] = [];
async function one(id: string) {
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(enImageRemote(id), { headers: { "User-Agent": "pokepoke-lab/0.1 (card image mirror)" } });
      if (res.status === 404) break;
      if (!res.ok) throw new Error(String(res.status));
      writeFileSync(join(ROOT, "public", enImageFile(id)), Buffer.from(await res.arrayBuffer()));
      if (++done % 200 === 0) console.log(`  ${done}/${todo.length}`);
      return;
    } catch {
      await sleep(2000 * (i + 1));
    }
  }
  failed.push(id);
}
const queue = [...todo];
await Promise.all(
  Array.from({ length: 4 }, async () => {
    for (let id = queue.shift(); id; id = queue.shift()) {
      await one(id);
      await sleep(150);
    }
  }),
);
console.log(`取得 ${done} 枚 ・ 失敗 ${failed.length} 枚${failed.length ? `（${failed.slice(0, 20).join(", ")}）` : ""}`);
