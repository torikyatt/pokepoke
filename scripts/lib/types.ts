export type EnergyType =
  | "grass" | "fire" | "water" | "lightning" | "psychic"
  | "fighting" | "darkness" | "metal" | "dragon" | "colorless";

export type CardGroup = "ultra_beast" | "ancient" | "future" | "team_rocket" | "baby";

export type CardKind = "pokemon" | "item" | "supporter" | "tool" | "fossil" | "stadium";

export interface Effect {
  nameEn?: string;
  nameJa?: string;
  textEn: string;
  textJa?: string;
  jaSource?: "official" | "machine"; // official = Game8、machine = LLM仮訳
  unknown?: true; // まだ公開されていない（実装前のカード。名前・効果文が無い）
  tentative?: true; // 効果文が推測（実装前のカードで、粗い先行画像から読み取ったもの）
  tags: string[];
}

export interface Attack extends Effect {
  cost: Partial<Record<EnergyType, number>>;
  costTotal: number;
  costTyped: number; // 無色以外の個数
  damage?: number;
  damageVariable: boolean;
}

export interface Print {
  id: string;
  set: string;
  setName: string;
  rarity: string;
  image: string;
  released?: string; // 発売日（YYYY-MM-DD）
  imageEn?: string; // 実装前のカードで、英語の画像が日本語の画像（image）と別にあるとき
  builderNr?: number; // アプリのデッキ編集画面での並び順
  pack?: string; // 先行公開のカード: 弾の中のパック（日本語。例: ピカチュウ）。無ければどのパックからも出る
  how?: string; // 先行公開のカード: パック以外の入手方法
  prelim?: true; // 先行公開の情報から既存のカードに足した絵違い（再録。data/upcoming*.yaml の reprints）
}

export interface Card {
  id: string; // 代表プリントのID
  nameEn: string;
  nameJa?: string;
  nameJaMachine?: boolean; // カード名が仮訳
  kind: CardKind;
  type?: EnergyType;
  type2?: EnergyType; // デュアルタイプの2つ目のタイプ
  stage?: "basic" | "stage1" | "stage2";
  evolvesFromName?: string;
  evolvesFrom: string[]; // カードID
  evolvesTo: string[]; // カードID
  rule: "normal" | "ex" | "mega_ex";
  groups: CardGroup[]; // ウルトラビースト・古代・未来・ロケット団（効果文の対象指定に使う）
  points?: number;
  hp?: number;
  weakness?: EnergyType;
  retreat?: number;
  ability?: Effect;
  attacks: Attack[];
  text?: Effect;
  prints: Print[];
  tags: string[];
  upcoming?: Upcoming; // 先行公開の情報から作ったカード（data/upcoming*.yaml）。released でなければ、まだ実装されていない
}

/** 実装前のカードの情報 */
export interface Upcoming {
  date?: string; // 実装予定日（YYYY-MM-DD。未定なら無し）
  source: string; // 情報の出どころ
  unknown?: ("weakness" | "retreat" | "hp")[]; // まだ公開されていない項目
  released?: true; // 実装日を過ぎた（元データにはまだ無い）。アプリでは実装済みのカードとして扱う
}
