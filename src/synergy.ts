// 相性のいいカード（シナジー）判定。
// 各カードの「場に作るもの（供給）」と「何があると強いか（要求）」を突き合わせる。供給には「誰に効くか」
// （自分自身だけ・名指し・タイプ・進化段階・グループ・進化元のHP・エネのタイプ）が付いていて、相手がそれを満たすときだけ結ぶ。
// 例: そうじゅくエキス（草の進化補助）↔ 草の進化ポケモンだけ／コイキング（自分を進化させる）↔ ギャラドスだけ
//     アカギ（ダメージを受けた相手のベンチを呼び出す）↔ ベンチ狙撃・全体攻撃
// これに加えて、実際の使われ方からも結ぶ:
//   ・攻略記事で紹介されている定番の組み合わせ（data/combos.yaml）
//   ・大会で勝ち越したデッキに一緒に入っていることが多い組（data/meta/meta.json。どのデッキにも入る定番どうしは除いてある）
import type { AppArchetype, AppCard, AppCombo, AppData, HelpTarget, Selector } from "./types.ts";
import { TYPE_JA } from "./types.ts";

// 供給の種類ごとの説明（相手のカードが「供給する側」「要求する側」のときのラベル）
const SUPPLY: Record<string, { give: string; need: string }> = {
  "supply.trash.energy": { give: "トラッシュにエネを送れる", need: "トラッシュのエネを使う" },
  "supply.trash.fill": { give: "トラッシュを増やせる", need: "トラッシュの枚数で強くなる" },
  "supply.bench.fill": { give: "ベンチを埋められる", need: "ベンチの数で強くなる" },
  "supply.energy.many": { give: "エネを増やせる", need: "付いているエネの数で強くなる" },
  "supply.damage.self": { give: "自分のポケモンにダメージを乗せる", need: "自分のダメージで強くなる" },
  "supply.status": { give: "状態異常にできる", need: "相手が状態異常だと強くなる" },
  "supply.status.poison": { give: "どくにできる", need: "相手がどくだと強くなる" },
  "supply.status.burn": { give: "やけどにできる", need: "相手がやけどだと強くなる" },
  "supply.status.paralysis": { give: "マヒにできる", need: "相手がマヒだと強くなる" },
  "supply.status.sleep": { give: "ねむりにできる", need: "相手がねむりだと強くなる" },
  "supply.status.confusion": { give: "こんらんにできる", need: "相手がこんらんだと強くなる" },
  "supply.retreat.help": { give: "にげる・入れ替えを助ける", need: "にげるエネが重い" },
  "supply.evolve.help": { give: "進化を早められる", need: "進化ポケモン" },
  "supply.opp.bench_damage": { give: "相手のベンチにダメージを与える", need: "ダメージを受けた相手のベンチを狙う" },
  "supply.energy.fix": { give: "エネ事故を減らせる", need: "複数タイプのエネが要る" },
  "supply.energy.bank": { give: "場にエネをためられる", need: "場のエネを集められる" },
  "supply.coin.control": { give: "コインをやり直せる", need: "コインを投げる" },
  "supply.search.pokemon": { give: "山札から手札に持ってこられる", need: "山札から持ってこられる" },
};
// 結びつきの強さ（既定は1）。場にためたエネと集めるカードは、組み合わせ前提の強いシナジー
const WEIGHT: Record<string, number> = { "supply.energy.bank": 2, "supply.energy.fix": 1.5, "supply.trash.energy": 1.5, "supply.search.pokemon": 1.5 };
// 毎ターン使える供給（特性・スタジアム・どうぐ）は、1回きりのワザより少し重く見る
const weightOf = (s: string, sels: Selector[], receiver?: AppCard) =>
  (WEIGHT[s] ?? 1) +
  (sels.some((x) => x.repeat) ? 0.5 : 0) +
  // どのタイプのエネでもトラッシュに送れて、どのタイプでも使える組み合わせ
  (s === "supply.trash.energy" && sels.some((x) => !x.etypes?.length) && receiver && !receiver.requires[s]?.etypes?.length ? 0.5 : 0);

/** 山札からポケモンを持ってくる効果のうち、対象が絞られているもの（モンスターボールのように何でも持ってくるものは結ばない） */
const specificSearch = (sel: Selector) =>
  sel.hpMax !== undefined || !!sel.rules?.length || !!sel.groups?.length || !!sel.ids?.length || !!sel.stages?.includes("stage2");

export interface Partner {
  card: AppCard;
  score: number;
  reasons: string[];
}

