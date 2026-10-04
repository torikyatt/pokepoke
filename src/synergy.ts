// 相性のいいカード（シナジー）判定。taxonomy の supplies / requires を突き合わせ、
// 名前指定・タイプ別エネ加速・にげる補助・進化補助を足す（SPEC 5.2、叩き台「シナジーの供給と要求」）
import type { AppCard, AppData, AppTag } from "./types.ts";
import { TYPE_JA } from "./types.ts";

// 供給の種類ごとの説明（相手のカードが「供給する側」「要求する側」のときのラベル）
const SUPPLY: Record<string, { give: string; need: string }> = {
  "supply.trash.energy": { give: "トラッシュにエネを送れる", need: "トラッシュのエネを使う" },
  "supply.trash.fill": { give: "トラッシュを増やせる", need: "トラッシュの枚数で強くなる" },
  "supply.bench.fill": { give: "ベンチを埋められる", need: "ベンチの数で強くなる" },
  "supply.energy.many": { give: "エネを増やせる", need: "付いているエネの数で強くなる" },
  "supply.damage.self": { give: "自分にダメージを乗せる", need: "自分のダメージで強くなる" },
  "supply.status": { give: "状態異常にできる", need: "相手が状態異常だと強くなる" },
  "supply.retreat.help": { give: "にげる・入れ替えを助ける", need: "にげるエネが重い" },
  "supply.evolve.help": { give: "進化を早められる", need: "2進化ポケモン" },
};

export interface Partner {
  card: AppCard;
  score: number;
  reasons: string[];
}

export function createSynergy(data: AppData) {
  const tagById = new Map<string, AppTag>(data.tags.map((t) => [t.id, t]));
  const byId = new Map(data.cards.map((c) => [c.id, c]));
  // タグの供給・要求は親タグから受け継ぐ
  const inherit = (id: string, key: "supplies" | "requires") => {
    const out: string[] = [];
    for (let t = tagById.get(id); t; t = t.parent ? tagById.get(t.parent) : undefined) out.push(...(t[key] ?? []));
    return out;
  };
  const supplies = new Map<string, Set<string>>();
  const requires = new Map<string, Set<string>>();
  for (const c of data.cards) {
    const s = new Set(c.tags.flatMap((t) => inherit(t, "supplies")));
    const r = new Set(c.tags.flatMap((t) => inherit(t, "requires")));
    if (c.kind === "pokemon" && (c.retreat ?? 0) >= 3) r.add("supply.retreat.help");
    if (c.stage === "stage2") r.add("supply.evolve.help");
    supplies.set(c.id, s);
    requires.set(c.id, r);
  }
  const heavyOf = (c: AppCard) =>
    c.kind === "pokemon" && c.type ? c.attacks.some((a) => a.costTotal >= 3 && (a.cost[c.type!] ?? 0) >= 2) : false;

  function partners(x: AppCard, limit = 30): Partner[] {
    const out = new Map<string, Partner>();
    const push = (id: string, score: number, reason: string) => {
      const card = byId.get(id);
      if (!card || id === x.id || card.nameEn === x.nameEn) return;
      const p = out.get(id) ?? out.set(id, { card, score: 0, reasons: [] }).get(id)!;
      p.score += score;
      if (!p.reasons.includes(reason)) p.reasons.push(reason);
    };
    // 名前指定
    for (const id of x.refs) push(id, 3, "効果で名指し");
    for (const c of data.cards) if (c.refs.includes(x.id)) push(c.id, 3, "このカードを名指し");
    // タイプ別のエネ加速 ↔ そのタイプの重いワザ
    for (const c of data.cards) {
      for (const t of x.accelTypes) if (t !== "colorless" && c.type === t && heavyOf(c)) push(c.id, 2, `${TYPE_JA[t]}エネ加速の受け手`);
      if (x.type && c.accelTypes.includes(x.type) && heavyOf(x)) push(c.id, 2, `${TYPE_JA[x.type]}エネを加速できる`);
    }
    // 供給と要求
    const xs = supplies.get(x.id)!;
    const xr = requires.get(x.id)!;
    for (const c of data.cards) {
      if (c.id === x.id) continue;
      for (const s of xs) if (requires.get(c.id)!.has(s)) push(c.id, 1, SUPPLY[s]?.need ?? s);
      for (const s of xr) if (supplies.get(c.id)!.has(s)) push(c.id, 1, SUPPLY[s]?.give ?? s);
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
    return [...byName.values()].sort((a, b) => b.score - a.score || a.card.id.localeCompare(b.card.id)).slice(0, limit);
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
