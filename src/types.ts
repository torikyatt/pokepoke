// アプリに埋め込むデータの形（scripts/build-index.ts が作る）

export type EnergyType =
  | "grass" | "fire" | "water" | "lightning" | "psychic"
  | "fighting" | "darkness" | "metal" | "dragon" | "colorless";

export type CardKind = "pokemon" | "item" | "supporter" | "tool" | "fossil" | "stadium";
export type Stage = "basic" | "stage1" | "stage2";
export type Rule = "normal" | "ex" | "mega_ex";
export type CardGroup = "ultra_beast" | "ancient" | "future" | "team_rocket" | "baby";
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
  pack?: string; // その弾の中のパック（例: ミュウツー）。空なら弾のどのパックからも出る
  how?: string; // パック以外の入手方法（プロモなど）
  imageJa?: string; // この絵柄の日本語画像（Game8）
  imageEn?: string; // 英語画像をまだ自前で置いていないときだけ、元の URL。置いてあれば cards-en/<id>.webp
}

export interface AppCard {
  id: string;
  nameJa: string;
  nameEn: string;
  nameMachine?: true;
  nameKana?: string; // 漢字を含む名前のよみ（ローマ字検索用）
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
  image: string; // 高解像度画像（英語・PocketDecks。オンライン時）
  imageJa?: string; // 日本語の画像（Game8。オンライン時）
  jaThumb?: true; // 日本語のサムネイル（public/thumbs-ja/）がある
  order: number; // アプリのデッキ編集画面と同じ並び（図鑑順）
  released: string; // 最初の収録の発売日
  rarities: string[]; // 収録されているレアリティ（◊ ◊◊ … ☆ … Crown Rare, Promo）
  sets: string[]; // 収録パック（PocketDecks のセットコード）
  maxDamage: number; // ワザの最大ダメージ（ワザが無ければ 0）
  minCost?: number; // いちばん軽いワザのエネ数 // 高解像度画像（オンライン時）
  tags: string[]; // 全効果のタグの和集合
  refs: string[]; // 効果文が名前で指しているカードID
  refHow?: Record<string, string>; // 名前そのもの以外で指しているときの指し方（mega_ex / team_rocket / evolves:Riolu / attack:Puppy Pile …）
  supplies: Record<string, Selector[]>; // 場に作るもの（シナジーの供給）と、その効く相手
  requires: Record<string, RequireInfo>; // 何があると強いか（シナジーの要求）
}

/** 効果が効く相手（シナジー判定用。scripts/lib/targets.ts が英文から読む） */
/** トラッシュに送る・トラッシュで数えるカードの種類。any は何でも（手札からランダムに捨てるなど） */
export type TrashKind = "any" | "pokemon" | "supporter" | "item" | "tool" | "stadium";
/** 要求する側の条件（トラッシュのエネのタイプ、トラッシュで数えるカードの種類など） */
export interface RequireInfo {
  etypes?: EnergyType[];
  trash?: TrashKind[];
  trashTypes?: EnergyType[];
}

export interface Selector {
  self?: true; // 自分自身だけ（進化補助なら自分の進化先）
  ids?: string[]; // 名指しされたカード
  types?: EnergyType[];
  stages?: Stage[];
  groups?: CardGroup[];
  preHpMax?: number; // 進化元のHPがこれ以下
  hpMax?: number; // そのポケモン自身のHPがこれ以下（ルチアなど）
  rules?: Rule[]; // メガシンカex だけ など
  etypes?: EnergyType[]; // トラッシュに送る・使うエネのタイプ
  trash?: TrashKind[]; // 自分のトラッシュに送るカードの種類（supply.trash.fill）
  trashTypes?: EnergyType[]; // トラッシュに送るポケモンのタイプ（分かるときだけ）
  repeat?: true; // 毎ターン使える（特性・スタジアム・どうぐ）
  kinds?: ("pokemon" | "trainer")[]; // ポケモン（のワザ）だけ・トレーナーズだけ
}

