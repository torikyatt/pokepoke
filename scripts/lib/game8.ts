import { readFileSync } from "node:fs";
import { join } from "node:path";
// Game8 から抽出したデータの形（data/game8/*.json）。文字列はNFKC正規化・前後空白除去済み

export interface G8Card {
  g8Id: number;
  url?: string;
  title: string; // 例: "ラプラスex（PROMO-A-014/P-A）"
  set: string; // 例: "A1", "PROMO-A"
  number: number;
  numberLabel: string; // 例: "014/P-A"
  rarity: string;
  category: string; // "ポケモン" | "トレーナーズ" | "サポート"（揺れあり）
  trainerType?: string; // "サポート" | "グッズ" | "グッズ（化石）" | "ポケモンのどうぐ" | "スタジアム"
  stage?: string;
  hp?: number;
  type?: string;
  weakness?: string;
  retreat?: number;
  name: string;
  text?: string; // トレーナーズの効果文
  pack?: string;
  image?: string; // 日本語のカード画像（315×440 PNG）
  acquire?: string; // 入手区分（パック / イベント / ショップ / プレミアムパス …）
  howTo?: string; // 入手方法（例: ラプラスイベントのプロモカードパックで入手）
  group?: string; // 分類（ベビー / ウルトラビースト / 古代 / 未来 / ロケット団 / メガ）
}

// ワザ・特性。カードとは「ポケモン名＋初出の収録パック」で結ばれている（再録カードは初出パックの行を共有する）
export interface G8Move {
  g8Id: number;
  kind: "attack" | "ability";
  name: string;
  pokemon: string;
  set: string;
  index?: number; // ワザの並び順（1始まり）
  cost: string[]; // 例: ["雷", "無色"]
  damage?: string; // 例: "30", "30×", "20+"
  text?: string;
}

/**
 * カードの日本語画像（Game8）を引く関数を作る。代表プリント（最初の収録）と同じパック・番号の Game8 カードを優先し、
 * 無ければ照合済みの他の収録の画像を使う。data/game8/{cards,match}.json が要る
 */
export function jaImageIndex(dataDir: string): (card: { id: string; prints: { set: string }[] }) => string | undefined {
  const g8: G8Card[] = JSON.parse(readFileSync(join(dataDir, "game8/cards.json"), "utf8"));
  const match: Record<string, { g8: number[] }> = JSON.parse(readFileSync(join(dataDir, "game8/match.json"), "utf8"));
  const byId = new Map(g8.map((c) => [c.g8Id, c]));
  const setOf = (s: string) => ({ pa: "PROMO-A", pb: "PROMO-B" } as Record<string, string>)[s] ?? s.charAt(0).toUpperCase() + s.slice(1);
  return (card) => {
    const matched = (match[card.id]?.g8 ?? []).map((id) => byId.get(id)).filter((c): c is G8Card => !!c && !!c.image);
    const own = matched.find((m) => m.set === setOf(card.prints[0].set) && m.number === Number(card.id.split("-").pop()));
    return (own ?? matched[0])?.image;
  };
}
