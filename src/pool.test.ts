import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EMPTY_FILTERS, matchFilters } from "./pool.ts";
import type { AppData } from "./types.ts";

const data: AppData = JSON.parse(readFileSync(new URL("./data/app-data.json", import.meta.url), "utf8"));

describe("絞り込み", () => {
  it("ワザに必要なエネ: そのエネルギーをコストに含むワザがあるカード（どれか）", () => {
    const fire = data.cards.filter((c) => matchFilters(c, { ...EMPTY_FILTERS, costTypes: ["fire"] }));
    expect(fire.length).toBeGreaterThan(0);
    expect(fire.every((c) => c.attacks.some((a) => (a.cost.fire ?? 0) > 0))).toBe(true);
    // 炎ポケモンでも炎エネを使わないワザだけなら入らない・炎以外のポケモンでも炎エネのワザがあれば入る
    expect(fire.some((c) => c.type !== "fire")).toBe(true);
    const both = data.cards.filter((c) => matchFilters(c, { ...EMPTY_FILTERS, costTypes: ["fire", "water"] }));
    expect(both.length).toBeGreaterThan(fire.length);
    // 無色だけ選ぶと、無色エネを含むワザのあるカード。トレーナーズは入らない
    const colorless = data.cards.filter((c) => matchFilters(c, { ...EMPTY_FILTERS, costTypes: ["colorless"] }));
    expect(colorless.every((c) => c.kind === "pokemon")).toBe(true);
  });
});
