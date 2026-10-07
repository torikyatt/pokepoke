// 口語検索エンジン（SPEC 4）。実行時にLLMは使わず、辞書マッチとスコアリングだけで完結する。
//   1. 数値パターン（コスト・HP・ダメージ・にげる）を正規表現で先に抜く
//   2. カード名 → 表現辞書の順に最長一致でタグ・タイプ・種別などに変換する
//   3. どこにも当たらなかった区間は全文検索語として残す
// タイプ・種別・数値は「ハード条件」（満たさないカードは除外）、タグは「ソフト条件」（一致の重みで並べる）。
import { normalize } from "./normalize.ts";
import { looseRomaji, romajiKey } from "./romaji.ts";
import { ACTIONS, buildSignatures, conceptsOf, GENERIC, KINDS, kindWordsOf, leftover, matchSignatures, SOURCES, subset, widen } from "./concepts.ts";
import type { AppCard, AppData, AppEffect, CardGroup, CardKind, EnergyType, LexEntry, LexTarget, Rule, Stage } from "../types.ts";
import { GROUP_EN, GROUP_JA, KIND_EN, KIND_JA, STAGE_EN, STAGE_JA, TYPE_EN, TYPE_JA } from "../types.ts";

type Op = "eq" | "ge" | "le";
// word: 表現辞書で当たった言葉（正規化済み）。その条件を満たさないカードでも、カードの文にこの言葉があれば当てる
// read: 読めた言葉から作った全文の条件（読めなかった言葉として記録しない）
export type Cond = { id: string; label: string; en: string; weight?: number; word?: string; read?: boolean } & (
  | { kind: "tag"; tag: string }
  | { kind: "type"; type: EnergyType }
  | { kind: "cardKind"; value: CardKind | "trainer" }
  | { kind: "stage"; value: Stage | "evolved" }
  | { kind: "rule"; value: Rule | "any_ex" | "not_ex" }
  | { kind: "group"; value: CardGroup }
  | { kind: "slot"; value: "attack" | "ability" }
  | { kind: "variable" }
  | { kind: "cost"; type: EnergyType; n: number }
  | { kind: "costTyped"; n: number }
  | { kind: "costHas"; type: EnergyType } // そのタイプのエネを使うワザ（「水技」）
  | { kind: "costTotal"; op: Op; n: number }
  | { kind: "damage"; op: Op; n: number }
  | { kind: "hp"; op: Op; n: number }
  | { kind: "retreat"; op: Op; n: number }
  | { kind: "weakness"; type: EnergyType }
  | { kind: "name"; name: string; ids?: string[]; pin?: boolean } // ids: ローマ字で探したときの、当たったカード。pin: タイプと一緒に出し、先頭に置く名前
  | { kind: "text"; term: string }
  | { kind: "deck"; archs: string[] } // 大会のデッキタイプに入っているカード
  | { kind: "partner"; cards: string[]; deck?: boolean } // そのカードと相性のいいカード。deck: 「〇〇デッキ」（そのカードと進化ラインを先頭に）
  | { kind: "meta" } // 大会でよく使われるカード
);

/** 並べる順の点数に効く条件（ないときは図鑑順で並べる） */
export const SCORED_KINDS: Cond["kind"][] = ["tag", "variable", "name", "text", "deck", "partner", "meta"];

export interface Hit {
  card: AppCard;
  score: number;
  loose?: boolean; // 条件にゆるく当たった（言葉が文にあるだけ・「グッズ」で探したどうぐ）。図鑑順でも後ろに並べる
  matched: string[]; // 一致した条件のID
  effects: string[]; // 一致したワザ・特性の名前
  effectsEn: string[];
  note?: string; // 大会データでの数字（「採用率 95%」など）
  noteEn?: string;
}

