// アプリに埋め込むデータの形（scripts/build-index.ts が作る）

export type EnergyType =
  | "grass" | "fire" | "water" | "lightning" | "psychic"
  | "fighting" | "darkness" | "metal" | "dragon" | "colorless";

export type CardKind = "pokemon" | "item" | "supporter" | "tool" | "fossil" | "stadium";
export type Stage = "basic" | "stage1" | "stage2";
export type Rule = "normal" | "ex" | "mega_ex";
export type CardGroup = "ultra_beast" | "ancient" | "future" | "team_rocket";
export type Slot = "ability" | "attack" | "text";

export interface AppEffect {
  slot: Slot;
  nameJa?: string;
  nameEn?: string;
  textJa?: string;
  textEn?: string;
  machine?: true; // 仮訳
  tags: string[];
}

export interface AppAttack extends AppEffect {
  cost: Partial<Record<EnergyType, number>>;
  costTotal: number;
  costTyped: number;
  damage?: number;
  damageVariable: boolean;
}

export interface AppPrint {
  id: string;
  set: string;
  setName: string;
  rarity: string;
}

export interface AppCard {
  id: string;
  nameJa: string;
  nameEn: string;
  nameMachine?: true;
  kind: CardKind;
  type?: EnergyType;
  // トレーナーズが効果文で名指ししているタイプ（例: カスミ → 水）。タイプ絞り込みに使う
  typeRefs: EnergyType[];
  accelTypes: EnergyType[]; // エネ加速で付けるエネのタイプ
  stage?: Stage;
  rule: Rule;
  groups: CardGroup[];
  points?: number;
  hp?: number;
  weakness?: EnergyType;
  retreat?: number;
  evolvesFrom: string[];
  evolvesTo: string[];
  ability?: AppEffect;
  attacks: AppAttack[];
  text?: AppEffect;
  prints: AppPrint[];
  image: string;
  order: number; // アプリのデッキ編集画面と同じ並び（図鑑順）
  released: string; // 最初の収録の発売日
  rarities: string[]; // 収録されているレアリティ（◊ ◊◊ … ☆ … Crown Rare, Promo）
  sets: string[]; // 収録パック（PocketDecks のセットコード）
  maxDamage: number; // ワザの最大ダメージ（ワザが無ければ 0）
  minCost?: number; // いちばん軽いワザのエネ数 // 高解像度画像（オンライン時）
  tags: string[]; // 全効果のタグの和集合
  refs: string[]; // 効果文が名前で指しているカードID
}

export interface AppTag {
  id: string;
  ja: string;
  parent?: string;
  supplies?: string[];
  requires?: string[];
}

export type LexTarget =
  | { tag: string }
  | { type: EnergyType }
  | { kind: CardKind | "trainer" }
  | { stage: Stage | "evolved" }
  | { rule: Rule | "any_ex" | "not_ex" }
  | { group: CardGroup }
  | { slot: "attack" | "ability" }
  | { variable: true };

export interface LexEntry {
  expr: string;
  target: LexTarget;
  weight: number;
}

export interface AppSet {
  code: string; // PocketDecks のセットコード（a1, pa …）
  name: string; // 英語名
  nameJa: string; // 日本語名（Game8 の収録パック名から）
  released: string;
}

export interface AppData {
  builtAt: string;
  sets: AppSet[];
  cards: AppCard[];
  tags: AppTag[];
  lexicon: LexEntry[];
}

export const TYPE_JA: Record<EnergyType, string> = {
  grass: "草", fire: "炎", water: "水", lightning: "雷", psychic: "超",
  fighting: "闘", darkness: "悪", metal: "鋼", dragon: "ドラゴン", colorless: "無色",
};
export const KIND_JA: Record<CardKind, string> = {
  pokemon: "ポケモン", item: "グッズ", supporter: "サポート", tool: "ポケモンのどうぐ", fossil: "化石", stadium: "スタジアム",
};
export const STAGE_JA: Record<Stage, string> = { basic: "たね", stage1: "1進化", stage2: "2進化" };
export const RULE_JA: Record<Rule, string> = { normal: "通常", ex: "ex", mega_ex: "メガシンカex" };
export const GROUP_JA: Record<CardGroup, string> = {
  ultra_beast: "ウルトラビースト", ancient: "古代", future: "未来", team_rocket: "ロケット団",
};
