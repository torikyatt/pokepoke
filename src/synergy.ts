// 相性のいいカード（シナジー）判定。
// 各カードの「場に作るもの（供給）」と「何があると強いか（要求）」を突き合わせる。供給には「誰に効くか」
// （自分自身だけ・名指し・タイプ・進化段階・グループ・進化元のHP・エネのタイプ）が付いていて、相手がそれを満たすときだけ結ぶ。
// 例: そうじゅくエキス（草の進化補助）↔ 草の進化ポケモンだけ／コイキング（自分を進化させる）↔ ギャラドスだけ
//     アカギ（ダメージを受けた相手のベンチを呼び出す）↔ ベンチ狙撃・全体攻撃
// これに加えて、実際の使われ方からも結ぶ:
//   ・攻略記事で紹介されている定番の組み合わせ（data/combos.yaml）
//   ・大会で勝ち越したデッキに一緒に入っていることが多い組（data/meta/meta.json。どのデッキにも入る定番どうしは除いてある）
import type { AppArchetype, AppCard, AppCombo, AppData, EnergyType, HelpTarget, Selector } from "./types.ts";
import { STAGE_JA, TYPE_EN, TYPE_JA } from "./types.ts";
import { namedTypes } from "./card-text.ts";

// 供給の種類ごとの説明（相手のカードが「供給する側」「要求する側」のときのラベル）
const SUPPLY: Record<string, { give: string; need: string; giveEn: string; needEn: string }> = {
  "supply.trash.energy": { give: "トラッシュにエネを送れる", need: "トラッシュのエネを使う", giveEn: "Can send Energy to the discard pile", needEn: "Uses Energy in the discard pile" },
  "supply.trash.fill": { give: "トラッシュを増やせる", need: "トラッシュの枚数で強くなる", giveEn: "Can fill the discard pile", needEn: "Stronger with more cards in the discard pile" },
  "supply.bench.fill": { give: "ベンチを埋められる", need: "ベンチの数で強くなる", giveEn: "Can fill the Bench", needEn: "Stronger with more Benched Pokémon" },
  "supply.energy.many": { give: "エネを増やせる", need: "付いているエネの数で強くなる", giveEn: "Can add Energy", needEn: "Stronger with more Energy attached" },
  "supply.damage.self": { give: "自分のポケモンにダメージを乗せる", need: "自分のダメージで強くなる", giveEn: "Puts damage on your own Pokémon", needEn: "Stronger when damaged" },
  "supply.status": { give: "状態異常にできる", need: "相手が状態異常だと強くなる", giveEn: "Inflicts Special Conditions", needEn: "Stronger vs. Special Conditions" },
  "supply.status.poison": { give: "どくにできる", need: "相手がどくだと強くなる", giveEn: "Can Poison", needEn: "Stronger vs. Poisoned" },
  "supply.status.burn": { give: "やけどにできる", need: "相手がやけどだと強くなる", giveEn: "Can Burn", needEn: "Stronger vs. Burned" },
  "supply.status.paralysis": { give: "マヒにできる", need: "相手がマヒだと強くなる", giveEn: "Can Paralyze", needEn: "Stronger vs. Paralyzed" },
  "supply.status.sleep": { give: "ねむりにできる", need: "相手がねむりだと強くなる", giveEn: "Can put to Sleep", needEn: "Stronger vs. Asleep" },
  "supply.status.confusion": { give: "こんらんにできる", need: "相手がこんらんだと強くなる", giveEn: "Can Confuse", needEn: "Stronger vs. Confused" },
  "supply.retreat.help": { give: "にげる・入れ替えを助ける", need: "にげるエネが重い", giveEn: "Helps retreat / switch", needEn: "Heavy Retreat Cost" },
  "supply.evolve.help": { give: "進化を早められる", need: "進化ポケモン", giveEn: "Speeds up evolution", needEn: "Evolution Pokémon" },
  "supply.opp.bench_damage": { give: "相手のベンチにダメージを与える", need: "ダメージを受けた相手のベンチを狙う", giveEn: "Damages the opponent's Bench", needEn: "Targets damaged Benched Pokémon" },
  "supply.energy.fix": { give: "エネ事故を減らせる", need: "複数タイプのエネが要る", giveEn: "Reduces Energy misses", needEn: "Needs multiple Energy types" },
  "supply.energy.bank": { give: "場にエネをためられる", need: "場のエネを集められる", giveEn: "Stores Energy on the field", needEn: "Gathers Energy from the field" },
  "supply.coin.control": { give: "コインをやり直せる", need: "コインを投げる", giveEn: "Can redo coin flips", needEn: "Flips coins" },
  "supply.opp.stuck": { give: "相手をバトル場から逃げられなくする", need: "逃げられない相手に効く", giveEn: "Stops the opponent from retreating", needEn: "Works on an opponent that can't retreat" },
  "supply.search.pokemon": { give: "山札から手札に持ってこられる", need: "山札から持ってこられる", giveEn: "Fetches it from the deck", needEn: "Can be fetched from the deck" },
};
// 結びつきの強さ（既定は1）。場にためたエネと集めるカードは、組み合わせ前提の強いシナジー
const WEIGHT: Record<string, number> = { "supply.opp.stuck": 1.5, "supply.energy.bank": 2, "supply.energy.fix": 1.5, "supply.trash.energy": 1.5, "supply.search.pokemon": 1.5 };
// 毎ターン使える供給（特性・スタジアム・どうぐ）は、1回きりのワザより少し重く見る
const weightOf = (s: string, sels: Selector[], receiver?: AppCard, supplier?: AppCard) =>
  (WEIGHT[s] ?? 1) +
  // 状態異常の数で強くなるカードには、重ねられる どく・やけど にできるカードを先に
  (s === "supply.status" && receiver?.tags.includes("cond.status.count") && supplier && (supplier.supplies["supply.status.poison"] || supplier.supplies["supply.status.burn"]) ? 0.8 : 0) +
  (sels.some((x) => x.repeat) ? 0.5 : 0) +
  // どのタイプのエネでもトラッシュに送れて、どのタイプでも使える組み合わせ
  (s === "supply.trash.energy" && sels.some((x) => !x.etypes?.length) && receiver && !receiver.requires[s]?.etypes?.length ? 0.5 : 0);

