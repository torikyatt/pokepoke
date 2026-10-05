import { describe, expect, it } from "vitest";
import { decodeShare, encodeShare } from "./deck.ts";

describe("共有コード", () => {
  const deck = { name: "メガルカリオ/型?", energy: ["fighting", "darkness"] as const, cards: ["b3-081", "b3-081", "a2-092", "pa-007", "b3-081"] };
  it("短い形（v2）で書いて、同じデッキに戻せる（同じカードは枚数にまとめる）", () => {
    const code = encodeShare({ ...deck, energy: [...deck.energy] });
    expect(code).toBe("2~FD~b3-081x3.a2-092.pa-007~" + encodeURIComponent(deck.name));
    const back = decodeShare(code);
    expect(back.name).toBe(deck.name);
    expect(back.energy).toEqual(["fighting", "darkness"]);
    expect([...back.cards].sort()).toEqual([...deck.cards].sort());
  });
  it("以前の形（JSON の base64url）も読める", () => {
    const old = Buffer.from(JSON.stringify({ n: "古い", e: ["water"], c: "a1-001,a1-001" })).toString("base64url");
    expect(decodeShare(old)).toEqual({ name: "古い", energy: ["water"], cards: ["a1-001", "a1-001"] });
  });
});
