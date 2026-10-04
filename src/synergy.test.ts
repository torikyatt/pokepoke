// 相性判定のテスト。効果が「誰に効くか」まで見て結んでいるかを確かめる
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createSynergy } from "./synergy.ts";
import type { AppData } from "./types.ts";

const data: AppData = JSON.parse(readFileSync(join(import.meta.dirname, "data/app-data.json"), "utf8"));
const syn = createSynergy(data);
const byId = new Map(data.cards.map((c) => [c.id, c]));
const partnersOf = (id: string) => syn.partners(byId.get(id)!, 2000);
const reasonOf = (id: string, re: RegExp) => partnersOf(id).filter((p) => p.reasons.some((r) => re.test(r)));

describe("進化補助", () => {
  it("ふしぎなアメは2進化だけ", () => {
    const ps = reasonOf("a3-144", /進化ポケモン/);
    expect(ps.length).toBeGreaterThan(20);
    for (const p of ps) expect(p.card.stage).toBe("stage2");
  });
  it("そうじゅくエキス（草）は草の進化ポケモンだけ", () => {
    const ps = reasonOf("b1a-067", /進化ポケモン/);
    expect(ps.length).toBeGreaterThan(5);
    for (const p of ps) expect(p.card.type).toBe("grass");
  });
  it("ミクリは HP50以下の水ポケモンから進化する水ポケモンだけ", () => {
    const ps = reasonOf("b3b-068", /進化ポケモン/);
    expect(ps.length).toBeGreaterThan(0);
    for (const p of ps) {
      expect(p.card.type).toBe("water");
      expect(p.card.evolvesFrom.some((id) => (byId.get(id)!.hp ?? 999) <= 50)).toBe(true);
    }
  });
  it("自分を進化させる特性（コイキング）は自分の進化先だけ", () => {
    const ps = reasonOf("b1-050", /進化ポケモン/);
    expect(ps.length).toBeGreaterThan(0);
    for (const p of ps) expect(p.card.nameEn).toMatch(/Gyarados/);
  });
  it("進化ポケモンの側から見ても、関係ない進化補助は出ない", () => {
    // ギャラドス（水の1進化）: 草専用のそうじゅくエキスも、2進化専用のふしぎなアメも結ばない。コイキングの特性は結ぶ
    const gyarados = data.cards.find((c) => c.nameEn === "Gyarados" && c.evolvesFrom.includes("b1-050"))!;
    const g = partnersOf(gyarados.id).map((p) => p.card.id);
    expect(g).not.toContain("b1a-067");
    expect(g).not.toContain("a3-144");
    expect(g).toContain("b1-050");
    // フシギバナ（草の2進化）: どちらも結ぶ
    const venusaur = data.cards.find((c) => c.nameEn === "Venusaur" && c.stage === "stage2")!;
    const v = partnersOf(venusaur.id).map((p) => p.card.id);
    expect(v).toContain("b1a-067");
    expect(v).toContain("a3-144");
  });
});

describe("相手の状態を見る効果", () => {
  it("アカギは相手のベンチにダメージを与えるカードと結ぶ", () => {
    const ps = reasonOf("a2-150", /相手のベンチにダメージ/);
    expect(ps.length).toBeGreaterThan(20);
    for (const p of ps) expect(p.card.tags.some((t) => t === "damage.bench" || t === "damage.spread")).toBe(true);
  });
  it("「相手がどくなら」はどくにできるカードとだけ結ぶ", () => {
    const poisonCond = data.cards.find((c) => c.tags.includes("cond.status.poison"))!;
    const ps = reasonOf(poisonCond.id, /できる$/).filter((p) => p.reasons.some((r) => /にできる/.test(r)));
    expect(ps.length).toBeGreaterThan(5);
    for (const p of ps) expect(p.card.tags).toContain("status.poison");
  });
});

describe("自分にしか効かない効果は他と結ばない", () => {
  it("自分にエネを付ける特性は「エネの数で強くなる」他のカードと結ばない", () => {
    const flareonEx = byId.get("a3b-009")!; // ブースターex: トラッシュの炎エネを自分に付ける
    expect(flareonEx.supplies["supply.energy.many"].every((s) => s.self)).toBe(true);
    expect(reasonOf("a3b-009", /付いているエネの数/)).toHaveLength(0);
  });
  it("自分を入れ替えるワザ（ケーシィ）は、にげるが重いポケモンと結ばない", () => {
    expect(reasonOf("a1-115", /にげるエネが重い/)).toHaveLength(0);
  });
  it("名指しのにげる補助（シャリタツ → ヘイラッシャ）", () => {
    const ps = reasonOf("a2b-021", /にげるエネが重い/);
    for (const p of ps) expect(p.card.nameEn).toMatch(/Dondozo/);
  });
});

describe("慣れた人の知っているシナジー", () => {
  it("にじいろの洞窟 ↔ ハクリュー（りゅうのめぐみ）はお互いのいちばん上", () => {
    expect(partnersOf("b4-155")[0].card.id).toBe("b4-117");
    expect(partnersOf("b4-117")[0].card.id).toBe("b4-155");
  });
  it("にじいろの洞窟は、複数タイプのエネが要るポケモン（ドラゴン）と結ぶ", () => {
    const ps = reasonOf("b4-155", /複数タイプのエネ/);
    expect(ps.length).toBeGreaterThan(10);
    for (const p of ps) expect(p.card.attacks.some((a) => Object.keys(a.cost).filter((t) => t !== "colorless").length >= 2)).toBe(true);
  });
  it("レアコイル（ボルトチャージ）は場のエネを集めるカード（ミライドンex・マチス）と強く結び、雷タイプ全般とも結ぶ", () => {
    const top = partnersOf("a1-098").slice(0, 10).map((p) => p.card.nameEn);
    expect(top).toContain("Miraidon ex");
    expect(top).toContain("Lt. Surge");
    expect(reasonOf("a1-098", /雷タイプ/).length).toBeGreaterThan(30);
  });
});

describe("コインをやり直せるカード", () => {
  it("ビクティニは、コインを投げるワザを持つ炎ポケモンとだけ結ぶ", () => {
    const ps = reasonOf("pb-049", /コインを投げる/);
    expect(ps.length).toBeGreaterThan(5);
    for (const p of ps) {
      expect(p.card.type).toBe("fire");
      expect(p.card.attacks.some((a) => a.tags.some((t) => t.startsWith("coin.")))).toBe(true);
    }
  });
  it("サーフゴー（トレーナーズのコイン）は、コインを投げるトレーナーズとだけ結ぶ", () => {
    const ps = reasonOf("b4a-051", /コインを投げる/);
    expect(ps.length).toBeGreaterThan(0);
    for (const p of ps) expect(p.card.kind).not.toBe("pokemon");
  });
});