/**
 * エネの基本ルール: 要求が無色なら、どのタイプのエネでも払える。要求が特定のタイプなら、そのタイプのエネでしか払えない
 * （無色エネや、タイプの分からないエネでは代われない）
 */
export const canPay = (supplied: readonly EnergyType[] | undefined, need: EnergyType) => need === "colorless" || !!supplied?.includes(need);

// 状態異常（5種類だけ）。どく・やけどは重なる、ねむり・マヒ・こんらんは互いに上書きする
const STATUS_KINDS = ["poison", "burn", "sleep", "paralysis", "confusion"] as const;
type StatusKind = (typeof STATUS_KINDS)[number];
const STACKING = new Set<StatusKind>(["poison", "burn"]);
const STATUS_JA: Record<StatusKind, string> = { poison: "どく", burn: "やけど", sleep: "ねむり", paralysis: "マヒ", confusion: "こんらん" };
const STATUS_EN: Record<StatusKind, string> = { poison: "Poison", burn: "Burn", sleep: "Sleep", paralysis: "Paralysis", confusion: "Confusion" };
const statusKinds = (c: AppCard): StatusKind[] => STATUS_KINDS.filter((k) => c.supplies[`supply.status.${k}`]);
/** 重ねてかけられる組（別の種類で、片方が どく・やけど）。無ければ undefined */
function stackPair(a: StatusKind[], b: StatusKind[]): [StatusKind, StatusKind] | undefined {
  let best: [StatusKind, StatusKind] | undefined;
  for (const p of a)
    for (const q of b) {
      if (p === q || (!STACKING.has(p) && !STACKING.has(q))) continue;
      const pair = STATUS_KINDS.indexOf(p) < STATUS_KINDS.indexOf(q) ? ([p, q] as [StatusKind, StatusKind]) : ([q, p] as [StatusKind, StatusKind]);
      if (pair[0] === "poison" && pair[1] === "burn") return pair; // いちばん強い組
      best ??= pair;
    }
  return best;
}

