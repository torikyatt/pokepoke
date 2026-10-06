// 検索の受け入れテスト（SPEC 7）。期待カードは実データから選んだ。
// 事前に npm run build-index で src/data/app-data.json を作っておく（npm test が自動でやる）
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createEngine, effectsOf } from "./engine.ts";
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

  it("ワザのエネのタイプとポケモンのタイプを別々に指定できる（3エネ以下無色技　水ポケモン）", () => {
    const conds = engine.parse("3エネ以下無色技　水ポケモン").map((c) => c.kind);
    expect(conds).toEqual(expect.arrayContaining(["costTyped", "costTotal", "type"]));
    const hits = engine.run(engine.parse("3エネ以下無色技　水ポケモン"), 500);
    expect(hits.length).toBeGreaterThan(10);
    for (const h of hits) {
      expect(h.card.type).toBe("water");
      expect(h.card.attacks.some((a) => a.costTyped === 0 && a.costTotal <= 3)).toBe(true);
    }
    // 「水技」はワザに水エネが要ること（ポケモンのタイプは「草ポケモン」のほうで絞る）
    const water = engine.run(engine.parse("水技 草ポケモン"), 500);
    for (const h of water) expect(h.card.attacks.some((a) => (a.cost.water ?? 0) > 0)).toBe(true);
  });

  it("相手の〇〇を妨害 → その種類の妨害（サポート・グッズ・どうぐ）", () => {
    const tagsOf = (q: string) => engine.parse(q).flatMap((c) => (c.kind === "tag" ? [c.tag] : []));
    expect(tagsOf("相手のサポートを妨害")).toEqual(["disrupt.lock.supporter"]);
    expect(tagsOf("相手のグッズを妨害")).toEqual(["disrupt.lock.item"]);
    expect(tagsOf("相手の道具を妨害")).toEqual(["disrupt.tool"]);
    expect(tagsOf("サポートを邪魔する")).toEqual(["disrupt.lock.supporter"]);
  });

  it("読めなかった言葉を返す（ほかの言葉で当たっていても）", () => {
    expect(engine.explain("コインでもふもふ").unread.length).toBe(1); // 辞書に無い言葉
    expect(engine.explain("コインでエネ付与").unread).toEqual([]); // 辞書に足した
    expect(engine.explain("相手をねむらせて逃げられなくする").unread).toEqual(["ねむらせ"]);
    expect(engine.explain("コインでエネ加速").unread).toEqual([]);
    expect(engine.explain("トラッシュからグッズを拾ってくる").unread).toEqual([]);
    expect(engine.explain("相手を毒にしたい").unread).toEqual([]);
    // ワザ名・特性名で探しただけなら、読めなかった言葉にしない
    expect(engine.explain("かおりのわな").unread).toEqual([]);
    expect(engine.explain("つるのムチ").unread).toEqual([]);
  });

  it("相手のポケモンを手札に戻す → 手札・山札にもどす（ポケモンを持ってくる・回収 には読まない）", () => {
    const tagsOf = (q: string) => engine.parse(q).flatMap((c) => (c.kind === "tag" ? [c.tag] : []));
    expect(tagsOf("相手のポケモンを手札に戻す")).toEqual(["field.bounce"]);
    expect(tagsOf("ポケモンを手札に加える")).toEqual(["draw.search_pokemon"]);
  });

  it("ワザ名・特性名だけで探すと、そのワザ・特性を持つカード（辞書の言葉に分けない）", () => {
    const has = (q: string, name: string) => engine.search(q, 999).every((h) => [...(h.card.ability ? [h.card.ability] : []), ...h.card.attacks].some((e) => e.nameJa === name || e.nameEn === name));
    expect(engine.search("つるのムチ", 999).length).toBeGreaterThan(3);
    expect(has("つるのムチ", "つるのムチ")).toBe(true);
    expect(has("ハイドロポンプ", "ハイドロポンプ")).toBe(true);
    expect(has("vine whip", "Vine Whip")).toBe(true);
    // 辞書の言葉でもあるもの（タイプ名など）は、これまでどおり
    expect(engine.parse("ほのお").map((c) => c.kind)).toEqual(["type"]);
  });

  it("検索ワードの集計から: 残り無色エネ・〇エネを含む技・アグロ", () => {
    const u = (q: string) => engine.explain(q).unread;
    expect(u("雷１ 残り無色エネ 2進化")).toEqual([]);
    const rest = engine.run(engine.parse("雷エネ１ 残り無色わざ 2進化"), 99);
    expect(rest.length).toBeGreaterThan(0);
    for (const h of rest) expect(h.card.attacks.some((a) => a.cost.lightning === 1 && a.costTyped === 1)).toBe(true);
    // 「無色エネを含む技」は無色エネを1つ以上使うワザ（無色だけ、ではない）
    const inc = engine.run(engine.parse("無色エネを含む技 水ポケモン 2進化"), 99);
    expect(inc.length).toBeGreaterThan(0);
    for (const h of inc) expect(h.card.type === "water" && h.card.attacks.some((a) => (a.cost.colorless ?? 0) > 0)).toBe(true);
    expect(engine.parse("無色エネ 含む技").map((c) => c.id)).toEqual(["costHas:colorless"]);
    // 「アグロ」: 2エネ以下で70ダメージ以上のワザを持つ、たね・1進化の ex
    const aggro = engine.search("アグロ", 999);
    expect(aggro.map((h) => h.card.nameJa)).toContain("エーフィex");
    for (const h of aggro) {
      expect(h.card.rule !== "normal" && (h.card.stage === "basic" || h.card.stage === "stage1")).toBe(true);
      expect(h.card.attacks.some((a) => a.costTotal <= 2 && (a.damage ?? 0) >= 70)).toBe(true);
    }
  });

  it("ベンチから攻撃できる（ゲッコウガ・ダークライex）と、ベンチに攻撃できる（ベンチ狙撃）を分ける", () => {
    const tagsOf = (q: string) => engine.parse(q).flatMap((c) => (c.kind === "tag" ? [c.tag] : []));
    expect(tagsOf("ベンチから攻撃できる")).toEqual(["damage.direct.bench"]);
    expect(tagsOf("ベンチに攻撃")).toEqual(["damage.bench"]);
    const names = engine.search("ベンチからダメージを与えられる特性", 99).map((h) => h.card.nameJa);
    for (const n of ["ゲッコウガ", "ダークライex"]) expect(names).toContain(n);
    expect(names).not.toContain("サンダースex"); // バトル場にいるときだけ
    expect(engine.explain("ベンチからダメージを与えられる特性").unread).toEqual([]);
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
  it("ゆるい言い回し: 語順・助詞・活用・挟まった言葉が違っても、いちばん詳しいタグ1つに読み取る", () => {
    const tags = (q: string) => engine.parse(q).map((c) => ("tag" in c ? c.tag : c.kind));
    expect(tags("グッズをトラッシュから拾ってくる")).toEqual(["draw.recover.item"]);
    expect(tags("ポケモンをトラッシュから手札に戻せるカード")).toEqual(["draw.recover.pokemon"]);
    expect(tags("トラッシュのサポートを再利用したい")).toEqual(["draw.recover.supporter"]);
    expect(tags("デッキのグッズを持ってこれる")).toEqual(["draw.search_trainer.item"]);
    expect(tags("山札からサポートを探してくれる")).toEqual(["draw.search_trainer.supporter"]);
    expect(tags("逃げるためのエネを減らす")).toEqual(["energy.cost_down.retreat"]);
    expect(tags("ダメージを受けなくなる")).toEqual(["defense.no_damage"]);
    expect(tags("気絶させたらポイントが増える")).toEqual(["point.on_ko"]);
    expect(tags("相手のバトルポケモンを入れ替えさせる")).toEqual(["disrupt.switch_opp"]);
    expect(tags("ベンチのポケモンにエネルギーをつける")).toEqual(["energy.accel.other"]);
  });
  it("ゆるい読み取りでも、すでに当たったタグを勝手に狭めたり、種類の絞り込みを消したりしない", () => {
    const tags = (q: string) => engine.parse(q).map((c) => ("tag" in c ? c.tag : c.kind));
    expect(tags("エネ加速できる炎のカード")).toEqual(["energy.accel", "type"]);
    expect(tags("トラッシュからポケモンを回収するサポート")).toEqual(["draw.recover.pokemon", "cardKind"]);
    expect(tags("コインを投げて相手をマヒ")).toContain("status.paralysis");
  });
  it("グッズで探すと、どうぐ（グッズとは別の種類）もグッズの後ろに出る", () => {
    expect(engine.search("山札から グッズ", 99).map((h) => h.card.nameJa)).toContain("旅の行商人"); // どうぐを持ってくる
    const kinds = engine.search("グッズ", 999).map((h) => h.card.kind);
    expect(kinds).toContain("tool");
    expect(kinds.lastIndexOf("item")).toBeLessThan(kinds.indexOf("tool"));
    expect(engine.search("どうぐ", 999).every((h) => h.card.kind === "tool")).toBe(true);
  });
  it("「ワザ」の指定は、どうぐ・グッズを指定したときはその効果を見る", () => {
    expect(ids("ワザの火力を上げるどうぐ").length).toBeGreaterThan(0);
  });
  it("「トラッシュから ポケモン／グッズ」は空白・語順・「の」があっても、何をトラッシュから持ってくるかで探せる", () => {
    const tagOf = (q: string) => engine.parse(q).map((c) => ("tag" in c ? c.tag : c.kind));
    for (const q of ["トラッシュから ポケモン", "トラッシュからポケモン", "ポケモン トラッシュから"]) expect(tagOf(q)).toEqual(["draw.recover.pokemon"]);
    for (const q of ["トラッシュから グッズ", "トラッシュの グッズ", "グッズ トラッシュから"]) expect(tagOf(q)).toEqual(["draw.recover.item"]);
    expect(tagOf("山札から サポート")).toEqual(["draw.search_trainer.supporter"]);
    expect(ids("トラッシュから ポケモン")).toContain("a2a-073"); // カンナギタウンの長老
    expect(ids("トラッシュから グッズ")).toContain("b4a-025"); // ロケット団のヤドン
  });
  it("「トラッシュ」の頭の「と」を助詞として削らない", () => {
    expect(engine.parse("トラッシュから").map((c) => ("term" in c ? c.term : ""))).toEqual(["とらつしゆから"]);
  });
  it("多くのカードに出てくる言葉（相手・使える）は、ほかに条件があれば絞り込みに使わない", () => {
    expect(engine.parse("1エネで使える").map((c) => c.kind)).toEqual(["costTotal"]);
    expect(engine.parse("相手の山札を削る").map((c) => c.kind)).toEqual(["tag"]);
  });
  it("「ノーダメージ」と「ワザのダメージを上げる」を取り違えない", () => {
    expect(engine.parse("ノーダメージ").map((c) => ("tag" in c ? c.tag : c.kind))).toEqual(["defense.no_damage"]);
    expect(engine.parse("ワザのダメージを上げる").map((c) => ("tag" in c ? c.tag : c.kind))).toContain("damage.boost");
  });
  it("例の「トラッシュの枚数で変わる」は、トラッシュの枚数で変わるカードだけ（「変わる」で広いタグに広がらない）", () => {
    expect(ids("トラッシュの枚数で変わる").sort()).toEqual(["b2-069", "b2a-053", "b3b-060", "b4-055"]);
  });
  it("1つの言葉が親子のタグに当たるときは両方使う（相手の手札を減らすサポート）", () => {
    expect(ids("相手の手札を減らすサポート").length).toBeGreaterThanOrEqual(5);
  });
  it("タグになる言葉でも、カードの文にその言葉があれば当てる（2進化 サポート）", () => {
    const hits = engine.search("2進化 サポート");
    expect(hits.length).toBeGreaterThan(0);
    for (const h of hits) {
      expect(h.card.kind).toBe("supporter");
      expect(effectsOf(h.card).some((e) => (e.textJa ?? "").includes("2進化"))).toBe(true);
    }
  });
  it("カードの種類（サポート）は文では当てない", () => {
    expect(engine.search("サポート", 200).every((h) => h.card.kind === "supporter")).toBe(true);
  });
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
  it("1文字のタイプ（p＝超）を読み、psychic をサポート「サイキッカー」と取り違えない", () => {
    const ids_ = (q: string) => engine.parse(q).map((c) => c.id);
    expect(ids_("p energy")).toEqual(ids_("psychic energy"));
    expect(ids_("p energy")).toContain("type:psychic");
    expect(ids_("psychic energy")).not.toContain("name:psychic");
    expect(ids_("psychic type")).toEqual(["type:psychic"]);
    expect(ids_("2p")).toEqual(["cost:psychic2"]);
    expect(ids_("2 psychic attack")).toContain("cost:psychic2");
    expect(ids_("weak to p")).toEqual(["weakness:psychic"]);
    expect(ids_("r type")).toEqual(["type:fire"]);
    expect(ids_("mewtwo p")).not.toContain("name:psychic");
    // 「p」だけは名前を打っている途中かもしれないので広げない
    expect(ids_("p")).toEqual([]);
    expect(ids_("超エネ")).toEqual(["type:psychic"]);
    expect(engine.explain("超エネ").unread).toEqual([]);
  });
  it("ワザの名前で探すと、そのワザを名指ししているトレーナーズも出る（りゅうせいぐん → シャガ）", () => {
    for (const q of ["りゅうせいぐん", "draco meteor"]) {
      const hit = ids(q);
      expect(hit).toEqual(expect.arrayContaining(["a1-185", "pa-064", "pb-083", "b4-151"]));
    }
    expect(ids("サイコキネシス")).toContain("b4-150"); // サイキッカー
  });
  it("カード名で探すと、そのカードを効果文で名指ししているカードも後ろに出る（イワーク → タケシ）", () => {
    const top = engine.search("イワーク").map((h) => h.card);
    expect(top.at(-1)!.nameJa).toBe("タケシ");
    expect(top.slice(0, -1).every((c) => c.nameJa === "イワーク")).toBe(true);
    expect(engine.search("onix").map((h) => h.card.nameJa)).toContain("タケシ");
    expect(engine.search("アルセウスex").map((h) => h.card.nameJa)).toContain("マスキッパ");
    expect(engine.search("ガブリアス").map((h) => h.card.nameJa)).toContain("シロナ");
  });
  it("psychic だけなら、サイキッカーを先頭に超タイプのカードを出す", () => {
    const hits = engine.search("psychic", Infinity);
    expect(hits[0].card.id).toBe("b4-150");
    expect(hits.length).toBeGreaterThan(100);
    expect(hits.slice(1).every((h) => h.card.type === "psychic" || h.card.typeRefs.includes("psychic"))).toBe(true);
  });
  it("英語の検索はそのまま", () => {
    expect(engine.parse("fire energy acceleration").map((c) => c.id)).toEqual(expect.arrayContaining(["type:fire", "tag:energy.accel"]));
  });
});
