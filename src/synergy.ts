// 相性のいいカード（シナジー）判定。
// 各カードの「場に作るもの（供給）」と「何があると強いか（要求）」を突き合わせる。供給には「誰に効くか」
// （自分自身だけ・名指し・タイプ・進化段階・グループ・進化元のHP・エネのタイプ）が付いていて、相手がそれを満たすときだけ結ぶ。
// 例: そうじゅくエキス（草の進化補助）↔ 草の進化ポケモンだけ／コイキング（自分を進化させる）↔ ギャラドスだけ
//     アカギ（ダメージを受けた相手のベンチを呼び出す）↔ ベンチ狙撃・全体攻撃
import type { AppCard, AppData, Selector } from "./types.ts";
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
};

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
    if (sel.preHpMax !== undefined && !receiver.evolvesFrom.some((id) => (byId.get(id)?.hp ?? 999) <= sel.preHpMax!)) return false;
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
  const accelSels = (c: AppCard) => (c.supplies["supply.energy.many"] ?? []).filter((s) => !s.self);

  function partners(x: AppCard, limit = 30): Partner[] {
    const out = new Map<string, Partner>();
    const push = (card: AppCard, score: number, reason: string) => {
      if (card.id === x.id || card.nameEn === x.nameEn) return;
      const p = out.get(card.id) ?? out.set(card.id, { card, score: 0, reasons: [] }).get(card.id)!;
      p.score += score;
      if (!p.reasons.includes(reason)) p.reasons.push(reason);
    };
    // 名前指定
    for (const id of x.refs) {
      const c = byId.get(id);
      if (c) push(c, 3, "効果で名指し");
    }
    for (const c of data.cards) if (c.refs.includes(x.id)) push(c, 3, "このカードを名指し");

    // 供給 → 要求（x が相手を助ける）
    for (const [s, sels] of Object.entries(x.supplies)) {
      for (const y of requirers.get(s) ?? []) if (sels.some((sel) => reaches(sel, x, y, s))) push(y, 1, SUPPLY[s]?.need ?? s);
    }
    // 要求 ← 供給（相手が x を助ける）
    for (const r of Object.keys(x.requires)) {
      for (const y of suppliers.get(r) ?? []) if (y.supplies[r].some((sel) => reaches(sel, y, x, r))) push(y, 1, SUPPLY[r]?.give ?? r);
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
    // 同名の別バージョンは1つにまとめる（スコアの高い方）
    const byName = new Map<string, Partner>();
    for (const p of out.values()) {
      const cur = byName.get(p.card.nameEn);
      if (!cur || p.score > cur.score) byName.set(p.card.nameEn, p);
    }
    return [...byName.values()].sort((a, b) => b.score - a.score || a.card.order - b.card.order).slice(0, limit);
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

  return { partners, evolutionLine };
}
