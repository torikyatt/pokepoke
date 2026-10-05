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
  it("自分を進化させる特性（コイキング）の相手は進化ラインに出るので、相性のいいカードには出さない", () => {
    expect(reasonOf("b1-050", /進化ポケモン/)).toHaveLength(0);
    const line = syn.evolutionLine(byId.get("b1-050")!).flatMap((l) => l.cards.map((c) => c.nameEn));
    expect(line).toContain("Gyarados");
  });
  it("進化ポケモンの側から見ても、関係ない進化補助は出ない", () => {
    // ギャラドス（水の1進化）: 草専用のそうじゅくエキスも、2進化専用のふしぎなアメも結ばない。コイキングの特性は結ぶ
    const gyarados = data.cards.find((c) => c.nameEn === "Gyarados" && c.evolvesFrom.includes("b1-050"))!;
    const g = partnersOf(gyarados.id).map((p) => p.card.id);
    expect(g).not.toContain("b1a-067");
    expect(g).not.toContain("a3-144");
    expect(g).not.toContain("b1-050"); // コイキングは進化ラインに出る
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
  it("レアコイル（ボルトチャージ）は場のエネを集めるカード（ミライドンex・マチス）と結び、雷タイプ全般とも結ぶ", () => {
    const top = partnersOf("a1-098").slice(0, 20).map((p) => p.card.nameEn);
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

describe.skipIf(!data.meta)("実際の使われ方（攻略記事・大会データ）", () => {
  it("攻略記事の定番コンボ: レアコイル（ボルトチャージ）の上位に、ミライドンex とシトロン", () => {
    const top = partnersOf("a1-098").slice(0, 3);
    for (const id of ["b3a-019", "b1a-068"]) {
      const p = top.find((x) => x.card.id === id);
      expect(p, id).toBeDefined();
      expect(p!.reasons.some((r) => r.startsWith("定番コンボ"))).toBe(true);
    }
  });
  it("大会で一緒に使われる: メガルカリオex の上位に、ルカリオ（特性）といにしえの闘技場", () => {
    const top = partnersOf("b3-081").slice(0, 6).map((p) => p.card.id);
    expect(top).toContain("a2-092");
    expect(top).toContain("b3-154");
  });
  it("どのデッキにも入る定番（博士の研究）は、大会データだけでは結ばない", () => {
    const research = data.cards.find((c) => c.nameJa === "博士の研究")!;
    expect(reasonOf("b3-081", /大会で一緒に採用/).map((p) => p.card.id)).not.toContain(research.id);
  });
});

describe("対象が決まっている「山札からポケモンを持ってくる」", () => {
  it("ルチアは HP50以下のたねポケモンと結ぶ（それ以外とは結ばない）", () => {
    const ps = reasonOf("b1-226", /山札から/);
    expect(ps.length).toBeGreaterThan(50);
    for (const p of ps) {
      expect(p.card.stage).toBe("basic");
      expect(p.card.hp).toBeLessThanOrEqual(50);
    }
    // ポケモンの側からも、ルチアが相性のいいカードに出る
    expect(reasonOf("b1-196", /山札から/).map((p) => p.card.id)).toContain("b1-226");
  });
  it("セレナはメガシンカexだけ、モンスターボール（何でも持ってくる）は結ばない", () => {
    for (const p of reasonOf("b1a-069", /^山札から(手札に)?持ってこられる$/)) expect(p.card.rule).toBe("mega_ex");
    expect(reasonOf("pa-005", /^山札から(手札に)?持ってこられる$/)).toHaveLength(0);
  });
});

describe("トレーナーズの効く相手（効果文を読んで書いた表）", () => {
  it("エリカ・リーフマントは草ポケモンだけ", () => {
    for (const id of ["a1-219", "a3-147"]) {
      const ps = reasonOf(id, /草ポケモン/);
      expect(ps.length).toBeGreaterThan(50);
      for (const p of ps) expect(p.card.type).toBe("grass");
    }
  });
  it("サイキッカーはワザ「サイコキネシス」を持つポケモンだけ", () => {
    const ps = reasonOf("b4-150", /サイコキネシス/);
    expect(ps.length).toBeGreaterThan(5);
    for (const p of ps) expect(p.card.attacks.some((a) => a.nameEn === "Psychic")).toBe(true);
  });
  it("ヘビーメットはにげる3以上、リーリエは2進化だけ", () => {
    for (const p of reasonOf("b1-219", /にげる3以上/)) expect(p.card.retreat).toBeGreaterThanOrEqual(3);
    for (const p of reasonOf("a3-155", /2進化/)) expect(p.card.stage).toBe("stage2");
  });
  it("ロケット団のボスは、相手のベンチを狙うポケモンと結ぶ", () => {
    const ids = reasonOf("b4a-071", /ベンチ攻撃/).map((p) => p.card.id);
    expect(ids).toContain("b4-061"); // エレザード
    expect(ids).toContain("a4a-020"); // スイクンex（相手のベンチの数で強くなる）
  });
  it("ポケモンの側からも、効くトレーナーズが出る", () => {
    const venusaur = data.cards.find((c) => c.nameEn === "Venusaur" && c.stage === "stage2")!;
    const ids = partnersOf(venusaur.id).map((p) => p.card.id);
    for (const id of ["a1-219", "a3-147", "a3-155"]) expect(ids).toContain(id); // エリカ・リーフマント・リーリエ
  });
});

describe("進化ライン", () => {
  it("別のパックのものも含めて、進化できるカードを全部出す", () => {
    const line = syn.evolutionLine(byId.get("b3-079")!); // リオル
    const names = line.flatMap((l) => l.cards.map((c) => c.id));
    for (const id of ["a2-091", "pa-059", "b3-079", "a2-092", "a2b-043", "b3-080", "b3-081"]) expect(names).toContain(id);
    expect(line.map((l) => l.label)).toEqual(["たね", "1進化"]);
  });
  it("進化ラインのカードは相性のいいカードに出さない", () => {
    for (const id of ["b3-081", "a2-092", "b3a-020", "pb-011"]) {
      const c = byId.get(id)!;
      const lineNames = new Set(syn.evolutionLine(c).flatMap((l) => l.cards.map((x) => x.nameEn)));
      for (const p of partnersOf(id)) expect(lineNames.has(p.card.nameEn)).toBe(false);
    }
  });
});

describe("化石の進化ライン", () => {
  it("かいのカセキ → オムナイト → オムスター（化石の詳細でも、オムナイトの詳細でも）", () => {
    for (const id of ["a1-216", "a1-081"]) {
      const line = syn.evolutionLine(byId.get(id)!);
      expect(line.map((l) => l.cards[0].nameEn)).toEqual(["Helix Fossil", "Omanyte", "Omastar"]);
      expect(line[0].fossil).toBe(true);
    }
  });
});

describe("タイプの名指しを守る", () => {
  it("メガルカリオex（闘）に、水・鋼だけを加速するマナフィ・ディアルガexは出さない", () => {
    const ids = partnersOf("b3-081").map((p) => p.card.id);
    expect(ids).not.toContain("pa-048");
    expect(ids).not.toContain("a2-119");
  });
  it("マナフィの効果から結ぶ相手は水のポケモンだけ", () => {
    for (const p of partnersOf("pa-048")) {
      const rule = p.reasons.every((r) => !/^定番コンボ|^大会で一緒|名指し/.test(r));
      if (rule && p.card.kind === "pokemon" && p.card.type !== "colorless") expect([p.card.type, ...p.card.attacks.flatMap((a) => Object.keys(a.cost))]).toContain("water");
    }
  });
  it("「[R], [W], or [L] Energy」のような並べ書きも全部のタイプとして読む", async () => {
    const { typesBefore } = await import("./card-text.ts");
    expect(typesBefore("Move a [R], [W], or [L] Energy from your Benched Pokémon", "Energy")).toEqual(["fire", "water", "lightning"]);
  });
});
