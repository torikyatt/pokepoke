import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EMPTY_FILTERS, matchFilters } from "./pool.ts";
import type { AppData } from "./types.ts";

const data: AppData = JSON.parse(readFileSync(new URL("./data/app-data.json", import.meta.url), "utf8"));

describe("絞り込み", () => {
  it("ワザに必要なエネ: 選んだエネルギーを全部コストに含むワザがあるカード", () => {
    const fire = data.cards.filter((c) => matchFilters(c, { ...EMPTY_FILTERS, costTypes: ["fire"] }));
    expect(fire.length).toBeGreaterThan(0);
    expect(fire.every((c) => c.attacks.some((a) => (a.cost.fire ?? 0) > 0))).toBe(true);
    // 炎ポケモンでも炎エネを使わないワザだけなら入らない・炎以外のポケモンでも炎エネのワザがあれば入る
    expect(fire.some((c) => c.type !== "fire")).toBe(true);
    // 2つ選ぶと、1つのワザで両方のエネルギーを使うカードだけ（AND）
    const both = data.cards.filter((c) => matchFilters(c, { ...EMPTY_FILTERS, costTypes: ["fire", "colorless"] }));
    expect(both.length).toBeGreaterThan(0);
    expect(both.length).toBeLessThan(fire.length);
    expect(both.every((c) => c.attacks.some((a) => (a.cost.fire ?? 0) > 0 && (a.cost.colorless ?? 0) > 0))).toBe(true);
    // 無色だけ選ぶと、無色エネを含むワザのあるカード。トレーナーズは入らない
    const colorless = data.cards.filter((c) => matchFilters(c, { ...EMPTY_FILTERS, costTypes: ["colorless"] }));
    expect(colorless.every((c) => c.kind === "pokemon")).toBe(true);
  });
  it("タイプ・効果・グループは複数選んだら全部（AND）、パック・レアリティ・ルールなどは、どれか（OR）", () => {
    const n = (f: Partial<typeof EMPTY_FILTERS>) => data.cards.filter((c) => matchFilters(c, { ...EMPTY_FILTERS, ...f }));
    const dual = n({ types: ["water", "darkness"] });
    expect(dual.some((c) => c.id === "c1-042")).toBe(true); // メガゲッコウガex（水・悪）
    expect(dual.length).toBeLessThan(n({ types: ["water"] }).length);
    const both = n({ tags: ["status.sleep", "status.poison"] });
    expect(both.length).toBeGreaterThan(0);
    expect(both.every((c) => c.tags.includes("status.sleep") && c.tags.includes("status.poison"))).toBe(true);
    const groups = n({ groups: ["team_rocket", "baby"] });
    expect(groups.every((c) => c.groups.includes("team_rocket") && c.groups.includes("baby"))).toBe(true);
    expect(groups.length).toBeLessThanOrEqual(n({ groups: ["team_rocket"] }).length);
    expect(n({ rules: ["ex", "mega_ex"] }).length).toBeGreaterThan(n({ rules: ["ex"] }).length);
    expect(n({ sets: ["a1", "c1"] }).length).toBeGreaterThan(n({ sets: ["a1"] }).length);
    expect(n({ rarities: ["☆", "☆☆"] }).length).toBeGreaterThan(n({ rarities: ["☆"] }).length);
  });
});
