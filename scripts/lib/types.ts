export type EnergyType =
  | "grass" | "fire" | "water" | "lightning" | "psychic"
  | "fighting" | "darkness" | "metal" | "dragon" | "colorless";

export type CardKind = "pokemon" | "item" | "supporter" | "tool" | "fossil" | "stadium";

export interface Effect {
  nameEn?: string;
  nameJa?: string;
  textEn: string;
  textJa?: string;
  jaSource?: "official" | "machine"; // official = Game8、machine = LLM仮訳
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
}

export interface Card {
  id: string; // 代表プリントのID
  nameEn: string;
  nameJa?: string;
  kind: CardKind;
  type?: EnergyType;
  stage?: "basic" | "stage1" | "stage2";
  evolvesFromName?: string;
  evolvesFrom: string[]; // カードID
  evolvesTo: string[]; // カードID
  rule: "normal" | "ex" | "mega_ex";
  points?: number;
  hp?: number;
  weakness?: EnergyType;
  retreat?: number;
  ability?: Effect;
  attacks: Attack[];
  text?: Effect;
  prints: Print[];
  tags: string[];
}
