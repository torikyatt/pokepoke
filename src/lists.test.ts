import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canMirror, decodeList, encodeList, listCodeOf, printIndex, sameItem } from "./lists.ts";
import type { AppData } from "./types.ts";

const data: AppData = JSON.parse(readFileSync("src/data/app-data.json", "utf8"));
const idx = printIndex(data.cards);

describe("リストの共有コード", () => {
  it("リスト: 絵柄・ミラー・枚数・名前がそのまま戻る", () => {
    const l = {
      name: "ほしい ~ もの/リスト",
      kind: "list" as const,
      items: [
        { print: "a1-001", n: 3, side: "main" as const },
        { print: "a1-001", mirror: true, n: 1, side: "main" as const },
        { print: "a3-211", n: 2, side: "main" as const },
      ],
    };
    const code = encodeList(l);
    expect(code.startsWith("L1~l~")).toBe(true);
    expect(decodeList(code, idx)).toEqual(l);
  });
  it("トレード用: 欲しい・出せるに分かれて戻る", () => {
    const l = {
      name: "Trade",
      kind: "trade" as const,
      items: [
        { print: "b3-081", n: 1, side: "want" as const },
        { print: "a1-002", mirror: true, n: 2, side: "give" as const },
      ],
    };
    expect(decodeList(encodeList(l), idx)).toEqual(l);
  });
  it("知らない収録・壊れたコードは読まない", () => {
    expect(decodeList("L1~l~zz-999.a1-001x2~x", idx).items).toEqual([{ print: "a1-001", n: 2, side: "main" }]);
    expect(() => decodeList("2~F~a1-001~deck", idx)).toThrow();
  });
  it("URL・まわりの文字からコードを取り出す", () => {
    expect(listCodeOf("見て https://pokepokeindex.com/#/list/L1~l~a1-001~abc")).toBe("L1~l~a1-001~abc");
    expect(listCodeOf("L1~t~a1-001~~x")).toBe("L1~t~a1-001~~x");
  });
  it("同じ行の判定（ミラーの有無・区分で別の行）", () => {
    expect(sameItem({ print: "a1-001", side: "main" }, { print: "a1-001", mirror: false, side: "main" })).toBe(true);
    expect(sameItem({ print: "a1-001", side: "main" }, { print: "a1-001", mirror: true, side: "main" })).toBe(false);
    expect(sameItem({ print: "a1-001", side: "want" }, { print: "a1-001", side: "give" })).toBe(false);
  });
});

describe("ミラー仕様", () => {
  it("ex以外の◆1〜3の絵柄だけミラーにできる", () => {
    const [bulba, bulbaPrint] = idx.get("a1-001")!;
    expect(canMirror(bulba, bulbaPrint)).toBe(true);
    const ex = data.cards.find((c) => c.rule === "ex")!;
    expect(ex.prints.some((p) => canMirror(ex, p))).toBe(false);
    const art = data.cards.flatMap((c) => c.prints.map((p) => [c, p] as const)).find(([, p]) => p.rarity === "☆")!;
    expect(canMirror(art[0], art[1])).toBe(false);
    const promo = data.cards.flatMap((c) => c.prints.map((p) => [c, p] as const)).find(([, p]) => p.rarity === "Promo")!;
    expect(canMirror(promo[0], promo[1])).toBe(false);
  });
});

describe("リストの共有リンクのページ（server/list-page.ts）", () => {
  it("共有コードから名前・種類・カードを読む（アプリと同じ形）", async () => {
    const { decodeListCode } = await import("../server/list-page.ts");
    const code = encodeList({ name: "交換 ~ したい", kind: "trade", items: [{ print: "b3-081", n: 1, side: "want" }, { print: "a1-002", mirror: true, n: 2, side: "give" }] });
    expect(decodeListCode(code)).toEqual({ name: "交換 ~ したい", trade: true, parts: [[["b3-081", 1]], [["a1-002", 2]]] });
    expect(decodeListCode("L1~l~a1-001x3~abc")).toEqual({ name: "abc", trade: false, parts: [[["a1-001", 3]]] });
    expect(decodeListCode("2~F~a1-001~deck")).toBeUndefined();
  });
  it("共有URL（/l/…・/en/l/…）からコードを取り出す", () => {
    expect(listCodeOf("https://pokepokeindex.com/l/L1~l~a1-001~abc")).toBe("L1~l~a1-001~abc");
    expect(listCodeOf("https://pokepokeindex.com/en/l/L1~t~a1-001~~x")).toBe("L1~t~a1-001~~x");
  });
});
