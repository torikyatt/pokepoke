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
