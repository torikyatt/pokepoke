// 公式日本語（Game8）が付かなかったワザ名・特性名・効果文・カード名を補う。
//   1. 同じ英文に別のカードで公式訳が付いていれば、それを使う（公式扱い）
//   2. 無ければ data/translations.json（英文のハッシュ → 日本語）の仮訳を使う（jaSource: "machine"）
//   3. それも無ければ data/translate-todo.json に書き出す。Claude Code に渡して translations.json に追記してもらう
//      （glossary.json の用語を必ず使う。APIキーはコードに埋め込まない）
// data/cards.json をその場で更新する。
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Card, Effect } from "./lib/types.ts";

const DATA = join(import.meta.dirname, "../data");
const cards: Card[] = JSON.parse(readFileSync(join(DATA, "cards.json"), "utf8"));
const translations: Record<string, { en: string; ja: string }> = existsSync(join(DATA, "translations.json"))
  ? JSON.parse(readFileSync(join(DATA, "translations.json"), "utf8"))
  : {};
export const hashOf = (en: string) => createHash("sha1").update(en.normalize("NFKC").replace(/\s+/g, " ").trim()).digest("hex").slice(0, 12);

const effectsOf = (c: Card): Effect[] => [c.ability, ...c.attacks, c.text].filter((e) => e !== undefined);

// 公式訳の対応表（英文 → 最頻の日本語）
const tally = new Map<string, Map<string, number>>();
const add = (en: string | undefined, ja: string | undefined) => {
  if (!en || !ja) return;
  const m = tally.get(en) ?? tally.set(en, new Map()).get(en)!;
  m.set(ja, (m.get(ja) ?? 0) + 1);
};
for (const c of cards) {
  for (const e of effectsOf(c)) {
    if (e.jaSource !== "official") continue;
    add(e.nameEn ? `name:${e.nameEn}` : undefined, e.nameJa);
    add(`text:${e.textEn}`, e.textJa);
  }
}
const official = (key: string) => [...(tally.get(key) ?? [])].sort((a, b) => b[1] - a[1])[0]?.[0];

const todo: Record<string, { en: string; where: string }> = {};
let reused = 0;
let machine = 0;
function fill(en: string, kind: "name" | "text", where: string): { ja?: string; source?: "official" | "machine" } {
  const o = official(`${kind}:${en}`);
  if (o) {
    reused++;
    return { ja: o, source: "official" };
  }
  const t = translations[hashOf(en)];
  if (t) {
    machine++;
    return { ja: t.ja, source: "machine" };
  }
  todo[hashOf(en)] = { en, where };
  return {};
}

for (const c of cards) {
  if (!c.nameJa) {
    const r = fill(c.nameEn, "name", `${c.id} カード名`);
    if (r.ja) {
      c.nameJa = r.ja;
      c.nameJaMachine = r.source === "machine" || undefined;
    }
  }
  for (const e of effectsOf(c)) {
    let usedMachine = false;
    if (e.nameEn && !e.nameJa) {
      const r = fill(e.nameEn, "name", `${c.id} ${c.nameEn}「${e.nameEn}」名前`);
      if (r.ja) e.nameJa = r.ja;
      usedMachine ||= r.source === "machine";
    }
    if (e.textEn && !e.textJa) {
      const r = fill(e.textEn, "text", `${c.id} ${c.nameEn}「${e.nameEn ?? ""}」効果`);
      if (r.ja) e.textJa = r.ja;
      usedMachine ||= r.source === "machine";
    }
    if (usedMachine) e.jaSource = "machine";
    else if (!e.jaSource && (e.nameJa || !e.nameEn) && (e.textJa || !e.textEn)) e.jaSource = "official";
  }
}

writeFileSync(join(DATA, "cards.json"), JSON.stringify(cards, null, 1));
writeFileSync(join(DATA, "translate-todo.json"), JSON.stringify(todo, null, 1));
console.log(`同じ英文の公式訳を流用 ${reused} 件 / 仮訳を適用 ${machine} 件 / 未翻訳 ${Object.keys(todo).length} 件`);
if (Object.keys(todo).length) console.log("→ data/translate-todo.json を translations.json に訳して追記してください");
