// 言い回しのゆるい読み取り。検索文と表現辞書の言い回しを、それぞれ「概念」の集まりにしてから比べる。
//   「グッズをトラッシュから拾ってくる」→ {トラッシュから, グッズ, 回収}
//   辞書の「トラッシュからグッズ」     → {トラッシュから, グッズ}  ⊆ なので「トラッシュからグッズを回収」に当たる
// 語順・助詞・活用・間に挟まる言葉が違っても当たる。向き（「トラッシュから」と「トラッシュ」）は別の概念として区別する
import { normalize } from "./normalize.ts";

// 概念 → 言い方（正規化前）。長い言い方から先に当てる
const VOCAB: Record<string, string[]> = {
  trash_from: ["トラッシュから", "トラッシュの", "墓地から", "墓地の", "捨て札から", "ぼちから"],
  deck_from: ["山札から", "山札の", "デッキから", "デッキの", "やまふだから"],
  trash: ["トラッシュ", "墓地", "捨て札"],
  deck: ["山札", "デッキ", "やまふだ"],
  hand: ["手札", "てふだ"],
  bench: ["ベンチ", "控え", "後ろ"],
  active: ["バトル場", "バトルポケモン", "バトル"],
  opp: ["相手", "敵"],
  item: ["グッズ", "アイテム"],
  supporter: ["サポート"],
  tool: ["どうぐ", "道具"],
  stadium: ["スタジアム"],
  trainer: ["トレーナーズ"],
  energy: ["エネルギー", "エネ"],
  pokemon: ["ポケモン"],
  basic: ["たね"],
  evolve: ["進化", "しんか"],
  recover: ["回収", "拾", "ひろ", "戻", "もど", "再利用", "サルベージ", "使い回", "リサイクル"],
  fetch: ["持ってく", "持って来", "持ってき", "持ってこ", "もってく", "もってき", "もってこ", "探", "サーチ", "呼"],
  draw: ["引", "ひく", "ひいて", "ドロー"],
  discard: ["捨て", "すて", "割", "破壊", "はが", "剥が", "削"],
  attach: ["つけ", "付け", "貼", "はる"],
  move: ["移", "付け替え", "乗り換え"],
  accel: ["加速"],
  switch: ["入れ替え", "いれかえ", "交代", "スイッチ"],
  retreat: ["にげ", "逃げ"],
  heal: ["回復", "治"],
  damage: ["ダメージ", "火力", "打点"],
  up: ["上げ", "上が", "アップ", "増", "ふや"],
  down: ["減", "へら", "下げ", "軽"],
  prevent: ["受けない", "受けな", "うけな", "防", "無効", "守"],
  lock: ["封じ", "封印", "妨害", "邪魔", "じゃま", "妨げ", "使えな", "使わせな", "ロック", "止め", "できなく", "できな", "られな", "させな"],
  coin: ["コイン"],
  status: ["状態異常", "特殊状態"],
  poison: ["どく", "毒"],
  burn: ["やけど", "火傷"],
  paralysis: ["まひ", "マヒ", "麻痺"],
  sleep: ["ねむり", "眠"],
  confusion: ["こんらん", "混乱"],
  ability: ["特性"],
  attack: ["ワザ", "技", "攻撃"],
  weakness: ["弱点"],
  ignore: ["無視"],
  hp: ["HP", "体力"],
  ko: ["気絶", "きぜつ", "倒", "たお", "やられ"],
  point: ["ポイント", "サイド"],
  first: ["最初", "1ターン目", "初手", "先攻", "後攻"],
  random: ["ランダム"],
  copy: ["コピー", "まね", "マネ"],
  count: ["枚数", "の数"],
  next_turn: ["次の番", "次のターン"],
  self: ["自分"],
};

const ENTRIES: [string, string][] = Object.entries(VOCAB)
  .flatMap(([c, ws]) => ws.map((w) => [normalize(w).replace(/ /g, ""), c] as [string, string]))
  .sort((a, b) => b[0].length - a[0].length);

/** 正規化ずみの文から概念を取り出す（長い言い方から先に、重ならないように） */
export function conceptsOf(norm: string): Set<string> {
  const out = new Set<string>();
  let s = norm;
  for (const [w, c] of ENTRIES) {
    if (!s.includes(w)) continue;
    out.add(c);
    s = s.split(w).join("\u0000");
  }
  return out;
}

const RAW = Object.values(VOCAB)
  .flat()
  .sort((a, b) => b.length - a.length);
/**
 * 言い回しの中で、概念になっていない中身の字の数（ひらがな＝助詞・送りがなは数えない）。
 * 2字以上あると「傷ついたポケモンを呼び出す」→ {ポケモン, 呼ぶ} のように意味が欠けるので、ゆるい読み取りには使わない
 */
function uncovered(expr: string): number {
  let s = expr;
  for (const w of RAW) s = s.split(w).join("");
  return s.replace(/[\u3040-\u309fー\s0-9A-Za-z・、。]/g, "").length;
}

export interface Signature {
  tag: string;
  concepts: Set<string>;
  weight: number;
}

