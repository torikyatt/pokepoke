// 検索の受け入れテスト（SPEC 7）。期待カードは実データから選んだ。
// 事前に npm run build-index で src/data/app-data.json を作っておく（npm test が自動でやる）
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createEngine } from "./engine.ts";
import { createSynergy } from "../synergy.ts";
import { normalize } from "./normalize.ts";
import type { AppData } from "../types.ts";

const data: AppData = JSON.parse(readFileSync(join(import.meta.dirname, "../data/app-data.json"), "utf8"));
const engine = createEngine(data, { partners: createSynergy(data).partners });
const ids = (q: string, n = 50) => engine.search(q).slice(0, n).map((h) => h.card.id);

describe("正規化", () => {
  it("カタカナ・エネルギー・長音・全角をそろえる", () => {
    expect(normalize("エネルギー")).toBe("えね");
    expect(normalize("ＨＰ１００")).toBe("hp100");
    expect(normalize("ピカチュウ")).toBe(normalize("ぴかちゅう"));
    expect(normalize("ゲッコウガ")).toBe("げつこうが");
  });
});

describe("受け入れテスト", () => {
  it("トラッシュの枚数によって効果が変わる系のカード", () => {
    const top = ids("トラッシュの枚数によって効果が変わる系のカード", 10);
    // シャンデラ（サポートの枚数）・ハカドッグ・ヒスイゾロアークex・ロトムex（グッズの枚数）
    for (const id of ["b2-069", "b2a-053", "b3b-060", "b4-055"]) expect(top).toContain(id);
  });

  it("攻撃の必要エネが水1個であとは無色でいいカード", () => {
    const hits = engine.search("攻撃の必要エネが水1個であとは無色でいいカード");
    expect(hits.length).toBeGreaterThan(10);
    for (const h of hits) expect(h.card.attacks.some((a) => a.cost.water === 1 && a.costTyped === 1)).toBe(true);
    expect(hits.map((h) => h.card.id)).toContain("a1-054"); // カメール「スプラッシュ」水＋無色
  });

  it("エネ加速できる炎のカード", () => {
    const all = ids("エネ加速できる炎のカード");
    // ブーバー・リザードンex（エネゾーンから自分へ）、ブースター（ベンチへ）、カキ（サポート）
    for (const id of ["a2-023", "a2b-010", "a3b-008", "a3-150"]) expect(all).toContain(id);
    for (const h of engine.search("エネ加速できる炎のカード")) expect(h.card.type === "fire" || h.card.typeRefs.includes("fire")).toBe(true);
  });

  it("ベンチに攻撃できる雷ポケモン", () => {
    const hits = engine.search("ベンチに攻撃できる雷ポケモン");
    for (const id of ["a1a-026", "a4-070", "a2-060"]) expect(hits.map((h) => h.card.id)).toContain(id);
    for (const h of hits) {
      expect(h.card.type).toBe("lightning");
      expect(h.card.tags).toContain("damage.bench");
    }
  });

  it("にげるエネ0のたね", () => {
    const hits = engine.search("にげるエネ0のたね");
    expect(hits.length).toBeGreaterThan(5);
    for (const h of hits) {
      expect(h.card.stage).toBe("basic");
      expect(h.card.retreat).toBe(0);
    }
    expect(hits.map((h) => h.card.id)).toContain("a3-078"); // アブリー
  });

  it("相手の手札を減らすサポート", () => {
    const top = ids("相手の手札を減らすサポート", 5);
    for (const id of ["a2-155", "a4-158"]) expect(top).toContain(id); // マーズ・シルバー
    for (const h of engine.search("相手の手札を減らすサポート")) expect(h.card.kind).toBe("supporter");
  });

  it("コインで火力が上がるワザ", () => {
    const hits = engine.search("コインで火力が上がるワザ");
    const top = hits.slice(0, 20).map((h) => h.card.id);
    for (const id of ["a1-022", "a1-026", "a1-102"]) expect(top).toContain(id); // ナッシー・カイロス・サンダース
    for (const h of hits.slice(0, 20)) {
      expect(h.card.attacks.some((a) => a.damageVariable && a.tags.some((t) => t.startsWith("coin.")))).toBe(true);
    }
  });

  it("ダメージを受けないようにするワザ", () => {
    const hits = engine.search("ダメージを受けないようにするワザ");
    expect(hits.map((h) => h.card.id).slice(0, 10)).toContain("a1-140"); // ダグトリオ「あなをほる」
    for (const h of hits) expect(h.card.attacks.some((a) => a.tags.includes("defense.no_damage"))).toBe(true);
  });
});

describe("その他の検索", () => {
  it("カード名で引ける", () => {
    expect(ids("ピカチュウex", 5)).toContain("a1-096");
  });
  it("HPやダメージの数値条件", () => {
    for (const h of engine.search("HP150以上の水ポケモン")) {
      expect(h.card.hp).toBeGreaterThanOrEqual(150);
      expect(h.card.type).toBe("water");
    }
    for (const h of engine.search("120ダメ以上のワザ")) expect(h.card.attacks.some((a) => (a.damage ?? 0) >= 120)).toBe(true);
  });
  it("他TCGの言葉（墓地・ハンデス）", () => {
    expect(engine.parse("墓地からエネをつける").some((c) => c.kind === "tag" && c.tag === "energy.accel.trash")).toBe(true);
    expect(engine.parse("ハンデス").some((c) => c.kind === "tag" && c.tag.startsWith("disrupt.hand"))).toBe(true);
  });
  it("何にも当たらない検索文は条件ゼロ", () => {
    expect(engine.parse("あいうえお").filter((c) => c.kind !== "text")).toHaveLength(0);
  });
});

