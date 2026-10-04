// ポケモン名の日本語化。PokeAPI の種名（日本語）を使い、ex・メガ・リージョン・持ち主などを付け直す。
// 出力: data/names-ja.json（英語名 → 日本語名）。トレーナーズ名はGame8取得かLLM翻訳で埋める。
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Card } from "./lib/types.ts";

const DATA = join(import.meta.dirname, "../data");
const cards: Card[] = JSON.parse(readFileSync(join(DATA, "cards.base.json"), "utf8"));

// PokeAPI: language 9 = en, 11 = ja（漢字かな）, 1 = ja-Hrkt（かな）
const apos = (s: string) => s.replace(/[’‘]/g, "'");
const en2id = new Map<string, string>();
const id2ja = new Map<string, string>();
const csv = readFileSync(join(DATA, "raw/pokeapi.species_names.csv"), "utf8").split("\n").slice(1);
for (const line of csv) {
  const [id, lang, name] = line.split(",");
  if (!name) continue;
  if (lang === "9") en2id.set(apos(name), id);
  if (lang === "11" || (lang === "1" && !id2ja.has(id))) id2ja.set(id, name);
}
const species = (en: string) => id2ja.get(en2id.get(apos(en)) ?? "");

// フォルム違いなど、種名だけでは決まらないもの
const FORMS: Record<string, string> = {
  "Castform Rainy Form": "ポワルン（あまみずのすがた）",
  "Castform Snowy Form": "ポワルン（ゆきぐものすがた）",
  "Castform Sunny Form": "ポワルン（たいようのすがた）",
  "Teal Mask Ogerpon": "オーガポン（みどりのめん）",
  "Teal MaskOgerpon": "オーガポン（みどりのめん）",
  "Wellspring Mask Ogerpon": "オーガポン（いどのめん）",
  "Hearthflame Mask Ogerpon": "オーガポン（かまどのめん）",
  "Cornerstone Mask Ogerpon": "オーガポン（いしずえのめん）",
  "Dusk Mane Necrozma": "ネクロズマ（たそがれのたてがみ）",
  "Dawn Wings Necrozma": "ネクロズマ（あかつきのつばさ）",
  "Ultra Necrozma": "ウルトラネクロズマ",
  "Heat Rotom": "ヒートロトム",
  "Wash Rotom": "ウォッシュロトム",
  "Frost Rotom": "フロストロトム",
  "Fan Rotom": "スピンロトム",
  "Mow Rotom": "カットロトム",
  "Origin Forme Dialga": "オリジンディアルガ",
  "Origin Forme Palkia": "オリジンパルキア",
  "Single Strike Urshifu": "ウーラオス（いちげきのかた）",
  "Rapid Strike Urshifu": "ウーラオス（れんげきのかた）",
};
const REGION: Record<string, string> = { Alolan: "アローラ", Galarian: "ガラル", Hisuian: "ヒスイ", Paldean: "パルデア" };
const OWNER: Record<string, string> = { "Team Rocket's": "ロケット団の" };

function toJa(nameEn: string): string | undefined {
  let rest = nameEn;
  const ex = / ex$/.test(rest);
  rest = rest.replace(/ ex$/, "");
  const mega = /^Mega /.test(rest);
  rest = rest.replace(/^Mega /, "");
  let owner = "";
  const o = rest.match(/^(.+?'s) (.+)$/);
  if (o) {
    if (!OWNER[o[1]]) return undefined;
    owner = OWNER[o[1]];
    rest = o[2];
  }
  let region = "";
  const r = rest.match(/^(Alolan|Galarian|Hisuian|Paldean) (.+)$/);
  if (r) {
    region = REGION[r[1]];
    rest = r[2];
  }
  let xy = "";
  const m = rest.match(/^(.+) ([XY])$/);
  if (m && !FORMS[rest]) {
    rest = m[1];
    xy = m[2];
  }
  const base = FORMS[rest] ?? species(rest);
  if (!base) return undefined;
  return `${owner}${mega ? "メガ" : ""}${region}${base}${xy}${ex ? "ex" : ""}`;
}

const out: Record<string, string> = {};
const unresolved: string[] = [];
for (const name of new Set(cards.filter((c) => c.kind === "pokemon").map((c) => c.nameEn))) {
  const ja = toJa(name);
  if (ja) out[name] = ja;
  else unresolved.push(name);
}

writeFileSync(join(DATA, "names-ja.json"), JSON.stringify(out, null, 1));
console.log(`ポケモン名 ${Object.keys(out).length} 件を日本語化`);
if (unresolved.length) console.log(`未解決 ${unresolved.length} 件: ${unresolved.join(", ")}`);
