// 効果が「誰に」効くかを英文から読み取る（シナジー判定用）。
// 例: そうじゅくエキス「Choose 1 of your [G] Pokémon … evolves」→ 草の進化ポケモンだけ
//     コイキング「… evolves from this Pokémon onto this Pokémon」→ 自分の進化先だけ
//     大きなふうせん「The Stage 2 Pokémon this card is attached to …」→ 2進化だけ
import type { CardGroup, EnergyType, Selector, Stage } from "../../src/types.ts";

const CODE: Record<string, EnergyType> = {
  G: "grass", R: "fire", W: "water", L: "lightning", P: "psychic", F: "fighting", D: "darkness", M: "metal", C: "colorless",
};

const clean = (s: string) => s.replace(/\[\s*([A-Z])\s*\]/g, "[$1]").replace(/Pokemon/g, "Pokémon").replace(/[’‘]/g, "'").replace(/\s+/g, " ");

// 自分自身にしか効かない書き方（供給の種類ごと）
const SELF: Record<string, RegExp> = {
  "supply.energy.many": /to this Pokémon/,
  "supply.damage.self": /damage to itself|do \d+ damage to this Pokémon|damage to this Pokémon instead|to this Pokémon\./,
  "supply.retreat.help": /this Pokémon (has no Retreat Cost|'s Retreat Cost)|it has no Retreat Cost|[Ss]witch (this Pokémon|it) with/,
  "supply.evolve.help": /this Pokémon can evolve|onto this Pokémon to evolve it|it can evolve during/,
};
// 自分以外にも効く書き方（これがあれば「自分だけ」ではない）
const OTHERS: Record<string, RegExp> = {
  "supply.energy.many": /attach (it|them|1 Energy each) to (?!this Pokémon)|to 1 of your|to your (Benched|Active)|Benched Pokémon\. For each|your \[[A-Z]\] Pokémon in any way|attached to your \[[A-Z]\] Pokémon/,
  "supply.damage.self": /your Benched|1 of your Pokémon|all Benched|each of your Benched/,
};

export function selectorOf(supply: string, raw: string, refs: string[]): Selector {
  const t = clean(raw);
  const sel: Selector = {};
  const selfRe = SELF[supply];
  if (selfRe?.test(t) && !OTHERS[supply]?.test(t)) {
    // 「イーブイから進化するポケモンに進化できる」のように相手が名指しされていれば、そちらを対象にする
    if (supply === "supply.evolve.help" && refs.length) sel.ids = refs;
    else sel.self = true;
    return sel;
  }
  if (refs.length && supply !== "supply.trash.fill" && supply !== "supply.bench.fill") sel.ids = refs;
  const types = [...t.matchAll(/\[([GRWLPFDM])\] Pokémon/g)].map((m) => CODE[m[1]]);
  if (types.length) sel.types = [...new Set(types)];
  if (supply === "supply.evolve.help") {
    if (/Stage 2/.test(t)) sel.stages = ["stage2"];
  } else {
    const st = t.match(/\b(Basic|Stage 1|Stage 2) Pokémon\b/);
    if (st) sel.stages = [({ Basic: "basic", "Stage 1": "stage1", "Stage 2": "stage2" } as Record<string, Stage>)[st[1]]];
  }
  const hp = t.match(/maximum HP of (\d+) or less/);
  if (hp) sel.preHpMax = Number(hp[1]);
  const groups: CardGroup[] = [];
  if (/Ultra Beasts?/.test(t)) groups.push("ultra_beast");
  if (/Ancient Pokémon/.test(t)) groups.push("ancient");
  if (/Future Pokémon/.test(t)) groups.push("future");
  if (groups.length) sel.groups = groups;
  if (supply === "supply.trash.energy") {
    const et = [...t.matchAll(/\[([GRWLPFDMC])\](?! Pokémon)/g)].map((m) => CODE[m[1]]);
    sel.types = undefined;
    if (et.length) sel.etypes = [...new Set(et)];
  }
  return sel;
}

/** 要求する側の条件（トラッシュのエネの種類など） */
export function requireInfoOf(require: string, raw: string): { etypes?: EnergyType[] } {
  if (require !== "supply.trash.energy") return {};
  const et = [...clean(raw).matchAll(/\[([GRWLPFDMC])\](?! Pokémon)/g)].map((m) => CODE[m[1]]);
  return et.length ? { etypes: [...new Set(et)] } : {};
}