describe("ベビーポケモン", () => {
  it("ベビー・ベイビー・ベイビィ・ベビィのどれでも引ける", () => {
    for (const q of ["ベビー", "ベイビー", "ベイビィ", "ベビィポケモン"]) {
      const hits = engine.search(q);
      expect(hits.length).toBeGreaterThanOrEqual(14);
      for (const h of hits) expect(h.card.groups).toContain("baby");
    }
  });
});

describe.skipIf(!data.meta)("実際の使われ方で探す", () => {
  const top = (q: string, n = 10) => engine.run(engine.parse(q), Infinity).sort((a, b) => b.score - a.score).slice(0, n).map((h) => h.card.id);
  it("「メガルカリオexデッキ」はそのデッキでよく使われるカード", () => {
    const ids = top("メガルカリオexデッキ");
    expect(ids).toContain("b3-081");
    expect(ids).toContain("a2-092");
  });
  it("「ミライドンexと相性がいいカード」はレアコイルが上位", () => {
    expect(top("ミライドンexと相性がいいカード", 3)).toContain("a1-098");
  });
  it("「大会でよく使われるサポート」はサポートだけで、アカギが入る", () => {
    const hits = engine.search("大会でよく使われるサポート", 20);
    expect(hits.every((h) => h.card.kind === "supporter")).toBe(true);
    expect(hits.map((h) => h.card.id)).toContain("a2-150");
  });
});

describe("英語で探す", () => {
  const kinds = (q: string) => engine.parse(q).map((c) => c.kind);
  it("タグ・タイプ・数値を英語の言い方から読む", () => {
    const conds = engine.parse("fire energy acceleration");
    expect(conds.map((c) => c.id)).toEqual(expect.arrayContaining(["type:fire", "tag:energy.accel"]));
    expect(engine.parse("hp 150+ metal pokemon").map((c) => c.id)).toEqual(expect.arrayContaining(["hp:ge150", "type:metal"]));
    expect(engine.parse("basic with free retreat").map((c) => c.id)).toEqual(expect.arrayContaining(["retreat:eq0", "stage:basic"]));
    expect(engine.parse("weak to fighting").map((c) => c.id)).toContain("weakness:fighting");
  });
  it("語尾が変わっても当たる（searches → search）", () => {
    const hits = engine.search("item that searches pokemon");
    expect(hits.map((h) => h.card.nameEn)).toContain("Poké Ball");
    expect(hits.every((h) => h.card.kind === "item")).toBe(true);
  });
  it("英語のカード名（アクセント記号・アポストロフィなし）", () => {
    expect(engine.search("pokedex")[0].card.nameEn).toBe("Pokédex");
    expect(engine.search("professors research")[0].card.nameEn).toBe("Professor's Research");
  });
  it("英語の条件にも日本語と英語の表示名がある", () => {
    for (const c of engine.parse("draw cards")) expect(c.en && c.label).toBeTruthy();
  });
  it("日本語の検索は英語の解析に入らない", () => {
    expect(kinds("エネ加速できる炎のカード")).not.toContain("text");
  });
});

describe.skipIf(!data.meta)("英語で実際の使われ方を探す", () => {
  it("「mega lucario ex deck」「pairs with miraidon ex」「popular supporters」", () => {
    expect(engine.parse("mega lucario ex deck")[0].kind).toBe("deck");
    expect(engine.search("pairs with miraidon ex", 5).map((h) => h.card.id)).toContain("a1-098");
    const hits = engine.search("popular supporters", 20);
    expect(hits.every((h) => h.card.kind === "supporter")).toBe(true);
  });
});

describe("雑なローマ字で日本語を探す", () => {
  const first = (q: string) => engine.search(q, 5)[0]?.card.nameJa;
  it("カード名（漢字はよみで）: hakase・dakurai・monomane", () => {
    expect(first("hakase")).toBe("博士の研究");
    expect(first("dakurai")).toMatch(/^ダークライ/);
    expect(first("monomane")).toBe("モノマネむすめ");
  });
  it("書き方の揺れ: shi/si・chu/tyu・のばす音・小さいっ・区切り", () => {
    expect(first("pikatyu")).toMatch(/^ピカチュウ/);
    expect(first("myuutsuu")).toMatch(/ミュウツー/);
    expect(first("supi-da")).toBe("スピーダー");
    expect(first("monomane musume")).toBe("モノマネむすめ");
  });
  it("表現辞書もローマ字で: kaifuku → HP回復、ene kasoku → エネ加速", () => {
    expect(engine.parse("kaifuku").map((c) => c.id)).toContain("tag:heal.hp");
    expect(engine.parse("ene kasoku").map((c) => c.id)).toContain("tag:energy.accel");
  });
  it("英語の検索はそのまま", () => {
    expect(engine.parse("fire energy acceleration").map((c) => c.id)).toEqual(expect.arrayContaining(["type:fire", "tag:energy.accel"]));
  });
});
