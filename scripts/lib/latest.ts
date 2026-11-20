// 「最新のカード」に入るパック（アプリの検索エンジン src/search/engine.ts の latest と同じ決め方）:
//   いちばん新しい拡張パック（50種以上）の発売日以降に出たパックと、いちばん新しいプロモ（プロモC など）
import type { Card } from "./types.ts";

export function latestSets(cards: Card[]): Set<string> {
  const date = new Map<string, string>();
  const count = new Map<string, number>();
  for (const c of cards) {
    if (c.upcoming && !c.upcoming.released) continue;
    for (const p of c.prints) if (p.released && (!date.has(p.set) || p.released < date.get(p.set)!)) date.set(p.set, p.released);
    for (const s of new Set(c.prints.map((p) => p.set))) count.set(s, (count.get(s) ?? 0) + 1);
  }
  const from = [...count].filter(([s, n]) => n >= 50 && !/^p/.test(s) && date.get(s)).map(([s]) => date.get(s)!).sort().pop() ?? "9999";
  const promo = [...count.keys()].filter((s) => /^p[a-z]$/.test(s)).sort().pop();
  return new Set([...count.keys()].filter((s) => (date.get(s) ?? "0") >= from || s === promo));
}
