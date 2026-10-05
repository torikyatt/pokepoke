// ワザ・特性・トレーナーズ効果ごとにタグを付ける（オフライン工程）。
// 入力は英語原文（構造が安定していて解釈ブレが少ない）。ルールの正本は data/taxonomy.yaml。
// 名前指定（「〇〇がベンチにいるなら」「“ロケット団”という名前の」など）は効果文から抜き出し、カードIDで直接結ぶ。
// 出力: data/tags.json
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadTaxonomy, type EffectSlot } from "./lib/taxonomy.ts";
import type { Card, Effect } from "./lib/types.ts";

const DATA = join(import.meta.dirname, "../data");
const cards: Card[] = JSON.parse(readFileSync(join(DATA, "cards.json"), "utf8"));
const tax = loadTaxonomy(DATA);
// overrides.json の tags: { カードID: { スロット: { add?: [], remove?: [] } } }。スロットは ability / text / attack0, attack1 …
const overrides: { tags?: Record<string, Record<string, { add?: string[]; remove?: string[] }>> } = existsSync(
  join(DATA, "overrides.json"),
)
  ? JSON.parse(readFileSync(join(DATA, "overrides.json"), "utf8"))
  : {};

export interface CardTags {
  ability?: string[];
  attacks: string[][];
  text?: string[];
  refs: string[]; // 効果文が名前で指しているカードID
  refHow?: Record<string, string>; // 名前そのもの以外で指しているときの指し方（mega_ex / team_rocket / evolves:Riolu / attack:Puppy Pile …）
  slotRefs: Record<string, string[]>; // 効果ごとの名前指定（ability / attack0 … / text）
}

const clean = (s: string) =>
  s
    .replace(/\[\s*([A-Z])\s*\]/g, "[$1]")
    .replace(/Pokemon/g, "Pokémon")
    .replace(/[−–]/g, "-")
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
const sentences = (s: string) => clean(s).split(/(?<=[.)])\s+(?=[A-Z①②(])/);

// ---- 状態異常: 「相手を状態異常にする文」だけに付ける ----
const CONDITIONS: Record<string, string> = {
  Poisoned: "status.poison", Burned: "status.burn", Paralyzed: "status.paralysis", Asleep: "status.sleep", Confused: "status.confusion",
};
const NOT_INFLICT = [
  /^If your opponent's Active Pokémon is/, // 条件（cond.status）
  /^This Pokémon is now/, /If tails, this Pokémon is now/, /your Active Pokémon is now also/, /it is now Asleep/, // 自分が受ける
  /recover|can't be affected|can't be Asleep|remove a random Special Condition/, // 回復・予防
  /for each Special Condition/,
];

