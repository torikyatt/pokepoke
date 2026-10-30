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
  it("複数選んだら全部に当てはまるもの（AND）。1枚に1つしかないもの（進化など）は、どれか（OR）", () => {
    const dual = data.cards.filter((c) => matchFilters(c, { ...EMPTY_FILTERS, types: ["water", "darkness"] }));
    expect(dual.some((c) => c.id === "c1-042")).toBe(true); // メガゲッコウガex（水・悪）
    expect(dual.every((c) => [c.type, c.type2, ...c.typeRefs].includes("water") && [c.type, c.type2, ...c.typeRefs].includes("darkness"))).toBe(true);
    const tags = ["status.sleep", "status.poison"];
    const both = data.cards.filter((c) => matchFilters(c, { ...EMPTY_FILTERS, tags }));
    expect(both.length).toBeGreaterThan(0);
    expect(both.every((c) => tags.every((t) => c.tags.includes(t)))).toBe(true);
    const stages = data.cards.filter((c) => matchFilters(c, { ...EMPTY_FILTERS, stages: ["basic", "stage1"] }));
    expect(stages.length).toBeGreaterThan(0);
  });
});
