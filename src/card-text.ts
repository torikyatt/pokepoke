// カードの英文から、名指しされているタイプを読む（シナジー判定でビルド時と実行時の両方が使う）
import type { AppCard, EnergyType } from "./types.ts";

const CODE: Record<string, EnergyType> = {
  G: "grass", R: "fire", W: "water", L: "lightning", P: "psychic", F: "fighting", D: "darkness", M: "metal", C: "colorless", N: "dragon",
};
const clean = (s: string) => s.replace(/\[\s*([A-Z])\s*\]/g, "[$1]").replace(/Pokemon/g, "Pokémon").replace(/\s+/g, " ");

/**
 * 「[R], [W], or [L] Energy」「[G] or [P] Pokémon」のように並べて書いたタイプも全部拾う（noun: Energy / Pokémon）。
 * [C] も「無色」というタイプとして読む（レジギガス「Take a [C] Energy」は無色エネを付ける。闘エネの代わりにはならない）
 */
export function typesBefore(text: string, noun: "Energy" | "Pokémon"): EnergyType[] {
  const t = clean(text);
  const out = new Set<EnergyType>();
  const re = new RegExp(`((?:\\[[A-Z]\\](?:\\s*,\\s*(?:or\\s+|and\\s+)?|\\s+or\\s+|\\s+and\\s+)?)+)\\s*${noun}`, "g");
  for (const m of t.matchAll(re)) for (const x of m[1].matchAll(/\[([A-Z])\]/g)) if (CODE[x[1]]) out.add(CODE[x[1]]);
  return [...out];
}

/** 効果文が名指ししているタイプ（「[W] Pokémon」「[R] Energy」）。相手のポケモンについての文（opponent's …）は除く */
export function namedTypes(c: AppCard): EnergyType[] {
  const sentences = [c.ability?.textEn, ...c.attacks.map((a) => a.textEn), c.text?.textEn]
    .filter((x): x is string => !!x)
    .flatMap((x) => x.split(/(?<=\.)\s+/))
    .filter((x) => !/opponent/i.test(x));
  const out = new Set<EnergyType>();
  for (const s of sentences) for (const t of [...typesBefore(s, "Pokémon"), ...typesBefore(s, "Energy")]) out.add(t);
  return [...out];
}