/** 足止め（にげる封じ）とエネ破壊・入れ替えの組は、どのデッキにも入るトレーナーズ（ナツメ・アカギなど）を先に、ポケモンは控えめに */
const stuckFactor = (s: string, partner: AppCard) => (s === "supply.opp.stuck" && partner.kind === "pokemon" ? 0.55 : 1);

/** 山札からポケモンを持ってくる効果のうち、対象が絞られているもの（モンスターボールのように何でも持ってくるものは結ばない） */
const specificSearch = (sel: Selector) =>
  sel.hpMax !== undefined || !!sel.rules?.length || !!sel.groups?.length || !!sel.ids?.length || !!sel.stages?.includes("stage2");

export interface Partner {
  card: AppCard;
  score: number;
  reasons: string[];
  reasonsEn: string[]; // reasons と同じ並びの英語
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

  /** ワザのコストに出てくるタイプ（無色以外） */
  const costTypeCache = new Map<string, EnergyType[]>();
  const costTypes = (c: AppCard): EnergyType[] => {
    let r = costTypeCache.get(c.id);
    if (!r) {
      r = [...new Set(c.attacks.flatMap((a) => (Object.keys(a.cost) as EnergyType[]).filter((t) => t !== "colorless" && (a.cost[t] ?? 0) > 0)))];
      costTypeCache.set(c.id, r);
    }
    return r;
  };