function tagEffect(text: string, slot: EffectSlot): Set<string> {
  const out = new Set<string>();
  const ss = sentences(text);
  for (const t of tax) {
    if (t.on && !t.on.includes(slot)) continue;
    if (t.id.startsWith("status.") && CONDITIONS[t.match[0]?.source ?? ""]) continue;
    if (ss.some((s) => t.match.some((re) => re.test(s)) && !t.exclude.some((re) => re.test(s)))) out.add(t.id);
  }
  for (const s of ss) {
    if (NOT_INFLICT.some((re) => re.test(s))) continue;
    for (const [word, id] of Object.entries(CONDITIONS)) if (new RegExp(`\\b${word}\\b`).test(s)) out.add(id);
  }
  if (slot === "ability" && !/^Once during (your|each player's) turn/.test(clean(text))) out.add("passive.ability");
  if (slot === "tool") out.add("passive.tool");
  return out;
}

// ---- 名前指定 ----
const nameKey = (s: string) => s.replace(/\s+/g, " ").trim();
const byName = new Map<string, string[]>();
const byAttack = new Map<string, string[]>();
const byEvolvesFrom = new Map<string, string[]>();
for (const c of cards) {
  (byName.get(nameKey(c.nameEn)) ?? byName.set(nameKey(c.nameEn), []).get(nameKey(c.nameEn))!).push(c.id);
  for (const a of c.attacks) if (a.nameEn) (byAttack.get(a.nameEn) ?? byAttack.set(a.nameEn, []).get(a.nameEn)!).push(c.id);
  if (c.evolvesFromName) (byEvolvesFrom.get(c.evolvesFromName) ?? byEvolvesFrom.set(c.evolvesFromName, []).get(c.evolvesFromName)!).push(c.id);
}
// 長い名前から当てる（"Arceus ex" を "Arceus" より先に）。3文字以下は誤爆するので除く
const names = [...byName.keys()].filter((n) => n.length > 3).sort((a, b) => b.length - a.length);
const GROUPS: [RegExp, (c: Card) => boolean, string][] = [
  [/“Team Rocket” in its name|Team Rocket" in its name/, (c) => c.groups.includes("team_rocket"), "team_rocket"],
  [/Ultra Beasts?\b/, (c) => c.groups.includes("ultra_beast"), "ultra_beast"],
  [/Ancient Pokémon/, (c) => c.groups.includes("ancient"), "ancient"],
  [/Future Pokémon/, (c) => c.groups.includes("future"), "future"],
  [/Mega Evolution Pokémon ex/, (c) => c.rule === "mega_ex", "mega_ex"],
];

/** 効果文が指しているカードと、その指し方（名前そのもの以外: グループ・進化元・ワザの名前） */
function refsWithHow(card: Card, texts: string[]): Map<string, string | undefined> {
  const how = new Map<string, string | undefined>();
  const put = (id: string, h?: string) => {
    if (!how.has(id) || (how.get(id) && !h)) how.set(id, h); // 名前そのものでも指していれば、それを優先
  };
  const own = new Set([card.nameEn, ...card.attacks.map((a) => a.nameEn ?? "")]);
  for (const raw of texts) {
    let t = clean(raw);
    for (const [re, pick, h] of GROUPS) if (re.test(t)) for (const c of cards) if (pick(c)) put(c.id, h);
    for (const m of t.matchAll(/evolves? from ([A-Z][\w'.-]*(?: [A-Z][\w'.-]*)*)/g)) {
      for (const id of byEvolvesFrom.get(m[1]) ?? []) put(id, `evolves:${m[1]}`);
    }
    for (const [atk, ids] of byAttack) {
      if (own.has(atk) || atk.length < 5) continue;
      if (new RegExp(`(used ${esc(atk)}|the ${esc(atk)} attack|${esc(atk)} attack)`).test(t)) for (const id of ids) put(id, `attack:${atk}`);
    }
    for (const n of names) {
      if (n === card.nameEn) continue;
      const re = new RegExp(`(?<![\\w'])${esc(n)}(?![\\w'])`);
      if (re.test(t)) {
        for (const id of byName.get(n)!) put(id);
        t = t.replace(new RegExp(esc(n), "g"), " "); // 短い名前で二重に当てない
      }
    }
  }
  how.delete(card.id);
  return how;
}

function refsOf(card: Card, texts: string[]): string[] {
  return [...refsWithHow(card, texts).keys()];
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ---- 付与 ----
const known = new Set(tax.map((t) => t.id));
const out: Record<string, CardTags> = {};
const slotOf = (c: Card): EffectSlot => (c.kind === "tool" ? "tool" : "trainer");
function apply(cardId: string, slot: string, tags: Set<string>): string[] {
  const ov = overrides.tags?.[cardId]?.[slot];
  for (const t of ov?.add ?? []) {
    if (!known.has(t)) throw new Error(`overrides.json: 未定義タグ ${t} (${cardId} ${slot})`);
    tags.add(t);
  }
  for (const t of ov?.remove ?? []) tags.delete(t);
  return [...tags].sort();
}

const empty: string[] = [];
for (const c of cards) {
  const ct: CardTags = { attacks: [], refs: [], slotRefs: {} };
  const texts: string[] = [];
  const effects: [string, Effect, EffectSlot][] = [];
  if (c.ability) effects.push(["ability", c.ability, "ability"]);
  c.attacks.forEach((a, i) => effects.push([`attack${i}`, a, "attack"]));
  if (c.text) effects.push(["text", c.text, slotOf(c)]);
  for (const [slot, e, kind] of effects) {
    const tags = apply(c.id, slot, e.textEn ? tagEffect(e.textEn, kind) : new Set());
    if (e.textEn) {
      texts.push(e.textEn);
      const r = refsOf(c, [e.textEn]);
      if (r.length) ct.slotRefs[slot] = r;
    }
    if (e.textEn && !tags.length && c.kind !== "fossil") empty.push(`${c.id} ${c.nameEn} [${slot}] ${e.textEn}`);
    if (slot === "ability") ct.ability = tags;
    else if (slot === "text") ct.text = tags;
    else ct.attacks.push(tags);
  }
  const how = refsWithHow(c, texts);
  ct.refs = [...how.keys()];
  const hows = Object.fromEntries([...how].filter(([, h]) => h)) as Record<string, string>;
  if (Object.keys(hows).length) ct.refHow = hows;
  out[c.id] = ct;
}

writeFileSync(join(DATA, "tags.json"), JSON.stringify(out));

const count = new Map<string, number>();
for (const ct of Object.values(out)) for (const t of [...(ct.ability ?? []), ...ct.attacks.flat(), ...(ct.text ?? [])]) count.set(t, (count.get(t) ?? 0) + 1);
const unused = tax.filter((t) => !t.match.length ? false : !count.has(t.id)).map((t) => t.id);
console.log(`タグ ${tax.length} 種 / 付与 ${[...count.values()].reduce((a, b) => a + b, 0)} 件 / 名前指定のあるカード ${Object.values(out).filter((x) => x.refs.length).length} 種`);
console.log(`効果文があるのにタグ無し ${empty.length} 件`);
for (const e of empty.slice(0, 40)) console.log(`  △ ${e}`);
if (unused.length) console.log(`一度も付かなかったタグ: ${unused.join(", ")}`);
if (process.argv.includes("--counts")) for (const [k, n] of [...count].sort()) console.log(`  ${k} ${n}`);