/** 表現辞書のタグの言い回しから、概念の組（2つ以上）を作る。同じタグ・同じ組は1つにまとめる */
export function buildSignatures(lexicon: { expr: string; target: object; weight: number }[]): Signature[] {
  const seen = new Map<string, Signature>();
  for (const e of lexicon) {
    if (!("tag" in e.target)) continue;
    const tag = (e.target as { tag: string }).tag;
    const cs = conceptsOf(normalize(e.expr).replace(/ /g, ""));
    if (cs.size < 2 || uncovered(e.expr) >= 2) continue;
    const key = `${tag}|${[...cs].sort().join(",")}`;
    const prev = seen.get(key);
    if (!prev || prev.weight < e.weight) seen.set(key, { tag, concepts: cs, weight: e.weight });
  }
  return [...seen.values()];
}

export const subset = (a: Set<string>, b: Set<string>) => [...a].every((x) => b.has(x));

/** 「何かをする」概念（回収・サーチ・捨てる・封じる…）と「どこから」の概念。種類の言葉が「何を」なのかを見分けるのに使う */
export const ACTIONS = new Set(["recover", "fetch", "draw", "discard", "attach", "move", "switch", "lock", "heal", "copy", "accel"]);
export const SOURCES = new Set(["trash_from", "deck_from", "trash", "deck"]);
/** 種類の言葉の概念 */
export const KINDS = new Set(["item", "supporter", "tool", "stadium", "trainer", "pokemon", "basic", "energy"]);
/** 「〜から」の付いた概念は、付いていない言葉の説明にもなる（「でっき」は「山札から」で説明がつく） */
export const widen = (cs: Iterable<string>) => {
  const out = new Set(cs);
  if (out.has("trash_from")) out.add("trash");
  if (out.has("deck_from")) out.add("deck");
  if (out.has("basic")) out.add("pokemon");
  return out;
};
/**
 * 言葉から、概念として読めた部分と前後の助詞・活用を除いた残り（2字以上のかたまり）。
 * 「相手をねむらせて」→「ねむらせ」のように、読めなかった中身を記録するのに使う
 */
export function leftover(norm: string): string[] {
  let s = norm;
  for (const [w] of ENTRIES) s = s.split(w).join(" ");
  const EDGE_HEAD = /^(から|まで|より|を|に|で|が|は|と|も|の|へ|や)+/;
  const EDGE_TAIL = /(つてくる|つてくれる|つてく|つてき|てくる|てくれる|くる|くれる|つて|させて|させる|させ|られる|れる|して|する|したい|たい|ほしい|できる|ない|て|で|る|た|す|く|の|を|に|が|は|と)+$/;
  // 言いたいことの中身にならない言葉（「〜したい」「〜できる」）
  const NOISE = /^(したい|ほしい|できる|できた|くれる|ある|いる|なる|やつ|もの|こと|かんじ|感じ|系|ような|ように|みたい|とか|など|なに|何)$/;
  return s
    .split(" ")
    .map((x) => x.replace(EDGE_HEAD, "").replace(EDGE_TAIL, ""))
    .filter((x) => x.length >= 2 && !NOISE.test(x));
}

/** 種類の概念の言い方（正規化ずみ）。「何を」として使われているかを見分けるのに使う */
export const kindWordsOf = (concept: string) => ENTRIES.filter(([, c]) => c === concept).map(([w]) => w);

/** 検索文の言葉のうち、それだけでは条件にならない添え物（手札・相手・ポケモン・回収する…）。タグが当たっていれば全文検索語にしない */
export const GENERIC = new Set(["hand", "opp", "self", "pokemon", "active", "recover", "fetch", "up", "down", "attach", "draw", "count"]);

/**
 * 検索文の概念に当てはまるタグ。いちばん詳しいものだけ残す:
 *   ・ほかの候補の概念の組に含まれてしまう（もっと詳しい言い回しがある）ものは外す
 *   ・親子のタグが両方候補なら、親は外す
 */
export function matchSignatures(sigs: Signature[], qc: Set<string>): Signature[] {
  const hits = sigs.filter((s) => subset(s.concepts, qc));
  const best = hits.filter((s) => !hits.some((o) => o !== s && o.tag !== s.tag && o.concepts.size > s.concepts.size && subset(s.concepts, o.concepts)));
  // 親子のタグが同じ概念の組で並んだら、親を残す（子に絞る理由がない）
  const byTag = new Map<string, Signature>();
  for (const s of best) {
    const p = byTag.get(s.tag);
    if (!p || s.concepts.size > p.concepts.size || (s.concepts.size === p.concepts.size && s.weight > p.weight)) byTag.set(s.tag, s);
  }
  const all = [...byTag.values()];
  return all.filter(
    (s) =>
      !all.some((o) => o.tag.startsWith(`${s.tag}.`) && o.concepts.size > s.concepts.size && subset(s.concepts, o.concepts)) && // 親の言い回しを全部ふくむ、詳しい子がある親は外す
      !all.some((o) => s.tag.startsWith(`${o.tag}.`) && subset(s.concepts, o.concepts)), // 親の言い回しに何も足さない子は外す
  );
}
