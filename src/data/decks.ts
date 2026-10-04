// 大会で使われたデッキリスト（Limitless の大会結果。勝ち越し・五分のもの。同じ構成はまとめてある）。
// 量が多いので起動時には読まず、カード詳細で「このカードを使ったデッキ」を出すときに読み込む
import { useEffect, useState } from "react";
import type { EnergyType } from "../types.ts";

export interface TournamentDeck {
  tournament: string;
  date: string;
  players: number;
  archId: string;
  arch: string; // デッキタイプの日本語名
  place: number; // 0 は不明
  wins: number;
  losses: number;
  ties: number;
  energy: EnergyType[];
  cards: [string, number][]; // [カードID, 枚数]
  dup: number; // 同じ構成のデッキの数
}
export interface DeckIndex {
  fetchedAt: string;
  decks: TournamentDeck[];
  byCard: Map<string, number[]>; // カードID → そのカードが入っているデッキ
  newest: number; // いちばん新しい大会の日（おすすめ順の「新しさ」の基準）
}

type Raw = {
  fetchedAt: string;
  tournaments: [string, string, number][];
  archetypes: [string, string][];
  decks: [number, number, number, number, number, number, string, string, number][];
};

let loading: Promise<DeckIndex> | undefined;
export function loadDecks(): Promise<DeckIndex> {
  loading ??= import("virtual:decks").then(async ({ default: packed }) => {
    const bin = Uint8Array.from(atob(packed), (c) => c.charCodeAt(0));
    const stream = new Blob([bin]).stream().pipeThrough(new DecompressionStream("gzip"));
    const raw: Raw = JSON.parse(await new Response(stream).text());
    const decks = raw.decks.map(([t, a, place, wins, losses, ties, energy, cards, dup]): TournamentDeck => {
      const [tournament, date, players] = raw.tournaments[t];
      const [archId, arch] = raw.archetypes[a];
      return {
        tournament, date, players, archId, arch, place, wins, losses, ties, dup,
        energy: (energy ? energy.split(",") : []) as EnergyType[],
        cards: cards.split(" ").map((x) => {
          const [id, n] = x.split("*");
          return [id, n ? Number(n) : 1];
        }),
      };
    });
    const byCard = new Map<string, number[]>();
    decks.forEach((d, i) => {
      for (const [id] of d.cards) (byCard.get(id) ?? byCard.set(id, []).get(id)!).push(i);
    });
    const newest = Math.max(0, ...raw.tournaments.map(([, date]) => Date.parse(date)));
    return { fetchedAt: raw.fetchedAt, decks, byCard, newest };
  });
  return loading;
}

export function useTournamentDecks(): DeckIndex | undefined {
  const [index, setIndex] = useState<DeckIndex>();
  useEffect(() => {
    let alive = true;
    loadDecks().then((x) => alive && setIndex(x));
    return () => {
      alive = false;
    };
  }, []);
  return index;
}