  // タイプの食い違い: 片方の効果文がタイプを名指ししている（「[W] Energy を付ける」「[N] Pokémon に」など）のに、
  // もう片方のタイプにもワザのコストにもそのタイプが無ければ、効果の上では結ばない（無色のポケモンはどのタイプでも使える）
  const namedCache = new Map<string, EnergyType[]>();
  const named = (c: AppCard) => namedCache.get(c.id) ?? namedCache.set(c.id, namedTypes(c)).get(c.id)!;
  const ownTypes = (c: AppCard): EnergyType[] | undefined =>
    c.kind !== "pokemon" || !c.type || c.type === "colorless" ? undefined : [c.type, ...costTypes(c)];
  // 「場に〇〇がいるときにしか使えない」カード（スイレン・ネズなど）は、名指しの相手以外とは効果から結ばない
  const onlyWith = (a: AppCard, b: AppCard) =>
    a.tags.includes("cond.bench.specific") && a.tags.includes("drawback.condition") && a.refs.length > 0 && !a.refs.some((id) => id === b.id || byId.get(id)?.nameEn === b.nameEn);
  // 場にエネを出すカードが出すエネのタイプ
  const suppliedTypes = (c: AppCard) => [...new Set(["supply.energy.many", "supply.energy.bank"].flatMap((k) => (c.supplies[k] ?? []).flatMap((x) => x.etypes ?? [])))];
  /**
   * ポケモンどうしのワザのエネの色の合い方（効果から読んだ相性に掛ける）。
   *   要るタイプが1つでも同じ・どちらかが無色だけで使える → 1
   *   重ならず、合わせて2色 → 0.5、合わせて3色以上（フライゴンex 草闘 ＋ 雷のストリンダーex など）→ 0.3
   */
  const energyFit = (a: AppCard, b: AppCard) => {
    if (a.kind !== "pokemon" || b.kind !== "pokemon") return 1;
    const ta = costTypes(a), tb = costTypes(b);
    if (!ta.length || !tb.length || ta.some((t) => tb.includes(t))) return 1;
    return new Set([...ta, ...tb]).size >= 3 ? 0.3 : 0.5;
  };
  const typeFits = (x: AppCard, y: AppCard) => {
    for (const [a, b] of [[x, y], [y, x]] as const) {
      const n = named(a);
      const own = ownTypes(b);
      if (!n.length || !own || own.some((t) => n.includes(t))) continue;
      // 名指しが無色なら、どのタイプのエネを出すカードでも払える（逆に、タイプ指定は無色エネでは払えない）
      if (n.includes("colorless") && suppliedTypes(b).some((t) => t !== "colorless")) continue;
      return false;
    }
    return true;
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
    // エネのタイプの照合は canPay（無色の要求は他のタイプで代われる／タイプ指定の要求は無色では代われない）
    //   受け手がタイプを指定している（メガルカリオex「extra [F] Energy」、フレイムパッチ「[R] Energy」）→ その要求を払えるか
    //   指定が無いエネ加速 → 受け手のワザのコストのタイプを払えるか（無色だけのワザなら、どのタイプのエネでもよい）
    const want = receiver.requires[s]?.etypes;
    if (want?.length) {
      if (!want.some((w) => canPay(sel.etypes, w))) return false;
    } else if (s === "supply.energy.many" && sel.etypes?.length) {
      const typed = costTypes(receiver);
      if (typed.length && !typed.some((t) => canPay(sel.etypes, t))) return false;
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
  const helpsBy = new Map<string, { other: string; label: string; labelEn: string; weight: number }[]>();
  for (const h of data.helps ?? []) {
    for (const c of data.cards) {
      if (c.id === h.card || !helpMatch(h.to, c)) continue;
      (helpsBy.get(h.card) ?? helpsBy.set(h.card, []).get(h.card)!).push({ other: c.id, label: h.label, labelEn: h.labelEn, weight: h.weight });
      (helpsBy.get(c.id) ?? helpsBy.set(c.id, []).get(c.id)!).push({ other: h.card, label: h.label, labelEn: h.labelEn, weight: h.weight });
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
  /** 大会で一緒に入る割合（画面に出す % の数字）がこれ以下の組は、相性の良いカードに出さない */
  const CO_USE_MIN_PCT = 15;
  // 大会で一緒に使われる組の強さ。一緒に入る割合の2乗にして、割合が下がるほど急に弱くする
  //   （100% → 3.5、80% → 2.2、60% → 1.3、40% → 0.56、20% → 0.14）。
  //   どのデッキにも入る定番（モノマネむすめ・アカギ・ナツメ・スピーダーなど）は少し下げる
  const coUseScore = (id: string, rate: number) => {
    const global = data.meta?.usage[id] ?? 0;
    return 3.5 * rate * rate * (global >= 0.6 ? 0.55 : global >= 0.25 ? 0.7 : 1);
  };
  // 状態異常にできるカード
  const statusSuppliers = data.cards.filter((c) => STATUS_KINDS.some((k) => c.supplies[`supply.status.${k}`]));
  const accelSels = (c: AppCard) => (c.supplies["supply.energy.many"] ?? []).filter((s) => !s.self);

  function partners(x: AppCard, limit = 30): Partner[] {
    const out = new Map<string, Partner>();
    // 進化ラインのカード（進化元・進化先・同じ名前）は「進化ライン」に出すので、相性のいいカードには出さない
    const line = x.kind === "pokemon" || x.kind === "fossil" ? lineNames(x) : new Set([x.nameEn]);
    const push = (card: AppCard, score: number, reason: string, reasonEn: string) => {
      if (card.id === x.id || line.has(card.nameEn)) return;
      const p = out.get(card.id) ?? out.set(card.id, { card, score: 0, reasons: [], reasonsEn: [] }).get(card.id)!;
      p.score += score;
      // 「定番コンボ（…）」は記事ごとに出さず、1つだけ
      const dupCombo = reason.startsWith("定番コンボ") && p.reasons.some((r) => r.startsWith("定番コンボ"));
      if (!dupCombo && !p.reasons.includes(reason)) {
        p.reasons.push(reason);
        p.reasonsEn.push(reasonEn);
      }
    };
    // 効果から読んだ結びつき（供給と要求・場にためたエネ・エネ加速など）は、タイプが食い違えば結ばない。
    // ポケモンどうしは、ワザに要るエネの色も見る（同じデッキに入れるとエネが混ざる）
    const pushRule = (card: AppCard, score: number, reason: string, reasonEn: string) => {
      if (typeFits(x, card) && !onlyWith(x, card) && !onlyWith(card, x)) push(card, score * energyFit(x, card), reason, reasonEn);
    };
    // 攻略記事で紹介されている組み合わせ（いちばん強く結ぶ）
    // 同じ組を複数の記事が紹介していても、2つ目からは少しだけ足す（記事の数だけで順位が決まらないように）
    const comboSeen = new Set<string>();
    for (const cb of combosOf.get(x.id) ?? []) {
      for (const id of cb.cards) {
        const c = byId.get(id);
        if (!c) continue;
        push(c, comboSeen.has(id) ? 1 : 4, `定番コンボ（${cb.deck}）`, `Known combo (${cb.deckEn})`);
        comboSeen.add(id);
      }
    }
    // 大会で一緒に使われる組。相手が入っている割合が高いほど強く結ぶ。
    // 一緒に入る割合が 15% 以下なら相性とはみなさない（同じデッキタイプの中心どうしは除く）
    for (const u of coUsed.get(x.id) ?? []) {
      const c = byId.get(u.other);
      if (!c) continue;
      const arch = sharedArch(x.id, c.id);
      if (!arch && Math.round(u.rate * 100) <= CO_USE_MIN_PCT) continue;
      push(
        c,
        coUseScore(c.id, u.rate),
        arch ? `大会で一緒に採用（${arch.nameJa}）` : `大会で一緒に採用（${Math.round(u.rate * 100)}%）`,
        arch ? `Played together in tournaments (${arch.nameEn})` : `Played together in tournaments (${Math.round(u.rate * 100)}%)`,
      );
    }

    // トレーナーズの効果が効く相手
    for (const h of helpsBy.get(x.id) ?? []) {
      const c = byId.get(h.other);
      if (c) push(c, h.weight, h.label, h.labelEn);
    }

    // 名前指定
    for (const id of x.refs) {
      const c = byId.get(id);
      if (c) push(c, 3, "効果で名指し", "Named in its effect");
    }
    for (const c of data.cards) if (c.refs.includes(x.id)) push(c, 3, "このカードを名指し", "Names this card");

    // 供給 → 要求（x が相手を助ける）
    for (const [s, sels] of Object.entries(x.supplies)) {
      for (const y of requirers.get(s) ?? []) {
        const ok = sels.filter((sel) => reaches(sel, x, y, s));
        if (ok.length) pushRule(y, weightOf(s, ok, y, x) * stuckFactor(s, y), SUPPLY[s]?.need ?? s, SUPPLY[s]?.needEn ?? s);
      }
    }
    // 要求 ← 供給（相手が x を助ける）
    for (const r of Object.keys(x.requires)) {
      for (const y of suppliers.get(r) ?? []) {
        const ok = y.supplies[r].filter((sel) => reaches(sel, y, x, r));
        if (ok.length) pushRule(y, weightOf(r, ok, x, y) * stuckFactor(r, y), SUPPLY[r]?.give ?? r, SUPPLY[r]?.giveEn ?? r);
      }
    }

    // 場にためたエネ（レアコイルのボルトチャージなど）は、同じタイプのポケモンと、無色エネを多く使うワザでも生きる
    const usesType = (c: AppCard, t: string) => c.kind === "pokemon" && c.type === t && c.attacks.some((a) => (a.cost[c.type!] ?? 0) > 0);
    // 無色エネを多く使うワザに回せるのは、タイプが無色のポケモンだけと見る（他のタイプは自分のタイプのエネが要る）
    const colorlessHeavy = (c: AppCard) => c.kind === "pokemon" && c.type === "colorless" && c.attacks.some((a) => (a.cost.colorless ?? 0) >= 2);
    const bankOf = (c: AppCard) => c.supplies["supply.energy.bank"]?.[0]?.etypes ?? [];
    for (const t of bankOf(x)) {
      for (const c of data.cards) {
        if (usesType(c, t)) pushRule(c, 0.6, `${TYPE_JA[t]}タイプ（ためた${TYPE_JA[t]}エネを使える）`, `${TYPE_EN[t]} type (uses the stored ${TYPE_EN[t]} Energy)`);
        else if (colorlessHeavy(c)) pushRule(c, 0.4, "無色エネを多く使う", "Uses lots of Colorless Energy");
      }
    }
    for (const b of suppliers.get("supply.energy.bank") ?? []) {
      const ts = bankOf(b);
      if (x.type && ts.includes(x.type) && usesType(x, x.type)) pushRule(b, 0.6, `${TYPE_JA[x.type]}エネを場にためられる`, `Stores ${TYPE_EN[x.type]} Energy on the field`);
      else if (colorlessHeavy(x)) pushRule(b, 0.4, "無色コストに回せるエネをためられる", "Stores Energy usable for Colorless costs");
    }

    // 状態異常の重ねがけ: どく・やけどは重なり、ねむり・マヒ・こんらんは上書きされる（同時に最大3つ）。
    // 重なる組（どく＋やけど、どく・やけど＋ねむり・マヒ・こんらんのどれか）を結ぶ。上書きされる組は結ばない
    const sx = statusKinds(x);
    if (sx.length) {
      for (const y of statusSuppliers) {
        if (y.id === x.id) continue;
        const pair = stackPair(sx, statusKinds(y));
        if (!pair) continue;
        // ポケモンどうしは同じタイプのときだけ（同じデッキに入りやすい組）
        if (x.kind === "pokemon" && y.kind === "pokemon" && x.type !== y.type && x.type !== "colorless" && y.type !== "colorless") continue;
        const strong = pair.includes("poison") && pair.includes("burn");
        pushRule(
          y,
          strong ? 0.8 : 0.5,
          `${STATUS_JA[pair[0]]}と${STATUS_JA[pair[1]]}は重ねてかけられる`,
          `${STATUS_EN[pair[0]]} and ${STATUS_EN[pair[1]]} stack`,
        );
      }
    }

    // 相性のいい相手が多く重なる2枚（例: にじいろの洞窟もハクリューも、ドラゴンポケモンと相性がいい）。
    // 理由には、重なる相手が何か（多くが同じタイプ・同じ進化段階ならそれ、そうでなければ名前を2つまで。ポケモンを先に）を書く
    const commonGroup = (ids: string[]): [string, string] => {
      const cs = ids.map((id) => byId.get(id)!).filter(Boolean);
      const most = <K extends string>(key: (c: AppCard) => K | undefined) => {
        const n = new Map<K, number>();
        for (const c of cs) {
          const k = key(c);
          if (k) n.set(k, (n.get(k) ?? 0) + 1);
        }
        const top = [...n].sort((a, b) => b[1] - a[1])[0];
        return top && top[1] >= cs.length * 0.7 ? top[0] : undefined;
      };
      const t = most((c) => (c.type && c.type !== "colorless" ? c.type : undefined));
      if (t) return [`${TYPE_JA[t]}ポケモン`, `${TYPE_EN[t]} Pokémon`];
      const st = most((c) => (c.stage && c.stage !== "basic" ? c.stage : undefined));
      if (st) return [`${STAGE_JA[st]}ポケモン`, `${st === "stage1" ? "Stage 1" : "Stage 2"} Pokémon`];
      const names = [...new Map([...cs].sort((a, b) => (a.kind === "pokemon" ? 0 : 1) - (b.kind === "pokemon" ? 0 : 1)).map((c) => [c.nameEn, c])).values()].slice(0, 2);
      const more = new Set(cs.map((c) => c.nameEn)).size > 2;
      return [names.map((c) => c.nameJa).join("・") + (more ? "など" : ""), names.map((c) => c.nameEn).join(", ") + (more ? ", etc." : "")];
    };
    const rx = receiversOf(x);
    if (rx.size >= 3) {
      for (const y of supporters) {
        if (y.id === x.id) continue;
        const ry = receiversOf(y);
        if (ry.size < 3) continue;
        const both = [...rx].filter((id) => ry.has(id));
        if (both.length >= 3 && both.length / Math.min(rx.size, ry.size) >= 0.3) {
          const [ja, en] = commonGroup(both);
          pushRule(y, 0.5, `どちらも${ja}と相性がいい`, `Both pair well with ${en}`);
        }
      }
    }

    // 特定タイプのエネ加速 ↔ そのタイプの重いワザ（自分にしか付けない加速は除く）
    if (accelSels(x).length) {
      for (const c of data.cards) {
        for (const t of x.accelTypes) {
          if (t !== "colorless" && c.type === t && heavyOf(c) && accelSels(x).some((sel) => reaches(sel, x, c, "supply.energy.many"))) pushRule(c, 2, `${TYPE_JA[t]}エネ加速の受け手`, `Receives ${TYPE_EN[t]} Energy acceleration`);
        }
      }
    }
    if (x.type && heavyOf(x)) {
      for (const c of suppliers.get("supply.energy.many") ?? []) {
        if (c.accelTypes.includes(x.type) && accelSels(c).some((sel) => reaches(sel, c, x, "supply.energy.many"))) pushRule(c, 2, `${TYPE_JA[x.type]}エネを加速できる`, `Accelerates ${TYPE_EN[x.type]} Energy`);
      }
    }

    // 同じタイプ・名指しタイプのものを少し優先
    const affinity = new Set([x.type, ...x.typeRefs, ...x.accelTypes].filter(Boolean));
    for (const p of out.values()) if (p.card.type && affinity.has(p.card.type)) p.score += 0.5;
    // 同名でも効果が違えば別のカードなので、まとめずに並べる
    return [...out.values()].sort((a, b) => b.score - a.score || a.card.order - b.card.order).slice(0, limit);
  }

  /**
   * 進化ライン: 進化元（たね・1進化）→ このカードと同じ名前のカード → 進化先（1進化・2進化）を、段ごとに全部返す。
   * 進化は名前でつながるので、別のパックのカードも含める（例: リオル3種 → ルカリオ・ルカリオex・メガルカリオex）
   */
  /** ポケモンの種類（ex・メガシンカ・X/Y・リージョンフォームの違いを除いた名前） */
  const species = (nameEn: string) =>
    nameEn
      .replace(/^Mega /, "")
      .replace(/^(Alolan|Galarian|Hisuian|Paldean) /, "")
      .replace(/ ex$/, "")
      .replace(/ [XY]$/, "");
  function evolutionLine(x: AppCard): { label: string; stage?: AppCard["stage"]; fossil?: true; cards: AppCard[] }[] {
    const sorted = (ids: Iterable<string>) =>
      [...new Set(ids)].map((id) => byId.get(id)!).filter(Boolean).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id, "en", { numeric: true }));
    // 同じ段には、同じポケモンの ex・メガシンカex・リージョンフォームも並べる（ルカリオ と メガルカリオex、リザードン と リザードンex）
    const sp = species(x.nameEn);
    const same = data.cards.filter((c) => c.kind === x.kind && c.stage === x.stage && (c.nameEn === x.nameEn || species(c.nameEn) === sp)).map((c) => c.id);
    const prev1 = sorted(same.flatMap((id) => byId.get(id)!.evolvesFrom));
    const prev2 = sorted(prev1.flatMap((c) => c.evolvesFrom));
    const next1 = sorted(same.flatMap((id) => byId.get(id)!.evolvesTo));
    const next2 = sorted(next1.flatMap((c) => c.evolvesTo));
    // 化石（かせき）は、たねポケモンの代わりに進化のはじまりになる
    const label = (cs: AppCard[]) => (cs[0]?.stage ? STAGE_JA[cs[0].stage] : cs[0]?.kind === "fossil" ? "化石" : "");
    const self = sorted(same);
    return [prev2, prev1, self, next1, next2].filter((l) => l.length).map((cards) => ({ label: label(cards), stage: cards[0]?.stage, ...(cards[0]?.kind === "fossil" ? { fossil: true as const } : {}), cards }));
  }

  /** 進化ラインにいるカードの名前（相性のいいカードからは除く） */
  const lineCache = new Map<string, Set<string>>();
  function lineNames(x: AppCard): Set<string> {
    let r = lineCache.get(x.nameEn);
    if (!r) {
      r = new Set([x.nameEn]);
      const walk = (c: AppCard, dir: "evolvesFrom" | "evolvesTo", seen = new Set<string>()) => {
        for (const id of c[dir]) {
          if (seen.has(id)) continue;
          seen.add(id);
          const n = byId.get(id);
          if (!n) continue;
          r!.add(n.nameEn);
          walk(n, dir, seen);
        }
      };
      for (const c of data.cards) if (c.nameEn === x.nameEn) {
        walk(c, "evolvesFrom");
        walk(c, "evolvesTo");
      }
      lineCache.set(x.nameEn, r);
    }
    return r;
  }

  /** カードが出てくる攻略記事の組み合わせ */
  const combos = (x: AppCard) => combosOf.get(x.id) ?? [];
  /** 大会での使われ方: 全体の採用率と、よく入っているデッキタイプ */
  const usage = (x: AppCard) => ({ rate: data.meta?.usage[x.id] ?? 0, archetypes: (archOf.get(x.id) ?? []).filter((a) => a.rate >= 0.25) });

  return { partners, evolutionLine, combos, usage };
}
