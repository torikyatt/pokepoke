// 大会のデッキリストの「おすすめ度」。カード詳細の「このカードを使ったデッキ」（おすすめ順）と、
// 検索の「〇〇デッキ」（scripts/build-index.ts で、カードごとにおすすめ上位のデッキから採用率を数えておく）で同じものを使う

const DAY = 86400e3;
export const HALF_LIFE_DAYS = 21; // 3週間ごとに重みが半分になる

export interface ScoredDeck {
  date: string;
  players: number;
  place: number; // 0 は不明
  wins: number;
  losses: number;
  dup: number; // 同じ構成のデッキの数
}

/**
 * おすすめ度: 最近の大会で好成績なものほど高い。
 *   成績 = 上位何%か（1位なら1に近い）＋ 上位8位以内なら加点 ＋ 大きな大会なら少し加点 ＋ 同じ構成が多ければ少し加点
 *   新しさ = 最新の大会から3週間ごとに半分
 */
export function recommendScore(d: ScoredDeck, newest: number): number {
  const top = d.place ? 1 - (d.place - 1) / Math.max(d.players, 1) : Math.max(0, 0.5 + (d.wins - d.losses) * 0.05);
  const quality = top + (d.place && d.place <= 8 ? 0.3 : 0) + 0.1 * Math.log10(Math.max(d.players, 32) / 32) + 0.05 * Math.log2(d.dup);
  const age = Math.max(0, (newest - Date.parse(d.date)) / DAY);
  return quality * 0.5 ** (age / HALF_LIFE_DAYS);
}