export interface AppTag {
  id: string;
  ja: string;
  en?: string;
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
  kana?: string; // 漢字を含む表現のよみ（ローマ字検索用）
  target: LexTarget;
  weight: number;
}

export interface AppSet {
  code: string; // PocketDecks のセットコード（a1, pa …）
  name: string; // 英語名
  nameJa: string; // 日本語名（Game8 の収録パック名から）
  released: string;
}

/** 大会で使われたデッキタイプ（アーキタイプ） */
export interface AppArchetype {
  id: string;
  nameJa: string; // 「メガルカリオex＆ルカリオ」
  nameEn: string;
  keys: string[]; // デッキ名になっているカード
  share: number; // 勝ち越したデッキの中での割合
  decks: number;
  cards: { id: string; rate: number }[]; // 採用率（10%以上）
}
/** 大会データ（Limitless の大会結果を集計したもの） */
export interface AppMeta {
  fetchedAt: string;
  days: number;
  tournaments: number;
  decks: number;
  usage: Record<string, number>; // カードごとの採用率
  archetypes: AppArchetype[];
  // 一緒に使われる組: [a, b, 一緒に入っていたデッキ数, aのデッキのうちbも入っている割合, bのデッキのうちaも入っている割合]
  pairs: [string, string, number, number, number][];
}
/** トレーナーズが効く相手の条件（data/trainer-synergy.yaml） */
export interface HelpTarget {
  types?: EnergyType[];
  stages?: Stage[];
  groups?: CardGroup[];
  rules?: Rule[];
  notRules?: Rule[];
  retreatMin?: number;
  attacks?: string[]; // ワザの英語名
  cost?: { type: EnergyType; min: number };
  multiType?: boolean;
  tags?: string[];
  kinds?: CardKind[];
}
export interface AppHelp {
  card: string; // トレーナーズ
  to: HelpTarget;
  label: string;
  labelEn: string;
  weight: number;
}

/** 攻略記事で紹介されている組み合わせ */
export interface AppCombo {
  cards: string[];
  reason: string;
  reasonEn: string;
  deck: string;
  deckEn: string;
  source: string;
}

export interface AppData {
  builtAt: string;
  sets: AppSet[];
  cards: AppCard[];
  tags: AppTag[];
  lexicon: LexEntry[];
  meta?: AppMeta;
  combos?: AppCombo[];
  helps?: AppHelp[];
  lexiconEn?: LexEntry[]; // 英語の検索用の表現辞書（data/lexicon-en.yaml）
  // カードごとの、そのカードを使った大会のデッキ（おすすめ順の上位 n 件）でのほかのカードの採用率（多い順）。検索の「〇〇デッキ」に使う
  deckCore?: Record<string, { n: number; cards: [string, number][] }>;
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
  ultra_beast: "ウルトラビースト", ancient: "古代", future: "未来", team_rocket: "ロケット団", baby: "ベビー",
};
export const TYPE_EN: Record<EnergyType, string> = {
  grass: "Grass", fire: "Fire", water: "Water", lightning: "Lightning", psychic: "Psychic",
  fighting: "Fighting", darkness: "Darkness", metal: "Metal", dragon: "Dragon", colorless: "Colorless",
};
export const KIND_EN: Record<CardKind, string> = {
  pokemon: "Pokémon", item: "Item", supporter: "Supporter", tool: "Pokémon Tool", fossil: "Fossil", stadium: "Stadium",
};
export const STAGE_EN: Record<Stage, string> = { basic: "Basic", stage1: "Stage 1", stage2: "Stage 2" };
export const RULE_EN: Record<Rule, string> = { normal: "Regular", ex: "ex", mega_ex: "Mega Evolution ex" };
export const GROUP_EN: Record<CardGroup, string> = {
  ultra_beast: "Ultra Beast", ancient: "Ancient", future: "Future", team_rocket: "Team Rocket", baby: "Baby",
};