const OP_JA: Record<Op, string> = { eq: "", ge: "以上", le: "以下" };
const OP_EN: Record<Op, string> = { eq: "", ge: "+", le: " or less" };
const opOf = (s: string | undefined): Op => (!s ? "eq" : /以上|超/.test(s) ? "ge" : "le");
/** 英語の照合用: normalize（小文字・記号→空白）のうえで、アクセント記号・アポストロフィ・ハイフンを外す（Pokémon's → pokemons） */
export const enKey = (s: string) =>
  normalize(s.replace(/['’]/g, "").replace(/-/g, " "))
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .normalize("NFC");
// 英語の比較の言い方: 前（at least 100）・後ろ（100 or more）
const GE_EN = "at least|over|above|more than|greater than|min(?:imum)?";
const LE_EN = "at most|up to|under|below|less than|fewer than|max(?:imum)?";
const POST_GE_EN = "or more|or higher|or greater|and up|and above|plus";
const POST_LE_EN = "or less|or lower|or fewer|and below|and under";
const opEn = (pre?: string, post?: string, dflt: Op = "eq"): Op =>
  new RegExp(`^(?:${GE_EN}|${POST_GE_EN})$`).test(pre ?? post ?? "") ? "ge" : new RegExp(`^(?:${LE_EN}|${POST_LE_EN})$`).test(pre ?? post ?? "") ? "le" : dflt;
const PRE_EN = `(?:(${GE_EN}|${LE_EN})\\s+)?`;
const POST_EN = `(?:\\s+(${POST_GE_EN}|${POST_LE_EN}))?`;
const TYPE_WORD_EN: [string, EnergyType][] = [
  ["grass", "grass"], ["fire", "fire"], ["water", "water"], ["lightning", "lightning"], ["electric", "lightning"], ["psychic", "psychic"],
  ["fighting", "fighting"], ["darkness", "darkness"], ["dark", "darkness"], ["metal", "metal"], ["steel", "metal"], ["dragon", "dragon"], ["colorless", "colorless"],
];
const TYPE_RE_EN = TYPE_WORD_EN.map(([w]) => w).join("|");
// 1文字のタイプの略し方（英語版カードゲームの書き方: G草 R炎 W水 L雷 P超 F闘 D悪 M鋼 C無色）
const TYPE_ABBR_EN: Record<string, string> = { g: "grass", r: "fire", w: "water", l: "lightning", p: "psychic", f: "fighting", d: "darkness", m: "metal", c: "colorless" };
// タイプの言葉が、カードではなくタイプを指している言い方（「psychic energy」「2 psychic」「weak to psychic」）。
// サポート「サイキッカー」（Psychic）の名前と区別する
const TYPE_CTX_AFTER_EN = "\\s+(?:energy|energies|types?|attacks?|attackers?|pokemon|decks?|basics?|stage|ex)(?![a-z0-9])";
const TYPE_CTX_BEFORE_EN = "(?:\\d|weak(?:ness)?(?:\\s+(?:to|is|against))?)\\s*";
const typeOfEn = (w: string) => TYPE_WORD_EN.find(([x]) => x === w)![1];
const NUM_EN: Record<string, number> = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5 };
const numEn = (w: string) => NUM_EN[w] ?? +w;
// 英単語の語尾の変化（複数形・三単現・過去形・進行形）
const INFLECT = "(?:s|es|d|ed|ing)?";
const N_EN = "(\\d+|zero|one|two|three|four|five)";
// 英語の検索文から外す言葉
const STOP_EN = new Set(
  ("a an the with that which who whom for to of and or in on at by as from into my me i you we show find search look looking want need give list any some all every " +
    "card cards pokemon is are be been it its can could will would should has have having get gets got good great best better strong strongest powerful nice useful " +
    "work works working use uses used using this these those what how when where also only just more most very really please lot lots").split(" "),
);
const cmp = (v: number | undefined, op: Op, n: number) => v !== undefined && (op === "eq" ? v === n : op === "ge" ? v >= n : v <= n);

// 条件（日本語と英語の表示名つき）
const retreatCond = (op: Op, n: number): Cond => ({ id: `retreat:${op}${n}`, kind: "retreat", op, n, label: `にげる${n}${OP_JA[op]}`, en: `Retreat ${n}${OP_EN[op]}` });
const hpCond = (op: Op, n: number): Cond => ({ id: `hp:${op}${n}`, kind: "hp", op, n, label: `HP${n}${OP_JA[op]}`, en: `HP ${n}${OP_EN[op]}` });
const damageCond = (op: Op, n: number): Cond => ({ id: `damage:${op}${n}`, kind: "damage", op, n, label: `${n}ダメージ${OP_JA[op]}`, en: `${n}${OP_EN[op]} damage` });
const weakCond = (t: EnergyType): Cond => ({ id: `weakness:${t}`, kind: "weakness", type: t, label: `弱点${TYPE_JA[t]}`, en: `Weak to ${TYPE_EN[t]}` });
const costCond = (t: EnergyType, n: number): Cond => ({ id: `cost:${t}${n}`, kind: "cost", type: t, n, label: `${TYPE_JA[t]}エネ${n}`, en: `${n} ${TYPE_EN[t]} Energy` });
const costTotalCond = (op: Op, n: number): Cond => ({
  id: `costTotal:${op}${n}`, kind: "costTotal", op, n, label: `合計${n}エネ${OP_JA[op] || "以下"}`, en: `${n}${op === "ge" ? "+" : op === "eq" ? "" : " or fewer"} Energy total`,
});
const textCond = (term: string): Cond => ({ id: `text:${term}`, kind: "text", term, label: `「${term}」を含む`, en: `Contains "${term}"`, weight: 0.4 });
const META: Cond = { id: "meta", kind: "meta", label: "大会でよく使われる", en: "Popular in tournaments", weight: 1 };
const OHKO: Cond = { id: "damage:ge150", kind: "damage", op: "ge", n: 150, label: "150ダメージ以上（ワンパン級）", en: "150+ damage (one-hit KO)" };
const FAST: Cond = { id: "costTotal:le1", kind: "costTotal", op: "le", n: 1, label: "1エネ以下で使える（速攻）", en: "Usable with 1 Energy or less (fast)" };
const COLORLESS_ONLY: Cond = { id: "costTyped", kind: "costTyped", n: 0, label: "無色エネだけで使える", en: "Colorless Energy only" };
/** 「〇エネを含む技」: そのタイプのエネを1つ以上使うワザ（無色も） */
const costHasCond = (t: EnergyType): Cond => ({ id: `costHas:${t}`, kind: "costHas", type: t, label: `${TYPE_JA[t]}エネを使うワザ`, en: `Attack using ${TYPE_EN[t]} Energy` });
/** 「無色技」「水エネのワザ」: ワザに要るエネのタイプ（ポケモン自身のタイプとは別）。無色は無色エネだけで使えるワザ */
const attackTypeCond = (t: EnergyType): Cond => (t === "colorless" ? COLORLESS_ONLY : costHasCond(t));

// 数値パターンで使うタイプ名（正規化後）
const TYPE_WORD: [string, EnergyType][] = [
  ["無色", "colorless"], ["むしよく", "colorless"], ["草", "grass"], ["くさ", "grass"], ["炎", "fire"], ["ほのお", "fire"], ["火", "fire"],
  ["水", "water"], ["みず", "water"], ["雷", "lightning"], ["かみなり", "lightning"], ["でんき", "lightning"], ["電気", "lightning"],
  ["超", "psychic"], ["えすぱ", "psychic"], ["闘", "fighting"], ["格闘", "fighting"], ["かくとう", "fighting"],
  ["悪", "darkness"], ["あく", "darkness"], ["鋼", "metal"], ["はがね", "metal"], ["どらごん", "dragon"],
];
const TYPE_RE = TYPE_WORD.map(([w]) => w).sort((a, b) => b.length - a.length).join("|");
const typeOf = (w: string) => TYPE_WORD.find(([x]) => x === w)![1];
const CMP = "(以上|以下|まで|以内|未満|超え|超)?";

// 検索文から外す言葉（全文検索語に残しても意味がない）
const FILLER = /^(によつて|よつて|について|の|が|を|に|で|と|は|も|や|へ|な|だ|から|まで|して|する|できる|される|いる|ある|いい|よい|系|やつ|もの|こと|かんじ|感じ|よう|ような|ように|ようにする|ほしい|欲しい|さがして|探して|おしえて|教えて|ください|かど|ぽけもん|ひつよう|必要|えねが|えねは|でいい|強い|つよい|一覧|全部|使える|使う|つかえる|つかう|打てる|撃てる)+|(付与|ふよ|の|が|を|に|で|と|は|も|や|へ|な|だ|する|できる|いい|系|やつ|もの|かど|かんじ|よう|ような|ように|ようにする|でいい|使える|使う|つかえる|つかう|打てる|撃てる)+$/g;

// 助詞（と・で・に・だ…）と同じ字で始まる言葉。全文検索語にするとき、頭を助詞として削らない
const PROTECT = /^(とらつしゆ|とれなず|とくしゆ|どうぐ|でつき|にげる|だめじ|なかま|のこり|はんぶん|もどす|もどる|へんか)/;
const FILLER_LEAD_ONE = new RegExp(`^(?:${FILLER.source.slice(2, FILLER.source.indexOf(")+|"))})`);
const FILLER_TAIL = /(付与|ふよ|の|が|を|に|で|と|は|も|や|へ|な|だ|する|できる|いい|系|やつ|もの|かど|かんじ|よう|ような|ように|ようにする|でいい|使える|使う|つかえる|つかう|打てる|撃てる)+$/g;

export interface EngineOptions {
  /** 相性のいいカード（「〇〇と相性がいい」の検索に使う） */
  partners?: (c: AppCard, limit?: number) => { card: AppCard; score: number }[];
}

export function createEngine(data: AppData, opts: EngineOptions = {}) {
  const tagJa = new Map(data.tags.map((t) => [t.id, t.ja]));
  const tagEn = new Map(data.tags.map((t) => [t.id, t.en ?? t.ja]));
  // 表現辞書（正規化済み表現 → 項目）
  const lex = new Map<string, LexEntry[]>();
  let maxLen = 0;
  for (const e of data.lexicon) {
    const n = normalize(e.expr).replace(/ /g, "");
    if (!n) continue;
    (lex.get(n) ?? lex.set(n, []).get(n)!).push(e);
    maxLen = Math.max(maxLen, n.length);
  }
  // カード名（正規化）。3文字以上だけ（短い名前は他の言葉に紛れる）
  // 姿違い（「イエッサンex（メス）」）は、かっこを外した名前（「イエッサンex」）でも
  const names = [...new Set(data.cards.flatMap((c) => [c.nameJa, c.nameJa.replace(/（[^）]*）/g, "")].map((n) => normalize(n).replace(/ /g, ""))))].filter((n) => n.length >= 3).sort((a, b) => b.length - a.length);
  // 大会のデッキタイプ: 「メガルカリオex＆ルカリオ」のような名前全体と、デッキ名になっているカードの名前（ex を省いた形も）
  const archetypes = data.meta?.archetypes ?? [];
  const archById = new Map(archetypes.map((a) => [a.id, a]));
  const deckWords: { word: string; archs: string[]; label: string; labelEn: string }[] = [];
  const deckWordsEn: typeof deckWords = []; // 英語（「mega lucario ex deck」）。word は単語を空白で区切ったまま
  {
    const byWord = new Map<string, { archs: Set<string>; label: string; labelEn: string }>();
    const byWordEn = new Map<string, { archs: Set<string>; label: string; labelEn: string }>();
    const addWord = (m: typeof byWord, w: string, arch: string, label: string, labelEn: string) => {
      if (w.length < 2) return;
      const e = m.get(w) ?? m.set(w, { archs: new Set(), label, labelEn }).get(w)!;
      e.archs.add(arch);
    };
    const byIdAll = new Map(data.cards.map((c) => [c.id, c]));
    for (const a of archetypes) {
      addWord(byWord, normalize(a.nameJa).replace(/ /g, ""), a.id, a.nameJa, a.nameEn);
      addWord(byWordEn, enKey(a.nameEn), a.id, a.nameJa, a.nameEn);
      for (const k of a.keys) {
        const c = byIdAll.get(k);
        if (!c) continue;
        const w = normalize(c.nameJa).replace(/ /g, "");
        addWord(byWord, w, a.id, c.nameJa, c.nameEn);
        addWord(byWord, w.replace(/ex$/, ""), a.id, c.nameJa.replace(/ex$/, ""), c.nameEn.replace(/ ex$/, ""));
        const we = enKey(c.nameEn);
        addWord(byWordEn, we, a.id, c.nameJa, c.nameEn);
        addWord(byWordEn, we.replace(/ ex$/, ""), a.id, c.nameJa.replace(/ex$/, ""), c.nameEn.replace(/ ex$/, ""));
      }
    }
    for (const [word, v] of byWord) deckWords.push({ word, archs: [...v.archs], label: v.label, labelEn: v.labelEn });
    for (const [word, v] of byWordEn) if (word.length >= 3) deckWordsEn.push({ word, archs: [...v.archs], label: v.label, labelEn: v.labelEn });
    deckWords.sort((a, b) => b.word.length - a.word.length);
    deckWordsEn.sort((a, b) => b.word.length - a.word.length);
  }
  // 英語のカード名（3文字以上）→ カード
  const enNames = new Map<string, AppCard[]>();
  // 姿違いの名前は、姿の言葉を外した名前でも引ける（「ogerpon ex」→ Teal Mask Ogerpon ex、「castform」→ 3つの姿）
  const EN_FORM = /\b(?:(?:teal|hearthflame|wellspring|cornerstone)\s*mask\s*|(?:rainy|snowy|sunny)\s+form\b|(?:dawn\s+wings|dusk\s+mane)\s+)/gi;
  for (const c of data.cards) {
    for (const n of new Set([enKey(c.nameEn), enKey(c.nameEn.replace(EN_FORM, " "))])) {
      if (n.length < 3) continue;
      const cs = enNames.get(n) ?? enNames.set(n, []).get(n)!;
      if (!cs.includes(c)) cs.push(c);
    }
  }
  const enNameList = [...enNames.keys()].sort((a, b) => b.length - a.length);
  // 英語の表現辞書（長いものから当てる）
  const lexEn = new Map<string, LexEntry[]>();
  for (const e of data.lexiconEn ?? []) {
    const k = enKey(e.expr);
    if (k) (lexEn.get(k) ?? lexEn.set(k, []).get(k)!).push(e);
  }
  const lexEnList = [...lexEn.keys()].sort((a, b) => b.length - a.length);
  // ローマ字（hakase・dakurai・monomane）: カード名と表現辞書を、ゆるいローマ字にしたもの。漢字はよみを使う
  const kanji = /[一-龯々〆]/;
  const romajiNames = new Map<string, AppCard[]>();
  for (const c of data.cards) {
    const src = c.nameKana ?? c.nameJa;
    if (kanji.test(src)) continue;
    const k = romajiKey(src);
    if (k.length >= 3) (romajiNames.get(k) ?? romajiNames.set(k, []).get(k)!).push(c);
  }
  const romajiLex = new Map<string, LexEntry[]>();
  for (const e of data.lexicon) {
    const src = e.kana ?? e.expr;
    if (kanji.test(src)) continue;
    const k = romajiKey(src);
    if (k.length >= 3) (romajiLex.get(k) ?? romajiLex.set(k, []).get(k)!).push(e);
  }
  // 「〇〇と相性がいい」の〇〇に使うカード名（2文字以上）。
  // 姿違いの名前は、かっこを外した名前でも引ける（「イエッサンex」→ イエッサンex（メス）、「オドリドリ」→ 4つの姿すべて）
  const cardsByName = new Map<string, AppCard[]>();
  const addName = (n: string, c: AppCard) => {
    const cs = cardsByName.get(n) ?? cardsByName.set(n, []).get(n)!;
    if (!cs.includes(c)) cs.push(c);
  };
  for (const c of data.cards) {
    addName(normalize(c.nameJa).replace(/ /g, ""), c);
    if (/（/.test(c.nameJa)) addName(normalize(c.nameJa.replace(/（[^）]*）/g, "")).replace(/ /g, ""), c);
  }
  // 「サーナイトex」のように、メガシンカexの「メガ」を省いた名前でも（その名前のカードが別に無いときだけ）
  for (const c of data.cards) {
    const m = /^めが(.+ex)$/.exec(normalize(c.nameJa).replace(/ /g, ""));
    if (m && (!cardsByName.has(m[1]) || cardsByName.get(m[1])!.every((x) => x.rule === "mega_ex"))) addName(m[1], c);
  }
  const partnerNames = [...cardsByName.keys()].filter((n) => n.length >= 2).sort((a, b) => b.length - a.length);
  const cardNameKeys = [...cardsByName.keys()];
  /** 表示名: 姿が違うカードをまとめて指すときは、かっこ・姿の言葉を外した名前 */
  //   違うカードをいくつか指すときは「カイリュー＆タケルライコ」
  const nameJaOf = (cs: AppCard[]) =>
    new Set(cs.map((c) => c.nameJa)).size === 1 ? cs[0].nameJa : [...new Set(cs.map((c) => c.nameJa.replace(/（[^）]*）/g, "")))].join("＆");
  const nameEnOf = (cs: AppCard[]) =>
    new Set(cs.map((c) => c.nameEn)).size === 1 ? cs[0].nameEn : [...new Set(cs.map((c) => c.nameEn.replace(EN_FORM, " ").replace(/\s+/g, " ").trim()))].join(" & ");
  const cardById = new Map(data.cards.map((c) => [c.id, c]));
  /** 進化ライン（進化前を上へ、進化後を下へたどる。きょうだいの進化先は入れない） */
  const lineOf = (c: AppCard): AppCard[] => {
    const out = new Map<string, AppCard>([[c.id, c]]);
    const walk = (x: AppCard, key: "evolvesFrom" | "evolvesTo") => {
      for (const id of x[key]) {
        const y = cardById.get(id);
        if (!y || out.has(y.id)) continue;
        out.set(y.id, y);
        walk(y, key);
      }
    };
    walk(c, "evolvesFrom");
    walk(c, "evolvesTo");
    return [...out.values()];
  };
  // 大会で一緒に使われた割合（[カードA, カードB, デッキ数, AのデッキでBを使う割合, BのデッキでAを使う割合]）
  const coUse = new Map<string, Map<string, number>>();
  for (const [a, b, , ab, ba] of data.meta?.pairs ?? []) {
    (coUse.get(a) ?? coUse.set(a, new Map()).get(a)!).set(b, ab);
    (coUse.get(b) ?? coUse.set(b, new Map()).get(b)!).set(a, ba);
  }
  const partnerCache = new Map<string, Map<string, number>>();
  /** そのカードを使った大会のデッキ（おすすめ順の上位）が3件以上あるカード */
  const coreOf = (ids: string[]) => ids.map((id) => data.deckCore?.[id]).filter((x) => x && x.n >= 3) as NonNullable<AppData["deckCore"]>[string][];
  /** 「〇〇デッキ」で、大会のおすすめ上位のデッキでの採用率（カード → 0〜1）。大会のデータが無ければ undefined */
  const coreRates = (ids: string[]) => {
    const cores = coreOf(ids);
    if (!cores.length) return undefined;
    const m = new Map<string, number>();
    for (const core of cores) for (const [o, r] of core.cards) m.set(o, Math.max(m.get(o) ?? 0, r));
    return m;
  };
  /**
   * 相性のいいカード → 点（4まで）。deck のときは、並べる順の点そのもの:
   *   大会のおすすめ上位のデッキがあれば、そのカード 12・ほかは採用率×10（大会で一緒に使われている順）
   *   無ければ、そのカード 11・進化ライン 10・相性のいいカード（4まで）
   */
  const partnerScores = (ids: string[], deck = false) => {
    const key = `${deck ? "d" : "p"}:${ids.join(",")}`;
    let m = partnerCache.get(key);
    if (!m && deck) {
      const rates = coreRates(ids);
      if (rates) {
        m = new Map([...rates].map(([o, r]) => [o, 10 * r]));
        for (const id of ids) m.set(id, 12);
        partnerCache.set(key, m);
        return m;
      }
    }
    if (!m) {
      m = new Map();
      for (const id of ids) {
        const c = cardById.get(id);
        if (!c || !opts.partners) continue;
        for (const p of opts.partners(c, 80)) m.set(p.card.id, Math.max(m.get(p.card.id) ?? 0, p.score));
      }
      // 効果で結べない定番のトレーナーズ（博士の研究など）は、大会で一緒に使われた割合で
      if (!m.size) for (const id of ids) for (const [o, r] of coUse.get(id) ?? []) if (r >= 0.3) m.set(o, Math.max(m.get(o) ?? 0, 4 * r));
      // どのデッキにも入るカード（博士の研究は 99%）は、組む相手を選ばないので、大会でよく使われるカードを並べる
      if (!m.size)
        for (const [o, u] of Object.entries(usage).sort((a, b) => b[1] - a[1]).slice(0, 41))
          if (!ids.includes(o) && cardById.has(o)) m.set(o, 4 * u);
      if (deck) {
        for (const [o, s] of m) m.set(o, Math.min(4, s));
        for (const id of ids) for (const c of lineOf(cardById.get(id)!)) m.set(c.id, ids.includes(c.id) ? 11 : 10);
      }
      partnerCache.set(key, m);
    }
    return m;
  };
  const usage = data.meta?.usage ?? {};
  /** 大会のデッキタイプに無いカードの「〇〇デッキ」。大会のおすすめ上位のデッキがあればそれで、無ければ進化ラインと相性のいいカードで */
  const deckOfCond = (cs: AppCard[]): Cond => {
    const ids = cs.map((c) => c.id);
    const core = coreOf(ids);
    const n = Math.max(0, ...core.map((x) => x.n));
    return core.length
      ? { id: `partner-deck:${nameEnOf(cs)}`, kind: "partner", deck: true, cards: ids, label: `「${nameJaOf(cs)}」のデッキ（大会のおすすめ上位${n}件から）`, en: `${nameEnOf(cs)} deck (top ${n} tournament lists)`, weight: 2 }
      : { id: `partner-deck:${nameEnOf(cs)}`, kind: "partner", deck: true, cards: ids, label: `「${nameJaOf(cs)}」のデッキ（進化ラインと相性のいいカード）`, en: `${nameEnOf(cs)} deck (evolution line & partners)`, weight: 2 };
  };

  // 全文検索用の文（カードごと）
  const haystack = new Map<string, { ja: string; en: string; name: string; nameEn: string }>();
  for (const c of data.cards) {
    const effs = effectsOf(c);
    haystack.set(c.id, {
      ja: normalize([c.nameJa, ...effs.flatMap((e) => [e.nameJa ?? "", e.textJa ?? ""])].join(" ")).replace(/ /g, ""),
      en: enKey([c.nameEn, ...effs.flatMap((e) => [e.nameEn ?? "", e.textEn ?? ""])].join(" ")),
      name: normalize(c.nameJa).replace(/ /g, ""),
      nameEn: enKey(c.nameEn),
    });
  }

  // 効果文で名指ししているカードの名前（タケシ「イワーク」「ゴローニャ」・シロナ「ガブリアス」）。
  // カード名で探したとき、そのカードを持ち上げるトレーナーズなども、持っているカードの後ろに出す
  const quoted = new Map<string, { ja: string[]; en: string[] }>();
  {
    const byNameJa = new Map<string, AppCard>();
    for (const c of data.cards) if (!byNameJa.has(c.nameJa)) byNameJa.set(c.nameJa, c);
    for (const c of data.cards) {
      const texts = effectsOf(c).map((e) => e.textJa ?? "").join(" ");
      const ts = [...new Set([...texts.matchAll(/「([^」]+)」/g)].map((m) => byNameJa.get(m[1])).filter((t): t is AppCard => !!t && t.nameJa !== c.nameJa))];
      if (ts.length) quoted.set(c.id, { ja: ts.map((t) => normalize(t.nameJa).replace(/ /g, "")), en: ts.map((t) => enKey(t.nameEn)) });
    }
  }

  // カード名・ワザ名・特性名など（正規化）。読めなかった言葉がこれとぴったり同じなら、名前で探しただけなので記録しない
  const exactNames = new Set<string>();
  for (const c of data.cards) {
    for (const n of [c.nameJa, ...effectsOf(c).map((e) => e.nameJa ?? "")]) if (n) exactNames.add(normalize(n).replace(/ /g, ""));
    for (const n of [c.nameEn, ...effectsOf(c).map((e) => e.nameEn ?? "")]) if (n) exactNames.add(enKey(n));
  }
  // ワザ名・特性名（正規化）→ そのワザ・特性を持つカード。検索の言葉（空白で区切った1つ）がぴったり同じなら、それで探す
  // （「つるのムチ」「ハイドロポンプ」が「つる」「どろ」のような辞書の言葉に分けられないように）
  const effectNames = new Map<string, { ja: string; en: string; ids: string[] }>();
  const effectNamesEn = new Map<string, { ja: string; en: string; ids: string[] }>();
  for (const c of data.cards) {
    for (const e of [...(c.ability ? [c.ability] : []), ...c.attacks]) {
      const ja = e.nameJa ?? e.nameEn ?? "", en = e.nameEn ?? e.nameJa ?? "";
      for (const [m, k] of [[effectNames, ja ? normalize(ja).replace(/ /g, "") : ""], [effectNamesEn, en ? enKey(en) : ""]] as const) {
        if (k.length < 2) continue;
        const v = m.get(k) ?? m.set(k, { ja, en, ids: [] }).get(k)!;
        if (!v.ids.includes(c.id)) v.ids.push(c.id);
      }
    }
  }
  // ワザ・特性の名前を効果文で名指ししているカード（シャガ「りゅうせいぐん」・サイキッカー「サイコキネシス」）も、その名前で当てる。
  // 持っているカードの後ろに足す（並びは図鑑順なので、トレーナーズは後ろになる）
  for (const c of data.cards) {
    const texts = [c.text, c.ability, ...c.attacks].map((e) => e?.textJa ?? "").join(" ");
    for (const m of texts.matchAll(/「([^」]+)」/g)) {
      const v = effectNames.get(normalize(m[1]).replace(/ /g, ""));
      if (!v || v.ids.includes(c.id)) continue;
      v.ids.push(c.id);
      const en = effectNamesEn.get(enKey(v.en));
      if (en && !en.ids.includes(c.id)) en.ids.push(c.id);
    }
  }
  const effectCond = (k: string, v: { ja: string; en: string; ids: string[] }): Cond => ({
    id: `effect:${k}`, kind: "name", name: k, ids: v.ids, weight: 3, label: `ワザ・特性「${v.ja}」`, en: `Attack/Ability "${v.en}"`,
  });
  const dfCache = new Map<string, number>(); // 全文検索語ごとの、その言葉を含むカードの数
  const signatures = buildSignatures(data.lexicon); // タグの言い回しを概念の組にしたもの（ゆるい読み取り用）

  function condOf(t: LexTarget, weight: number, span: string): Cond {
    if ("tag" in t) return { id: `tag:${t.tag}`, kind: "tag", tag: t.tag, label: tagJa.get(t.tag) ?? t.tag, en: tagEn.get(t.tag) ?? t.tag, weight };
    if ("type" in t) return { id: `type:${t.type}`, kind: "type", type: t.type, label: `${TYPE_JA[t.type]}タイプ`, en: `${TYPE_EN[t.type]} type` };
    if ("kind" in t)
      return { id: `kind:${t.kind}`, kind: "cardKind", value: t.kind, label: t.kind === "trainer" ? "トレーナーズ" : KIND_JA[t.kind], en: t.kind === "trainer" ? "Trainer" : KIND_EN[t.kind] };
    if ("stage" in t)
      return { id: `stage:${t.stage}`, kind: "stage", value: t.stage, label: t.stage === "evolved" ? "進化ポケモン" : STAGE_JA[t.stage], en: t.stage === "evolved" ? "Evolved Pokémon" : STAGE_EN[t.stage] };
    if ("rule" in t) {
      const label = { any_ex: "ex", mega_ex: "メガシンカex", not_ex: "ex以外", ex: "ex", normal: "ex以外" }[t.rule];
      const en = { any_ex: "ex", mega_ex: "Mega Evolution ex", not_ex: "Non-ex", ex: "ex", normal: "Non-ex" }[t.rule];
      return { id: `rule:${t.rule}`, kind: "rule", value: t.rule, label, en };
    }
    if ("group" in t) return { id: `group:${t.group}`, kind: "group", value: t.group, label: GROUP_JA[t.group], en: GROUP_EN[t.group] };
    if ("slot" in t) return { id: `slot:${t.slot}`, kind: "slot", value: t.slot, label: t.slot === "attack" ? "ワザ" : "特性", en: t.slot === "attack" ? "Attack" : "Ability" };
    return { id: "variable", kind: "variable", label: `火力が変わる（${span}）`, en: `Variable damage (${span})`, weight };
  }

  /** 検索文を条件に分解する */
  function parse(query: string): Cond[] {
    return explain(query).conds;
  }

  /**
   * 検索文を条件に分解し、読めなかった言葉も返す。
   *   unread: 辞書・タグで読めず、全文検索のまま残った言葉と、意味が分からず捨てた短い言葉（「コインでエネ付与」の「えね付与」）。
   *           ほかの言葉で当たって件数が出ていても、辞書に足すべき言い回しを見つけるために記録する。
   *           カード名・ワザ名・特性名とぴったり同じ言葉は、名前で探しただけなので入れない
   */
  function explain(query: string): { conds: Cond[]; unread: string[] } {
    const dropped: string[] = [];
    const conds: Cond[] = [];
    const add = (c: Cond) => {
      const same = conds.find((x) => x.id === c.id);
      if (!same) conds.push(c);
      else if ((c.weight ?? 0) > (same.weight ?? 0)) same.weight = c.weight;
    };
    let q = enKey(query.replace(/(\d+)\s*\+/g, "$1 or more "));

    const take = (re: RegExp, f: (m: RegExpExecArray) => void) => {
      q = q.replace(re, (...args) => {
        f(args.slice(0, -2) as unknown as RegExpExecArray);
        return " ";
      });
    };
    const esc = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    function parseEn() {
      // 単語の切れ目で当てる（「heal」が「wheel」の中で当たらないように）。複数語は空白の数を問わない
      const W = (w: string) => `(?<![a-z0-9])${esc(w).replace(/ /g, "\\s+")}`;
      const END = "(?![a-z0-9])";
      // 日本語の名前をそのまま英語にした呼び方（「monster ball」→ Poké Ball）
      q = q.replace(/(?<![a-z])monster\s*balls?(?![a-z])/g, "poke ball");
      // 打ちかけの名前（「professor」→ Professor's Research ほか）: 文まるごとが、カード名の単語の頭と同じなら、その名前で探す
      {
        const w = q.trim();
        if (w.length >= 4 && /^[a-z ]+$/.test(w) && !lexEn.has(w) && !enNames.has(w)) {
          const hit = enNameList.filter((n) => new RegExp(`(?<![a-z])${esc(w)}`).test(n));
          if (hit.length && hit.length <= 12) {
            add({ id: `name:${w}`, kind: "name", name: w, label: `名前に「${w}」`, en: `Name contains "${w}"`, weight: 3 });
            q = "";
          }
        }
      }
      // 「mega lucario ex deck」→ 大会のデッキタイプ。大会のデッキタイプに無いカード（「pikachu ex deck」）は、そのカードと進化ライン＋相性のいいカード。
      // 長い名前から当てる（「hisuian zoroark ex deck」を「zoroark ex」のデッキにしない）。同じ名前なら大会のデッキタイプを先に
      const deckEntries = [
        ...deckWordsEn.map((d) => ({ w: d.word, arch: d })),
        ...(opts.partners ? enNameList.map((n) => ({ w: n, arch: undefined })) : []),
      ].sort((x, y) => y.w.length - x.w.length || Number(!!y.arch) - Number(!!x.arch));
      for (const { w, arch } of deckEntries) {
        if (!q.includes(w)) continue;
        take(new RegExp(`${W(w)}\\s+(?:decks?|lists?|builds?|archetypes?)${END}`, "g"), () => {
          if (arch) {
            const one = arch.archs.length === 1 ? archById.get(arch.archs[0])! : undefined;
            add({ id: `deck:${arch.archs.join(",")}`, kind: "deck", archs: arch.archs, label: one ? `「${one.nameJa}」デッキ` : `「${arch.label}」のデッキ`, en: one ? `"${one.nameEn}" deck` : `${arch.labelEn} decks`, weight: 2 });
          } else {
            const cs = enNames.get(w)!;
            add(deckOfCond(cs));
          }
        });
      }
      // 「pairs with mewtwo ex」「synergy with ...」「pikachu ex partners」→ 相性のいいカード
      if (opts.partners) {
        for (const n of enNameList) {
          if (!q.includes(n)) continue;
          const re = new RegExp(
            `(?:(?<![a-z])(?:pairs?|paired|partners?|goes|go|works?|synergy|synergizes?|synergies|combos?|good|fits?|best|cards?|teams?)\\s+(?:well\\s+|nicely\\s+)?(?:with|for)\\s+${W(n)}|${W(n)}\\s+(?:partners?|synergy|synergies|combos?|support|teammates?))${END}`,
            "g",
          );
          take(re, () => {
            const cs = enNames.get(n)!;
            add({ id: `partner:${nameEnOf(cs)}`, kind: "partner", cards: cs.map((c) => c.id), label: `「${nameJaOf(cs)}」と相性がいい`, en: `Pairs with ${nameEnOf(cs)}`, weight: 2 });
          });
        }
      }
      if (data.meta) take(new RegExp(`(?<![a-z])(?:meta|popular|tournaments?|competitive|top\\s+decks?|most\\s+used|commonly\\s+used|staples?)${END}`, "g"), () => add(META));
      // カード名
      for (const n of enNameList) {
        if (!q.includes(n)) continue;
        // タイプと同じ名前（Psychic）は、タイプを指す言い方のときは名前にしない
        const typeWord = TYPE_WORD_EN.some(([w]) => w === n);
        const re = typeWord ? `(?<!${TYPE_CTX_BEFORE_EN})${W(n)}(?!${TYPE_CTX_AFTER_EN})${END}` : `${W(n)}${END}`;
        take(new RegExp(re, "g"), () => add({ id: `name:${n}`, kind: "name", name: n, label: `名前「${nameJaOf(enNames.get(n)!)}」`, en: `Name "${nameEnOf(enNames.get(n)!)}"`, weight: 3 }));
      }
      // 「p energy」「2p」「weak to p」の1文字の p → psychic（超）。ほかの言葉と一緒に書いたときだけ。
      // カード名を読んだ後で広げるので、広げた psychic がサポート「サイキッカー」（Psychic）になることはない。
      // 「p」だけのときは、名前を打っている途中かもしれないのでそのまま
      q = q.replace(/(\d)([grwlpfdmc])(?![a-z0-9])/g, "$1 $2");
      if (/\S\s+\S/.test(q.trim())) q = q.replace(/(?<![a-z0-9])([grwlpfdmc])(?![a-z0-9])/g, (_, l: string) => TYPE_ABBR_EN[l]);
      // 数値
      // 「high hp」「low hp」→ HP130以上・HP60以下
      take(new RegExp(`(?<![a-z])(?:high|big|large|bulky|tanky)\\s*hp${END}|(?<![a-z])hp\\s+(?:is\\s+)?high${END}|(?<![a-z])(?:bulky|tanky)${END}`, "g"), () => add(hpCond("ge", 130)));
      take(new RegExp(`(?<![a-z])(?:low|small)\\s*hp${END}|(?<![a-z])hp\\s+(?:is\\s+)?low${END}`, "g"), () => add(hpCond("le", 60)));
      // 「non-ex」「not ex」→ ex以外（「ex pokemon」の辞書より先に）
      take(new RegExp(`(?<![a-z])(?:non|not|no)\\s*ex${END}`, "g"), () => add(condOf({ rule: "not_ex" }, 1, "non ex")));
      take(new RegExp(`(?<![a-z])hp\\s*(?:of\\s+)?${PRE_EN}(\\d+)${POST_EN}|(\\d+)\\s*hp${POST_EN}`, "g"), (m) => add(hpCond(opEn(m[1], m[3] ?? m[5]), +(m[2] ?? m[4]))));
      take(new RegExp(`(?:free|no|zero)\\s+retreat(?:\\s+cost)?${END}`, "g"), () => add(retreatCond("eq", 0)));
      take(new RegExp(`(?<![a-z])retreat(?:\\s+cost)?\\s+(?:of\\s+)?${PRE_EN}${N_EN}${POST_EN}|${N_EN}\\s+retreat(?:\\s+cost)?${POST_EN}`, "g"), (m) =>
        add(retreatCond(opEn(m[1], m[3] ?? m[5]), numEn(m[2] ?? m[4]))),
      );
      take(new RegExp(`${PRE_EN}(\\d+)\\s*(?:damage|dmg)${POST_EN}|(?<![a-z])(?:damage|dmg|deals?|does)\\s+(?:of\\s+)?${PRE_EN}(\\d+)${POST_EN}`, "g"), (m) =>
        add(damageCond(opEn(m[1] ?? m[4], m[3] ?? m[6], "ge"), +(m[2] ?? m[5]))),
      );
      take(new RegExp(`(?<![a-z])weak(?:ness)?\\s+(?:to\\s+|is\\s+|against\\s+)?(${TYPE_RE_EN})${END}`, "g"), (m) => add(weakCond(typeOfEn(m[1]))));
      take(new RegExp(`(?<![a-z])(?:ohko|one\\s+hit\\s+(?:ko|knock\\s*out)|one\\s+shot|one\\s+hit)${END}`, "g"), () => add(OHKO));
      take(new RegExp(`(?:(?<![a-z])(?:any|colorless)\\s+energy\\s+only|(?<![a-z])only\\s+colorless(?:\\s+energy)?|(?<![a-z])any\\s+(?:type\\s+of\\s+)?energy)${END}`, "g"), () => add(COLORLESS_ONLY));
      // 「2 psychic attack」は数を先に読む（psychic 2つのワザ）
      take(new RegExp(`${N_EN}\\s+(${TYPE_RE_EN})(?:\\s+energy|\\s+energies)?${END}|(?<![a-z])(${TYPE_RE_EN})\\s+energy\\s*x?\\s*${N_EN}${END}`, "g"), (m) =>
        add(costCond(typeOfEn(m[2] ?? m[3]), numEn(m[1] ?? m[4]))),
      );
      take(new RegExp(`(?<![a-z])(${TYPE_RE_EN})(?:\\s+energy)?\\s+attacks?${END}|(?<![a-z])attacks?\\s+(?:using|with|costing|that\\s+costs?|that\\s+uses?)\\s+(?:only\\s+)?(${TYPE_RE_EN})(?:\\s+energy)?${END}`, "g"), (m) =>
        add(attackTypeCond(typeOfEn(m[1] ?? m[2]))),
      );
      take(new RegExp(`${PRE_EN}${N_EN}\\s+(?:energy|energies|cost)${POST_EN}${END}|(?<![a-z])costs?\\s+${PRE_EN}${N_EN}${POST_EN}${END}`, "g"), (m) =>
        add(costTotalCond(opEn(m[1] ?? m[4], m[3] ?? m[6], "le"), numEn(m[2] ?? m[5]))),
      );
      take(new RegExp(`(?<![a-z])(?:fast|quick|speedy|cheap)(?:\\s+(?:attackers?|attacks?|starts?|starters?))?${END}`, "g"), () => add(FAST));
      // 表現辞書。語尾の変化（searches・healing・shrinks）も許す
      for (const k of lexEnList) {
        if (!q.includes(k.split(" ")[0])) continue;
        take(new RegExp(`(?<![a-z0-9])${k.split(" ").map((w) => esc(w) + INFLECT).join("\\s+")}${END}`, "g"), () => {
          for (const e of lexEn.get(k)!) add(condOf(e.target, e.weight, k));
        });
      }
      // ローマ字の日本語（hakase → 博士の研究、dakurai → ダークライ、monomane musume → モノマネむすめ）。
      // 続けて書いた単語もつなげて試す。表現辞書にぴったり当たればそれ、なければカード名の一部として探す
      {
        const words = [...q.matchAll(/(?<![a-z0-9])[a-z]+(?![a-z0-9])/g)].map((m) => m[0]);
        for (let i = 0; i < words.length; ) {
          let used = 0;
          for (let n = Math.min(3, words.length - i); n >= 1 && !used; n--) {
            const ws = words.slice(i, i + n);
            if (n === 1 && (ws[0].length < 3 || STOP_EN.has(ws[0]))) continue;
            const key = looseRomaji(ws.join(""));
            if (key.length < 3) continue;
            const lex = romajiLex.get(key);
            if (lex) {
              for (const e of lex) add(condOf(e.target, e.weight, ws.join(" ")));
              used = n;
            }
            // 表現辞書に当たっても、長めの言葉ならカード名も探す（monomane → 「コピー」の効果とモノマネむすめ）
            if (!lex || key.length >= 6) {
              const cards = [...romajiNames]
                .filter(([k]) => k.includes(key))
                .flatMap(([, cs]) => cs)
                .sort((x, y) => (usage[y.id] ?? 0) - (usage[x.id] ?? 0));
              if (cards.length && (!lex || cards.length <= 6)) {
                const ja = [...new Set(cards.map((c) => c.nameJa))];
                const en = [...new Set(cards.map((c) => c.nameEn))];
                const typed = ws.join(" ");
                add({
                  id: `name:romaji:${key}`, kind: "name", name: key, ids: cards.map((c) => c.id), weight: 3,
                  label: `「${typed}」→ ${ja.slice(0, 2).join("・")}${ja.length > 2 ? " など" : ""}`,
                  en: `"${typed}" → ${en.slice(0, 2).join(", ")}${en.length > 2 ? " …" : ""}`,
                });
                used = n;
              }
            }
            if (used) take(new RegExp(`(?<![a-z0-9])${ws.join("\\s+")}(?![a-z0-9])`), () => {});
          }
          i += used || 1;
        }
      }
      // 残りの英単語は全文検索語に
      take(/(?<![a-z0-9])[a-z][a-z0-9]*(?![a-z0-9])/g, (m) => {
        if (m[0].length >= 3 && !STOP_EN.has(m[0])) add(textCond(m[0]));
      });
    }

    // 英語のワザ名・特性名だけの検索（「vine whip」）
    if (effectNamesEn.has(q.trim()) && !lexEn.has(q.trim()) && !enNames.has(q.trim())) {
      add(effectCond(q.trim(), effectNamesEn.get(q.trim())!));
      q = "";
    }
    // 0. 実際の使われ方（英語より先に読む。「メガリザードンYex」「イエッサンex（メス）」の英字を英語として読まないように）
    // 名前は、空白（「カプ・テテフ」「オドリドリ（めらめら）」の記号は空白になる）があってもなくても当てる
    const flat = q.replace(/ /g, "");
    const spaced = (w: string) => [...w.replace(/ /g, "")].map(esc).join("\\s*");
    //   「メガルカリオexデッキ」「ルカリオのデッキ」 → 大会のデッキタイプに入っているカード。
    //   大会のデッキタイプに無いカード（「ピカチュウexデッキ」「ナッシーのデッキ」）は、そのカードと進化ライン＋相性のいいカード。
    //   長い名前から当てる（「ヒスイゾロアークexデッキ」を「ゾロアークex」のデッキにしない）。同じ名前なら大会のデッキタイプを先に
    const deckEntries = [
      ...deckWords.map((d) => ({ w: d.word, arch: d })),
      ...(opts.partners ? partnerNames.map((n) => ({ w: n, arch: undefined })) : []),
    ].sort((x, y) => y.w.length - x.w.length || Number(!!y.arch) - Number(!!x.arch));
    for (const { w, arch } of deckEntries) {
      if (!flat.includes(w)) continue;
      take(new RegExp(`${spaced(w)}\\s*(?:の)?(?:でつき|型|がた)`, "g"), () => {
        if (arch) {
          const one = arch.archs.length === 1 ? archById.get(arch.archs[0])! : undefined;
          const label = one ? `「${one.nameJa}」デッキ` : `「${arch.label}」のデッキ`;
          const en = one ? `"${one.nameEn}" deck` : `${arch.labelEn} decks`;
          add({ id: `deck:${arch.archs.join(",")}`, kind: "deck", archs: arch.archs, label, en, weight: 2 });
        } else {
          const cs = cardsByName.get(w)!;
          add(deckOfCond(cs));
        }
      });
    }
    //   「ミライドンexと相性がいい」「レアコイルと組める」「ピカチュウexと組みたい」 → 相性のいいカード
    if (opts.partners) {
      for (const n of partnerNames) {
        if (!flat.includes(n)) continue;
        take(new RegExp(`${spaced(n)}\\s*(?:(?:と|との|に)(?:の)?\\s*(?:相性|あいしよう|しなじ|一緒|いつしよ|組み合わせ|くみあわせ|組(?:め|む|みたい)|く(?:め|む|みたい)|合う|あう|合わせ|あわせ)|(?:の)?(?:相性|あいしよう|しなじ|相方|あいかた|ぱとな|相棒|あいぼう))(?:が|の)?(?:いい|良い|よい|ある|抜群|ばつぐん)?`, "g"), () => {
          const cs = cardsByName.get(n)!;
          add({ id: `partner:${nameEnOf(cs)}`, kind: "partner", cards: cs.map((c) => c.id), label: `「${nameJaOf(cs)}」と相性がいい`, en: `Pairs with ${nameEnOf(cs)}`, weight: 2 });
        });
      }
    }
    //   「大会でよく使われる」「環境で人気」「採用率が高い」 → 大会での採用率
    if (data.meta) {
      take(/(?:大会|環境|めたげむ)(?:で|に|の)?(?:よく)?(?:使われ(?:る|て(?:いる|る)?)|つかわれ(?:る|て(?:いる|る)?)|採用され(?:る|て(?:いる|る)?)|入(?:る|つて(?:いる|る)?)|はい(?:る|つて(?:いる|る)?)|人気|にんき|流行|はやり|定番|ていばん)?|(?:採用率|使用率)(?:が|の)?(?:高い|たかい)?/g, () => {
        add(META);
      });
    }

    // 英語の検索文（アルファベットが3文字以上続くときだけ）
    if (/[a-z]{3,}/.test(q) || /(?<![a-z0-9])\d+\s*[grwlpfdmc](?![a-z0-9])/.test(q)) parseEn(); // 「2p」（超2つ）も英語として読む

    // 「回復しながら攻撃」の「しながら」は、ただのつなぎ
    take(/しながら/g, () => {});
    // 「毎ターン使える特性」→ 自分の番に1回使える特性（常時はたらく特性ではなく、使うもの）
    take(/(?:毎たん|まいたん|毎番|毎回|毎ターン)(?:に)?(?:使える|つかえる|使う|つかう|発動できる)?/g, () =>
      add({ id: "text:番に1回", kind: "text", term: normalize("番に1回").replace(/ /g, ""), label: "毎ターン使える（番に1回）", en: "Usable every turn", weight: 0.6, read: true }),
    );
    // 「HPが高い」「HPが低い」→ HP130以上・HP60以下
    take(/(?:hp|体力)(?:が|の)?(?:高い|たかい|多い|おおい|高め|たかめ)/g, () => add(hpCond("ge", 130)));
    take(/(?:hp|体力)(?:が|の)?(?:低い|ひくい|少ない|すくない|低め|ひくめ)/g, () => add(hpCond("le", 60)));

    // 1. 数値パターン
    take(new RegExp(`(?:にげる|逃げる|にげ|逃げ)(?:ための)?(?:えね|こすと|えねるぎ)?(?:が|は)?(\\d+)(?:個|こ|つ)?${CMP}`, "g"), (m) => {
      const op = opOf(m[2]);
      add(retreatCond(op, +m[1]));
    });
    take(new RegExp(`(?:hp|体力)(?:が|は)?(\\d+)${CMP}|(\\d+)hp${CMP}`, "g"), (m) => {
      const n = +(m[1] ?? m[3]);
      const op = opOf(m[2] ?? m[4]);
      add(hpCond(op, n));
    });
    take(new RegExp(`(\\d+)(?:だめじ|だめ|点)${CMP}|(?:火力|打点|だめじ)(?:が|は)?(\\d+)${CMP}`, "g"), (m) => {
      const n = +(m[1] ?? m[3]);
      const op = opOf(m[2] ?? m[4]) === "eq" ? "ge" : opOf(m[2] ?? m[4]);
      add(damageCond(op, n));
    });
    take(new RegExp(`弱点(?:が|は)?(${TYPE_RE})`, "g"), (m) => {
      const t = typeOf(m[1]);
      add(weakCond(t));
    });
    // 攻略記事でよく使われる言い方: 「ワンパン」は大ダメージ、「速攻」は軽いワザ
    take(/(?:わんぱん|わんぱんち)(?:できる|で(?:きる)?|する|級)?/g, () => {
      add(OHKO);
    });
    // 「アグロ」: 序盤から少ないエネで大きく殴るデッキ（攻略記事の呼び方）→ 2エネ以下で70ダメージ以上のワザを持つ、たね・1進化の ex
    take(/あぐろ(?:でつき|型|系|向き|むき)?/g, () => {
      add(costTotalCond("le", 2));
      add(damageCond("ge", 70));
      add({ id: "rule:any_ex", kind: "rule", value: "any_ex", label: "ex", en: "ex" });
      add({ id: "stage:basic", kind: "stage", value: "basic", label: STAGE_JA.basic, en: STAGE_EN.basic });
      add({ id: "stage:stage1", kind: "stage", value: "stage1", label: STAGE_JA.stage1, en: STAGE_EN.stage1 });
    });
    take(/速攻(?:で(?:きる)?|する|型)?/g, () => {
      add(FAST);
    });
    let typedSum = 0;
    let typedSeen = false;
    take(new RegExp(`(${TYPE_RE})(?:えね)?(?:が|を)?(\\d+)(?:個|こ|つ|枚)?`, "g"), (m) => {
      const t = typeOf(m[1]);
      if (t !== "colorless") {
        typedSum += +m[2];
        typedSeen = true;
      }
      add(costCond(t, +m[2]));
    });
    // 「残りは無色」「あとは無色エネのワザ」（後ろの「エネ」「わざ」まで含めて読む。「無色わざ」より先に）
    take(/(?:あとは|あと|残りは|残り|のこりは|ほかは|他は)無色(?:えね)?(?:の)?(?:わざ|技)?/g, () => {
      add({ id: "costTyped", kind: "costTyped", n: typedSum, label: typedSeen ? "残りは無色" : "無色だけ", en: typedSeen ? "Rest Colorless" : "Colorless only" });
    });
    // 「無色エネを含む技」「水エネを使う技」（空白をはさんでも）→ そのタイプのエネを1つ以上使うワザ（無色も「無色だけ」ではなく、含むもの）
    take(new RegExp(`(${TYPE_RE})(?:えね)?(?:を|が)?\\s*(?:含む|ふくむ|含んだ|ふくんだ|使う|つかう|入った|はいつた|入る|はいる)(?:の)?\\s*(?:わざ|技)`, "g"), (m) => {
      add(costHasCond(typeOf(m[1])));
    });
    // 「無色技」「水エネのワザ」「無色エネで使えるワザ」→ ワザに要るエネのタイプ。
    // ポケモン自身のタイプ（「水ポケモン」）とは別の条件にするので、一緒に書けば両方で絞り込める
    take(new RegExp(`(${TYPE_RE})(?:えね)?(?:の|で(?:使える|つかえる|打てる|撃てる)(?:の)?)?(?:わざ|技)`, "g"), (m) => {
      add(attackTypeCond(typeOf(m[1])));
    });
    take(/(?:どのえねでも|どんなえねでも|なんのえねでも|無色だけ|無色のみ|無色えねだけ)/g, () => {
      add(COLORLESS_ONLY);
    });
    // 「超エネ」だけ（後ろに何も続かない）→ そのタイプ。「エネ」を読めなかった言葉に残さない
    take(new RegExp(`(${TYPE_RE})えね(?=\\s|$)`, "g"), (m) => add(condOf({ type: typeOf(m[1]) }, 1, m[0])));
    take(new RegExp(`(?:えね|こすと)(\\d+)(?:個|こ|つ)?${CMP}|(\\d+)(?:個|こ|つ)?(?:の)?えね(?:で|が)?${CMP}`, "g"), (m) => {
      const n = +(m[1] ?? m[3]);
      const raw = m[2] ?? m[4];
      const op: Op = !raw ? "le" : opOf(raw);
      add(costTotalCond(op, n));
    });

    // 「ノーダメージ」は正規化すると「のだめじ」になり「〜のダメージ」と区別できないので、言葉の頭にあるときだけ読み替える
    q = q.replace(/(^|\s)のだめじ/g, "$1だめじを受けない");

    // 1.5 「トラッシュから ポケモン」「山札の グッズ」「サポート トラッシュから」のように、どこから・何を が
    //     空白で分かれていても、つなげて1つの言葉として辞書に当てる（「トラッシュからポケモン」→ トラッシュからポケモンを回収）
    {
      const SRC = "(とらつしゆ|ぼち|墓地|捨て札|すてふだ|山札|やまふだ|でつき)";
      const WHAT = "(たねぽけもん|ぽけもんのどうぐ|ぽけもん|たね|ぐつず|あいてむ|さぽと|どうぐ|すたじあむ|とれなず|えね)";
      q = q.replace(new RegExp(`${SRC}(?:から|の)?\\s+${WHAT}`, "g"), (_, src: string, what: string) => `${src}から${what}`);
      q = q.replace(new RegExp(`${WHAT}(?:を)?\\s+${SRC}(?:から|の)?`, "g"), (_, what: string, src: string) => `${src}から${what}`);
    }

    // 2. カード名 → 表現辞書（最長一致）
    const qAll = q.replace(/ /g, ""); // 4. のゆるい読み取りに使う（空白は関係なく、文全体で見る）
    const segments = q.split(" ").filter(Boolean);
    const rest: string[] = [];
    for (let seg of segments) {
      // ワザ名・特性名とぴったり同じ言葉（カード名と同じもの・辞書の言葉「ほのお」「かみなり」は、これまでどおり読む）
      const eff = effectNames.get(seg);
      if (eff && !cardsByName.has(seg) && !lex.has(seg)) {
        add(effectCond(seg, eff));
        continue;
      }
      for (const n of names) {
        if (seg.includes(n)) {
          add({ id: `name:${n}`, kind: "name", name: n, label: `名前「${n}」`, en: `Name "${n}"`, weight: 3 });
          seg = seg.split(n).join(" ");
        }
      }
      for (const part of seg.split(" ").filter(Boolean)) {
        let i = 0;
        let buf = "";
        while (i < part.length) {
          let hit: string | undefined;
          for (let len = Math.min(maxLen, part.length - i); len >= 1; len--) {
            const sub = part.slice(i, i + len);
            if (lex.has(sub)) {
              hit = sub;
              break;
            }
          }
          if (!hit) {
            buf += part[i++];
            continue;
          }
          if (buf) rest.push(buf);
          buf = "";
          for (const e of lex.get(hit)!) add({ ...condOf(e.target, e.weight, hit), ...(hit.length >= 2 ? { word: hit } : {}) });
          i += hit.length;
        }
        if (buf) rest.push(buf);
      }
    }

    // 3. 残りは全文検索語に。ただし「相手」「使える」「から」のように多くのカード（15%超）に出てくる言葉は、
    //    ほかに条件があるなら使わない（それだけで数百枚に広がったり、関係ない絞り込みになったりする）
    const common = (term: string) => {
      let n = dfCache.get(term);
      if (n === undefined) {
        n = 0;
        for (const h of haystack.values()) if (h.ja.includes(term)) n++;
        dfCache.set(term, n);
      }
      return n > data.cards.length * 0.15;
    };
    const hasOther = conds.length > 0 || rest.length > 1;
    for (const r of rest) {
      // 「とらっしゅ」「でっき」「にげる」のように、助詞と同じ字で始まる言葉は、頭を削らない
      let term = r;
      for (let m: RegExpMatchArray | null; !PROTECT.test(term) && (m = term.match(FILLER_LEAD_ONE)); ) term = term.slice(m[0].length);
      term = term.replace(FILLER_TAIL, "");
      if (term.length >= 2 && !(hasOther && common(term))) add(textCond(term));
    }

    // 4. ゆるい読み取り: 検索文と辞書の言い回しを概念の組にして比べ、語順・助詞・活用・挟まった言葉が違っても当てる
    //    （「グッズをトラッシュから拾ってくる」→ トラッシュからグッズを回収）。取りすぎないよう、次のどれかのときだけ足す:
    //      ・辞書で当たったタグの言い回しを全部ふくむ、もっと大きな言い回し（そのタグは置きかえる。
    //        「逃げるためのエネを減らす」→「逃げる」「エネを減らす」より「にげるエネが減る」）
    //      ・辞書で当たらず全文検索語が残った ・タグが1つも当たらなかった
    //      ・種類の言葉（グッズ・サポート…）が「何を」として使われている（「どこから」か「何をする」が一緒にある）
    {
      const tagConds = () => conds.filter((c): c is Extract<Cond, { kind: "tag" }> => c.kind === "tag");
      const hadText = conds.some((c) => c.kind === "text");
      // 種類の言葉が「何を」として使われているか（「サポートを〜」「トラッシュからサポート」「トラッシュのサポート」）。
      // 「〜を回収するサポート」のように最後に付いているのは、種類の絞り込み
      const asObj = (concept: string) =>
        kindWordsOf(concept).some((w) => qAll.includes(`${w}を`) || qAll.includes(`から${w}`) || qAll.includes(`の${w}`) || qAll.includes(`${w}が`));
      const added: Set<string>[] = [];
      // 言い回しを詳しくする概念か: 添え物（相手・手札…）は数えない。種類の言葉は「何を」として使われているときだけ
      const adds = (x: string) => (KINDS.has(x) ? asObj(x) : !GENERIC.has(x));
      for (const sig of matchSignatures(signatures, conceptsOf(qAll))) {
        const have = tagConds();
        if (have.some((t) => t.tag === sig.tag || t.tag.startsWith(`${sig.tag}.`))) continue; // 同じか、もっと詳しいタグがもう当たっている
        // この言い回しに入りきらない（残る）タグの言葉でもう使われた概念。同じ言葉を2つの読み取りに使い回さない
        const remaining = have.filter((t) => !(t.word && subset(conceptsOf(t.word), sig.concepts)));
        const usedElsewhere = new Set(remaining.flatMap((t) => (t.word ? [...conceptsOf(t.word)] : [])));
        // 辞書で当たったタグのうち、この言い回しの一部でしかないもの（言葉の概念がこの組より小さく、すっぽり入る）
        const subsumed = have.filter((t) => {
          const cs = t.word ? conceptsOf(t.word) : new Set<string>();
          // 増えた概念が「相手」「手札」のような添え物だけなら、詳しくなったとは言えない
          return cs.size > 0 && subset(cs, sig.concepts) && [...sig.concepts].some((x) => !cs.has(x) && !usedElsewhere.has(x) && adds(x));
        });
        const doing = [...sig.concepts].some((x) => ACTIONS.has(x) || SOURCES.has(x));
        const kindConcepts = new Set(conds.flatMap((c) => (c.kind === "cardKind" && c.word ? [...conceptsOf(c.word)] : [])));
        const asObject = doing && [...sig.concepts].some((x) => KINDS.has(x) && kindConcepts.has(x) && asObj(x));
        // 同じ系統（energy.accel など）のタグが辞書でもう当たっているなら、言い回しをはっきり広げるときだけ
        // すでに当たった親タグを、検索文にある別の言葉（「グッズ」など）で詳しくできるなら、親を子に置きかえる
        const parent = have.find((t) => sig.tag.startsWith(`${t.tag}.`));
        if (parent && !subsumed.includes(parent)) {
          const ps = parent.word ? conceptsOf(parent.word) : new Set<string>();
          if ([...sig.concepts].some((x) => !ps.has(x) && !usedElsewhere.has(x) && adds(x))) subsumed.push(parent);
        }
        const family = sig.tag.split(".").slice(0, 2).join(".");
        const sibling = have.some((t) => !subsumed.includes(t) && t.tag.split(".").slice(0, 2).join(".") === family);
        if (!subsumed.length && (sibling || (!asObject && !hadText && have.length))) continue;
        for (const t of subsumed) conds.splice(conds.indexOf(t), 1);
        add({ id: `tag:${sig.tag}`, kind: "tag", tag: sig.tag, label: tagJa.get(sig.tag) ?? sig.tag, en: tagEn.get(sig.tag) ?? sig.tag, weight: sig.weight * 0.9 });
        added.push(sig.concepts);
      }
      // 辞書で当たったタグどうしでも、ほかのタグの言葉にすっぽり入る小さい言葉のタグは外す
      // （「相手のバトルポケモンを入れ替えさせる」→「入れ替え」（自分の入れ替え）は「相手を入れ替えさせる」の一部）
      for (const t of tagConds()) {
        const cs = t.word ? conceptsOf(t.word) : new Set<string>();
        if (!cs.size) continue;
        const bigger = tagConds().some((o) => {
          if (o === t || !o.word || o.word === t.word) return false;
          const os = conceptsOf(o.word);
          return subset(cs, os) && [...os].some((x) => !cs.has(x) && adds(x));
        });
        if (bigger) conds.splice(conds.indexOf(t), 1);
      }
      // タグが当たったら、それで説明がつく全文検索語・「何を」として使われた種類の言葉・意味のない言葉（したい・くれる）は外す
      const tags = tagConds();
      if (tags.length) {
        const used = widen([...added.flatMap((cs) => [...cs]), ...tags.flatMap((t) => (t.word ? [...conceptsOf(t.word)] : []))]);
        for (let i = conds.length - 1; i >= 0; i--) {
          const c = conds[i];
          if (c.kind === "text" && !c.read) {
            const cs = conceptsOf(c.term);
            if (cs.size ? [...cs].every((x) => used.has(x) || GENERIC.has(x)) : c.term.length <= 4) {
              conds.splice(i, 1);
              // 意味の分からない短い言葉や、読めた言葉の残り（「相手をねむらせて」→「ねむらせ」）は、読めなかった言葉として残す
              dropped.push(...leftover(c.term));
            }
          } else if (c.kind === "cardKind" && c.word) {
            // 「ポケモンを入れ替える」「グッズを拾う」: 種類の言葉が「何を」として使われているなら、種類の絞り込みではない
            if ([...conceptsOf(c.word)].some((x) => KINDS.has(x) && asObj(x))) conds.splice(i, 1);
          }
        }
      }
    }

    // 「トラッシュの枚数で変わる」→「トラッシュの枚数」と「（条件で）変わる」のように、別々の言葉から親子のタグが出たら、
    // 広い親のタグ（多くのカードに付いている）は外す。子のタグだけで十分に絞れる。
    // 1つの言葉が親子の両方に当たるとき（「手札を減らす」→ 手札干渉・手札を山札にもどさせる）は、わざとなので残す
    const tags = conds.filter((c): c is Extract<Cond, { kind: "tag" }> => c.kind === "tag");
    const out = conds.filter((c) => c.kind !== "tag" || !tags.some((d) => d.tag.startsWith(`${c.tag}.`) && d.word !== c.word));
    // 「psychic」だけ: サポート「サイキッカー」（Psychic）を先頭に、続けて超タイプのカードを出す
    for (const c of out) {
      if (c.kind !== "name" || c.ids) continue;
      const t = TYPE_WORD_EN.find(([w]) => w === c.name)?.[1];
      if (!t || out.some((d) => d.kind === "type")) continue;
      c.pin = true;
      out.push(condOf({ type: t }, 1, c.name));
      break;
    }
    // 打ちかけ・省いた名前（「げっこう」「タケル」「ボール」「博士」「りゅうせい」）: 読めずに残った言葉が、
    // 空白で区切った言葉まるごとで、カード名やワザ・特性の名前の一部なら、その名前で探す
    for (const c of [...out]) {
      if (c.kind !== "text" || c.read || c.term.length < 2 || /^[a-z0-9]+$/.test(c.term)) continue;
      // 助詞として削られた頭・お尻（「にじいろ」の「に」）も戻して、空白で区切った言葉まるごとで見る
      const t = segments.find((sg) => sg.includes(c.term) && sg.length <= c.term.length + 2);
      if (!t) continue;
      if (cardNameKeys.some((n) => n.includes(t))) {
        out.splice(out.indexOf(c), 1, { id: `name:${t}`, kind: "name", name: t, label: `名前に「${t}」`, en: `Name contains "${t}"`, weight: 3 });
        continue;
      }
      const effKeys = [...effectNames.keys()].filter((k) => k.includes(t));
      if (effKeys.length && effKeys.length <= 8) {
        const ids = [...new Set(effKeys.flatMap((k) => effectNames.get(k)!.ids))];
        out.splice(out.indexOf(c), 1, { id: `effect:${t}`, kind: "name", name: t, ids, weight: 3, label: `ワザ・特性の名前に「${t}」`, en: `Attack/Ability name contains "${t}"` });
      }
    }
    // 「カイリュー タケルライコ デッキ」: デッキの言葉の前に並んだほかのカード名も、そのデッキのカードとしてまとめる
    {
      const di = out.findIndex((c) => c.kind === "partner" && c.deck);
      const named = out.filter((c): c is Extract<Cond, { kind: "name" }> => c.kind === "name" && !c.ids);
      if (di >= 0 && named.length) {
        const deckC = out[di] as Extract<Cond, { kind: "partner" }>;
        const extra = named.flatMap((n) => cardsByName.get(n.name) ?? data.cards.filter((c) => haystack.get(c.id)!.name.includes(n.name)));
        if (extra.length) {
          const cs = [...new Set([...extra, ...deckC.cards.map((id) => cardById.get(id)!)])];
          out.splice(di, 1, deckOfCond(cs));
          for (const n of named) out.splice(out.indexOf(n), 1);
        }
      }
      // 大会のデッキタイプ（「メガルカリオexデッキ」）と、そのデッキに入っているカードの名前は、名前で絞らない
      const arch = out.find((c): c is Extract<Cond, { kind: "deck" }> => c.kind === "deck");
      if (arch)
        for (const n of out.filter((c): c is Extract<Cond, { kind: "name" }> => c.kind === "name" && !c.ids))
          if (arch.archs.some((a) => archById.get(a)?.cards.some((x) => haystack.get(x.id)?.name.includes(n.name)))) out.splice(out.indexOf(n), 1);
    }
    const unread = [...new Set([...out.flatMap((c) => (c.kind === "text" && !c.read ? [c.term] : [])), ...dropped])].filter((w) => !exactNames.has(w));
    return { conds: out, unread };
  }

  /** 条件でカードを絞り込み、並べる */
  function run(conds: Cond[], limit = 50): Hit[] {
    const of = <K extends Cond["kind"]>(k: K) => conds.filter((c): c is Extract<Cond, { kind: K }> => c.kind === k);
    const types = of("type"), kinds = of("cardKind"), stages = of("stage"), rules = of("rule"), groups = of("group");
    const slot = of("slot")[0]?.value;
    const atk = { cost: of("cost"), costTyped: of("costTyped"), costHas: of("costHas"), costTotal: of("costTotal"), damage: of("damage") };
    const atkConds = [...atk.cost, ...atk.costTyped, ...atk.costHas, ...atk.costTotal, ...atk.damage];
    const nums = [...of("hp"), ...of("retreat")];
    const weak = of("weakness");
    const soft = conds.filter((c) => c.kind === "tag" || c.kind === "variable");
    const texts = of("text"), nameConds = of("name");
    // タイプと一緒に出す名前（pin）は、当たらなくても除外しない。タイプの条件を外したときは、ふつうの名前と同じ
    const needNames = nameConds.filter((n) => !n.pin || !types.length);
    const nameHit = (card: AppCard, h: { name: string; nameEn: string }, n: Extract<Cond, { kind: "name" }>) =>
      n.ids ? n.ids.includes(card.id) : h.name.includes(n.name) || h.nameEn.includes(n.name);
    const decks = of("deck"), partnerConds = of("partner"), metaCond = of("meta")[0];
    // デッキタイプ: カードごとの、そのデッキへの採用率（いちばん高いもの）
    const deckRate = new Map<string, number>();
    for (const d of decks) for (const id of d.archs) for (const c of archById.get(id)?.cards ?? []) if (c.rate >= 0.15) deckRate.set(c.id, Math.max(deckRate.get(c.id) ?? 0, c.rate));
    const partnerMaps = partnerConds.map((p) => ({ cond: p, map: partnerScores(p.cards, p.deck) }));
    const coreDeck = (() => {
      const p = partnerConds.find((x) => x.deck && coreOf(x.cards).length);
      return p && { cards: p.cards, rates: coreRates(p.cards)! };
    })();

    const hits: Hit[] = [];
    for (const card of data.cards) {
      const h = haystack.get(card.id)!;
      // 検索の言葉がタイプ・進化・ex・グループやタグになったとき、それに当てはまらなくても、
      // カードの文にその言葉があれば当てる（「2進化 サポート」→ 2進化ポケモンについて書いてあるサポート）。少し下に並べる
      // 進化の段階は、言葉の後ろの「の」「ポケモン」を外して探す（「2進化のサポート」→ 文に「2進化」とあるサポート）
      const inText = (c: Cond) => !!c.word && h.ja.includes(c.kind === "stage" ? c.word.replace(/(?:ぽけもん)?の$/, "") : c.word);
      let byText = 0;
      const hard = <C extends Cond>(cs: C[], ok: (c: C) => boolean) => {
        if (!cs.length || cs.some(ok)) return true;
        if (!cs.some(inText)) return false;
        byText++;
        return true;
      };
      // ハード条件（同じ種類の条件どうしは OR）
      const pinned = nameConds.some((n) => n.pin && nameHit(card, h, n));
      if (!pinned && !hard(types, (t) => card.type === t.type || card.typeRefs.includes(t.type))) continue;
      // カードの種類（サポート・グッズ…）は、ほかのカードの文にもよく出てくるので、文では当てない
      // 「グッズ」で探したときは、ポケモンのどうぐ（グッズとは別の種類）も、グッズの後ろに並べて出す（探しているものに近いので）
      const toolAsItem = card.kind === "tool" && kinds.some((k) => k.value === "item") && !kinds.some((k) => k.value === "tool");
      if (kinds.length && !toolAsItem && !kinds.some((k) => (k.value === "trainer" ? card.kind !== "pokemon" : card.kind === k.value))) continue;
      if (!hard(stages, (s) => (s.value === "evolved" ? card.stage === "stage1" || card.stage === "stage2" : card.stage === s.value))) continue;
      if (!hard(rules, (r) => ruleOk(card, r.value))) continue;
      if (!hard(groups, (g) => card.groups.includes(g.value))) continue;
      if (weak.length && !weak.some((w) => card.weakness === w.type)) continue;
      if (!nums.every((c) => cmp(c.kind === "hp" ? card.hp : card.retreat, c.op, c.n))) continue;
      if (slot === "ability" && !card.ability) continue;
      // 「ワザ」はポケモンのワザ。ただし「〜どうぐ」「〜グッズ」のようにトレーナーズを指定したときは、その効果を見る
      const trainerAsked = kinds.length > 0 && kinds.every((k) => k.value !== "pokemon");
      if (slot === "attack" && !card.attacks.length && !trainerAsked) continue;
      const okAttacks = atkConds.length ? card.attacks.filter((a) => atkConds.every((c) => attackOk(a, c))) : card.attacks;
      if (atkConds.length && !okAttacks.length) continue;
      // 実際の使われ方（デッキタイプ・相性・採用率）もハード条件。満たしたら点を足す
      if (decks.length && !deckRate.has(card.id)) continue;
      if (partnerMaps.some((p) => !p.map.has(card.id))) continue;
      if (metaCond && (usage[card.id] ?? 0) < 0.01) continue;
      let useScore = 0;
      if (decks.length) useScore += 4 * deckRate.get(card.id)!;
      for (const p of partnerMaps) useScore += p.cond.deck ? p.map.get(card.id)! : Math.min(4, p.map.get(card.id)!); // 「〇〇デッキ」は、その並び（主役が先頭）
      if (metaCond) useScore += Math.min(4, 8 * (usage[card.id] ?? 0));

      // ソフト条件: ワザ・特性ごとに数え、同じワザ内でそろうと加点
      const effects = effectsOf(card).filter((e) => !slot || e.slot === slot || (e.slot === "text" && slot === "attack" && card.kind !== "pokemon"));
      const matched = new Set<string>();
      const effectNames = new Map<string, string>(); // 日本語名 → 英語名
      let score = useScore - 0.5 * byText - (toolAsItem ? 0.5 : 0);
      const best = new Map<string, number>();
      for (const e of effects) {
        let local = 0;
        let count = 0;
        for (const c of soft) {
          const w = softScore(e, c);
          if (!w) continue;
          local += w;
          count++;
          best.set(c.id, Math.max(best.get(c.id) ?? 0, w));
        }
        if (count && atkConds.length && e.slot === "attack" && okAttacks.includes(e as never)) count++;
        if (count >= 2) score += 0.5 * (count - 1);
        if (count) effectNames.set(e.nameJa ?? e.nameEn ?? "効果", e.nameEn ?? e.nameJa ?? "Effect");
        void local;
      }
      for (const [id, w] of best) {
        score += w;
        matched.add(id);
      }
      // タグが付いていなくても、カードの文にその言葉があれば当てる（全文検索と同じ重さ）
      // ワザ・特性を指定したときは、その文だけを見る
      let slotText: string | undefined;
      const inEffects = (c: Cond) =>
        !slot ? inText(c) : !!c.word && (slotText ??= normalize(effects.map((e) => `${e.nameJa ?? ""} ${e.textJa ?? ""}`).join(" ")).replace(/ /g, "")).includes(c.word);
      for (const c of soft) {
        if (best.has(c.id) || !inEffects(c)) continue;
        score += 0.4;
        matched.add(c.id);
      }
      // 効果で探したとき、同じくらい当てはまるなら大会でよく使われている（採用率1%以上の）カードを少し上に
      if (best.size && (usage[card.id] ?? 0) >= 0.01) score += Math.min(0.1, usage[card.id]);
      if (soft.length && !matched.size && !needNames.length && !texts.length) continue;

      for (const n of nameConds) {
        if (nameHit(card, h, n)) {
          // 名前で探したときも、大会でよく使われているものを少し上に（hakase → 博士の研究が先）
          score += (n.weight ?? 3) + Math.min(0.1, usage[card.id] ?? 0);
          matched.add(n.id);
          // ワザ名・特性名で探したときは、そのワザ・特性の名前を結果に出す
          if (n.id.startsWith("effect:"))
            for (const e of effectsOf(card)) if (e.nameJa && normalize(e.nameJa).replace(/ /g, "") === n.name || (e.nameEn && enKey(e.nameEn) === n.name)) effectNames.set(e.nameJa ?? e.nameEn ?? "", e.nameEn ?? e.nameJa ?? "");
        }
        // 効果文でそのカードを名指ししている（タケシ「イワーク」）。持っているカードより下に
        else if (!n.ids && quoted.get(card.id)?.[/^[a-z0-9 ]+$/.test(n.name) ? "en" : "ja"].some((x) => x.includes(n.name))) {
          score += 1.5;
          matched.add(n.id);
        }
      }
      for (const t of texts) {
        if (h.ja.includes(t.term)) score += 0.4;
        else if (h.en.includes(t.term)) score += 0.2;
        else continue;
        matched.add(t.id);
      }
      // ソフト条件・名前・全文のどれかを指定したのに、何も当たらなければ除外
      if ((soft.length || needNames.length || texts.length) && !matched.size) continue;
      for (const c of conds) if (!["tag", "variable", "name", "text"].includes(c.kind)) matched.add(c.id);
      if (atkConds.length) for (const a of okAttacks) effectNames.set(a.nameJa ?? a.nameEn ?? "", a.nameEn ?? a.nameJa ?? "");
      // 「〇〇デッキ」（大会のおすすめ上位から）: そのデッキたちでの採用率
      const coreRate = coreDeck && !coreDeck.cards.includes(card.id) ? coreDeck.rates.get(card.id) : undefined;
      const note = decks.length ? `採用率 ${Math.round(deckRate.get(card.id)! * 100)}%` : coreRate !== undefined ? `採用率 ${Math.round(coreRate * 100)}%` : metaCond ? `大会で ${((usage[card.id] ?? 0) * 100).toFixed(1)}%` : undefined;
      const noteEn = decks.length ? `In ${Math.round(deckRate.get(card.id)! * 100)}% of lists` : coreRate !== undefined ? `In ${Math.round(coreRate * 100)}% of lists` : metaCond ? `${((usage[card.id] ?? 0) * 100).toFixed(1)}% in tournaments` : undefined;
      hits.push({ card, score, ...(byText || toolAsItem ? { loose: true } : {}), matched: [...matched], effects: [...effectNames.keys()].filter(Boolean), effectsEn: [...effectNames.values()].filter(Boolean), ...(note ? { note, noteEn } : {}) });
    }
    hits.sort((a, b) => b.score - a.score || order(a.card) - order(b.card));
    return hits.slice(0, limit);
  }

  /** タグの表示名（言語に合わせて） */
  const tagLabel = (id: string, lang: "ja" | "en") => (lang === "en" ? tagEn : tagJa).get(id) ?? id;
  return { parse, explain, run, search: (q: string, limit?: number) => run(parse(q), limit), tagJa, tagLabel };
}

export type Engine = ReturnType<typeof createEngine>;

export function effectsOf(c: AppCard): AppEffect[] {
  return [...(c.ability ? [c.ability] : []), ...c.attacks, ...(c.text ? [c.text] : [])];
}

function ruleOk(card: AppCard, r: Rule | "any_ex" | "not_ex") {
  if (r === "any_ex") return card.rule !== "normal";
  if (r === "not_ex") return card.kind === "pokemon" && card.rule === "normal";
  return card.rule === r;
}

function attackOk(a: AppCard["attacks"][number], c: Cond): boolean {
  switch (c.kind) {
    case "cost": return (a.cost[c.type] ?? 0) === c.n;
    case "costTyped": return a.costTyped === c.n;
    case "costHas": return (a.cost[c.type] ?? 0) > 0;
    case "costTotal": return cmp(a.costTotal, c.op, c.n);
    case "damage": return cmp(a.damage, c.op, c.n);
    default: return true;
  }
}

// タグは親タグ指定で子タグも一致（ただし重みを下げる）
function softScore(e: AppEffect, c: Cond): number {
  const w = c.weight ?? 1;
  if (c.kind === "variable") return "damageVariable" in e && (e as { damageVariable: boolean }).damageVariable ? w : 0;
  if (c.kind !== "tag") return 0;
  if (e.tags.includes(c.tag)) return w;
  if (e.tags.some((t) => t.startsWith(c.tag + "."))) return w * 0.7;
  return 0;
}

// 同点のときの並び: ポケモン → トレーナーズ、収録順
const KIND_ORDER: Record<CardKind, number> = { pokemon: 0, supporter: 1, item: 2, tool: 3, stadium: 4, fossil: 5 };
const order = (c: AppCard) => KIND_ORDER[c.kind] * 1e5 + (c.prints.length ? 0 : 0);