export function createSynergy(data: AppData) {
  const byId = new Map(data.cards.map((c) => [c.id, c]));
  const nameOf = (id: string) => byId.get(id)?.nameEn;
  const heavyOf = (c: AppCard) =>
    c.kind === "pokemon" && c.type ? c.attacks.some((a) => a.costTotal >= 3 && (a.cost[c.type!] ?? 0) >= 2) : false;
  // 自分から進化するカード（進化先・その先）
  const descendants = (c: AppCard): Set<string> => {
    const out = new Set<string>();
    const walk = (x: AppCard) => {
      for (const id of x.evolvesTo) {
        if (out.has(id)) continue;
        out.add(id);
        const n = byId.get(id);
        if (n) walk(n);
      }
    };
    walk(c);
    return out;
  };

  /** supplier の供給 s（効く相手 sel）が receiver に届くか */
  function reaches(sel: Selector, supplier: AppCard, receiver: AppCard, s: string): boolean {
    if (receiver.id === supplier.id || receiver.nameEn === supplier.nameEn) return false;
    if (sel.self) return s === "supply.evolve.help" ? descendants(supplier).has(receiver.id) : false;
    if (sel.ids?.length) {
      const names = new Set(sel.ids.map(nameOf));
      if (!sel.ids.includes(receiver.id) && !names.has(receiver.nameEn)) return false;
    }
    if (sel.types?.length && !(receiver.type && sel.types.includes(receiver.type))) return false;
    if (sel.stages?.length && !(receiver.stage && sel.stages.includes(receiver.stage))) return false;
    if (sel.groups?.length && !sel.groups.some((g) => receiver.groups.includes(g))) return false;
    if (sel.kinds?.length && !sel.kinds.includes(receiver.kind === "pokemon" ? "pokemon" : "trainer")) return false;
    if (sel.preHpMax !== undefined && !receiver.evolvesFrom.some((id) => (byId.get(id)?.hp ?? 999) <= sel.preHpMax!)) return false;
    if (sel.hpMax !== undefined && !(receiver.hp !== undefined && receiver.hp <= sel.hpMax)) return false;
    if (sel.rules?.length && !sel.rules.includes(receiver.rule)) return false;
    // 山札からポケモンを持ってくる効果は、対象が絞られているもの（HP50以下のたね・メガシンカex・2進化・ロケット団など）だけ結ぶ
    if (s === "supply.search.pokemon" && !specificSearch(sel)) return false;
    if (sel.etypes?.length) {
      const want = receiver.requires[s]?.etypes;
      if (want?.length && !want.some((t) => sel.etypes!.includes(t))) return false;
    }
    return true;
  }

  // 要求・供給ごとに、それを持つカードの一覧
  const requirers = new Map<string, AppCard[]>();
  const suppliers = new Map<string, AppCard[]>();
  for (const c of data.cards) {
    for (const r of Object.keys(c.requires)) (requirers.get(r) ?? requirers.set(r, []).get(r)!).push(c);
    for (const s of Object.keys(c.supplies)) (suppliers.get(s) ?? suppliers.set(s, []).get(s)!).push(c);
  }
  // そのカードが支えるポケモン（供給が届く相手）。広すぎるもの（何にでも届く）は比べても意味がないので除く
  const receiverCache = new Map<string, Set<string>>();
  function receiversOf(c: AppCard): Set<string> {
    let r = receiverCache.get(c.id);
    if (r) return r;
    r = new Set<string>();
    for (const [s, sels] of Object.entries(c.supplies)) {
      const set = new Set<string>();
      for (const y of requirers.get(s) ?? []) if (sels.some((sel) => reaches(sel, c, y, s))) set.add(y.id);
      if (s === "supply.energy.many") for (const y of data.cards) if (y.kind === "pokemon" && sels.some((sel) => !sel.self && (sel.types?.length || sel.ids?.length) && reaches(sel, c, y, s))) set.add(y.id);
      if (set.size <= 150) for (const id of set) r.add(id);
    }
    receiverCache.set(c.id, r);
    return r;
  }
  const supporters = data.cards.filter((c) => Object.keys(c.supplies).length);

  // トレーナーズが効く相手（data/trainer-synergy.yaml）: トレーナーズ → 相手、相手 → トレーナーズ
  const helpMatch = (t: HelpTarget, c: AppCard): boolean => {
    if (t.kinds?.length ? !t.kinds.includes(c.kind as never) : c.kind !== "pokemon") return false;
    if (t.types?.length && !(c.type && t.types.includes(c.type))) return false;
    if (t.stages?.length && !(c.stage && t.stages.includes(c.stage))) return false;
    if (t.groups?.length && !t.groups.some((g) => c.groups.includes(g))) return false;
    if (t.rules?.length && !t.rules.includes(c.rule)) return false;
    if (t.notRules?.length && t.notRules.includes(c.rule)) return false;
    if (t.retreatMin !== undefined && (c.retreat ?? 0) < t.retreatMin) return false;
    if (t.attacks?.length && !c.attacks.some((a) => a.nameEn && t.attacks!.includes(a.nameEn))) return false;
    if (t.cost && !c.attacks.some((a) => (a.cost[t.cost!.type] ?? 0) >= t.cost!.min)) return false;
    if (t.multiType && !c.attacks.some((a) => Object.keys(a.cost).filter((k) => k !== "colorless").length >= 2)) return false;
    if (t.tags?.length && !c.tags.some((x) => t.tags!.some((g) => x === g || x.startsWith(g + ".")))) return false;
    return true;
  };
  const helpsBy = new Map<string, { other: string; label: string; weight: number }[]>();
  for (const h of data.helps ?? []) {
    for (const c of data.cards) {
      if (c.id === h.card || !helpMatch(h.to, c)) continue;
      (helpsBy.get(h.card) ?? helpsBy.set(h.card, []).get(h.card)!).push({ other: c.id, label: h.label, weight: h.weight });
      (helpsBy.get(c.id) ?? helpsBy.set(c.id, []).get(c.id)!).push({ other: h.card, label: h.label, weight: h.weight });
    }
  }

  // 攻略記事の組み合わせ・大会で一緒に使われる組（カードごと）
  const combosOf = new Map<string, AppCombo[]>();
  for (const cb of data.combos ?? []) for (const id of new Set(cb.cards)) (combosOf.get(id) ?? combosOf.set(id, []).get(id)!).push(cb);
  const coUsed = new Map<string, { other: string; n: number; rate: number }[]>(); // rate: このカードを使うデッキのうち、相手も入っている割合
  for (const [a, b, n, ra, rb] of data.meta?.pairs ?? []) {
    (coUsed.get(a) ?? coUsed.set(a, []).get(a)!).push({ other: b, n, rate: ra });
    (coUsed.get(b) ?? coUsed.set(b, []).get(b)!).push({ other: a, n, rate: rb });
  }
  // カードごとの、よく入っているデッキタイプ
  const archOf = new Map<string, { arch: AppArchetype; rate: number }[]>();
  for (const arch of data.meta?.archetypes ?? []) for (const c of arch.cards) (archOf.get(c.id) ?? archOf.set(c.id, []).get(c.id)!).push({ arch, rate: c.rate });
  for (const l of archOf.values()) l.sort((x, y) => y.rate * y.arch.share - x.rate * x.arch.share);
  /** 2枚とも半分以上のデッキに入っているデッキタイプ（いちばん使われているもの） */
  const sharedArch = (a: string, b: string) =>
    (archOf.get(a) ?? []).filter((x) => x.rate >= 0.5).map((x) => x.arch).find((arch) => arch.cards.some((c) => c.id === b && c.rate >= 0.5));
  const accelSels = (c: AppCard) => (c.supplies["supply.energy.many"] ?? []).filter((s) => !s.self);

  function partners(x: AppCard, limit = 30): Partner[] {
    const out = new Map<string, Partner>();
    const push = (card: AppCard, score: number, reason: string) => {
      if (card.id === x.id || card.nameEn === x.nameEn) return;
      const p = out.get(card.id) ?? out.set(card.id, { card, score: 0, reasons: [] }).get(card.id)!;
      p.score += score;
      if (!p.reasons.includes(reason)) p.reasons.push(reason);
    };
    // 攻略記事で紹介されている組み合わせ（いちばん強く結ぶ）
    for (const cb of combosOf.get(x.id) ?? []) {
      for (const id of cb.cards) {
        const c = byId.get(id);
        if (c) push(c, 4, `定番コンボ（${cb.deck}）`);
      }
    }
    // 大会で一緒に使われる組。相手が入っている割合が高いほど強く結ぶ
    for (const u of coUsed.get(x.id) ?? []) {
      const c = byId.get(u.other);
      if (!c) continue;
      const arch = sharedArch(x.id, c.id);
      push(c, 0.5 + 2.5 * u.rate, arch ? `大会で一緒に採用（${arch.nameJa}）` : `大会で一緒に採用（${Math.round(u.rate * 100)}%）`);
    }

    // トレーナーズの効果が効く相手
    for (const h of helpsBy.get(x.id) ?? []) {
      const c = byId.get(h.other);
      if (c) push(c, h.weight, h.label);
    }

    // 名前指定
    for (const id of x.refs) {
      const c = byId.get(id);
      if (c) push(c, 3, "効果で名指し");
    }
    for (const c of data.cards) if (c.refs.includes(x.id)) push(c, 3, "このカードを名指し");

    // 供給 → 要求（x が相手を助ける）
    for (const [s, sels] of Object.entries(x.supplies)) {
      for (const y of requirers.get(s) ?? []) {
        const ok = sels.filter((sel) => reaches(sel, x, y, s));
        if (ok.length) push(y, weightOf(s, ok, y), SUPPLY[s]?.need ?? s);
      }
    }
    // 要求 ← 供給（相手が x を助ける）
    for (const r of Object.keys(x.requires)) {
      for (const y of suppliers.get(r) ?? []) {
        const ok = y.supplies[r].filter((sel) => reaches(sel, y, x, r));
        if (ok.length) push(y, weightOf(r, ok, x), SUPPLY[r]?.give ?? r);
      }
    }

    // 場にためたエネ（レアコイルのボルトチャージなど）は、同じタイプのポケモンと、無色エネを多く使うワザでも生きる
    const usesType = (c: AppCard, t: string) => c.kind === "pokemon" && c.type === t && c.attacks.some((a) => (a.cost[c.type!] ?? 0) > 0);
    const colorlessHeavy = (c: AppCard) => c.kind === "pokemon" && c.attacks.some((a) => (a.cost.colorless ?? 0) >= 2);
    const bankOf = (c: AppCard) => c.supplies["supply.energy.bank"]?.[0]?.etypes ?? [];
    for (const t of bankOf(x)) {
      for (const c of data.cards) {
        if (usesType(c, t)) push(c, 0.6, `${TYPE_JA[t]}タイプ（ためた${TYPE_JA[t]}エネを使える）`);
        else if (colorlessHeavy(c)) push(c, 0.4, "無色エネを多く使う");
      }
    }
    for (const b of suppliers.get("supply.energy.bank") ?? []) {
      const ts = bankOf(b);
      if (x.type && ts.includes(x.type) && usesType(x, x.type)) push(b, 0.6, `${TYPE_JA[x.type]}エネを場にためられる`);
      else if (colorlessHeavy(x)) push(b, 0.4, "無色コストに回せるエネをためられる");
    }

    // 同じポケモンたちを支える2枚（例: にじいろの洞窟はドラゴンのエネ事故を減らし、ハクリューはドラゴンにエネを送る）
    const rx = receiversOf(x);
    if (rx.size >= 3) {
      for (const y of supporters) {
        if (y.id === x.id) continue;
        const ry = receiversOf(y);
        if (ry.size < 3) continue;
        let n = 0;
        for (const id of rx) if (ry.has(id)) n++;
        if (n >= 3 && n / Math.min(rx.size, ry.size) >= 0.3) push(y, 0.5, "同じポケモンを支える");
      }
    }

    // 特定タイプのエネ加速 ↔ そのタイプの重いワザ（自分にしか付けない加速は除く）
    if (accelSels(x).length) {
      for (const c of data.cards) {
        for (const t of x.accelTypes) {
          if (t !== "colorless" && c.type === t && heavyOf(c) && accelSels(x).some((sel) => reaches(sel, x, c, "supply.energy.many"))) push(c, 2, `${TYPE_JA[t]}エネ加速の受け手`);
        }
      }
    }
    if (x.type && heavyOf(x)) {
      for (const c of suppliers.get("supply.energy.many") ?? []) {
        if (c.accelTypes.includes(x.type) && accelSels(c).some((sel) => reaches(sel, c, x, "supply.energy.many"))) push(c, 2, `${TYPE_JA[x.type]}エネを加速できる`);
      }
    }

    // 同じタイプ・名指しタイプのものを少し優先
    const affinity = new Set([x.type, ...x.typeRefs, ...x.accelTypes].filter(Boolean));
    for (const p of out.values()) if (p.card.type && affinity.has(p.card.type)) p.score += 0.5;
    // 同名でも効果が違えば別のカードなので、まとめずに並べる
    return [...out.values()].sort((a, b) => b.score - a.score || a.card.order - b.card.order).slice(0, limit);
  }

  /** 進化ライン（たね → 1進化 → 2進化）を同名でまとめて返す */
  function evolutionLine(x: AppCard): AppCard[][] {
    const up = (c: AppCard): AppCard[] => c.evolvesFrom.map((id) => byId.get(id)!).filter(Boolean);
    const down = (c: AppCard): AppCard[] => c.evolvesTo.map((id) => byId.get(id)!).filter(Boolean);
    const uniq = (cs: AppCard[]) => [...new Map(cs.map((c) => [c.nameEn, c])).values()];
    const prev1 = uniq(up(x));
    const prev2 = uniq(prev1.flatMap(up));
    const next1 = uniq(down(x));
    const next2 = uniq(next1.flatMap(down));
    return [prev2, prev1, [x], next1, next2].filter((l) => l.length);
  }

  /** カードが出てくる攻略記事の組み合わせ */
  const combos = (x: AppCard) => combosOf.get(x.id) ?? [];
  /** 大会での使われ方: 全体の採用率と、よく入っているデッキタイプ */
  const usage = (x: AppCard) => ({ rate: data.meta?.usage[x.id] ?? 0, archetypes: (archOf.get(x.id) ?? []).filter((a) => a.rate >= 0.25) });

  return { partners, evolutionLine, combos, usage };
}
