// 収録パックの表示（弾ごとに色分けしたバッジ＋日本語の弾名・パック名）
import { useData } from "../context.tsx";
import type { AppCard, AppPrint, AppSet } from "../types.ts";
import { useLang, type Lang } from "../i18n.ts";

// 弾の色（発売順に色相を回す）。プロモは灰色
const HUES = [205, 350, 140, 30, 270, 180, 55, 315, 95, 240, 10, 160];
export function setColor(sets: AppSet[], code: string): string {
  if (code.startsWith("p")) return "hsl(215 12% 55%)";
  const i = sets.filter((s) => !s.code.startsWith("p")).findIndex((s) => s.code === code);
  return `hsl(${HUES[(i < 0 ? 0 : i) % HUES.length]} 62% ${i % 24 >= 12 ? 38 : 46}%)`;
}

export function SetBadge({ set }: { set: string }) {
  const { data } = useData();
  const label = set.startsWith("p") ? `P-${set.slice(1).toUpperCase()}` : set.toUpperCase();
  return (
    <span className="inline-flex h-5 shrink-0 items-center rounded-md px-1.5 text-[10px] font-extrabold text-white" style={{ background: setColor(data.sets, set) }}>
      {label}
    </span>
  );
}

export const RARITY_JA: Record<string, string> = {
  "◊": "◆", "◊◊": "◆◆", "◊◊◊": "◆◆◆", "◊◊◊◊": "◆◆◆◆", "☆": "★", "☆☆": "★★", "☆☆☆": "★★★", "Crown Rare": "👑", Promo: "プロモ",
};
export const rarityLabel = (r: string, lang: Lang) => (lang === "en" && r === "Promo" ? "Promo" : RARITY_JA[r] ?? r);
const RANK = ["◊", "◊◊", "◊◊◊", "◊◊◊◊", "☆", "☆☆", "☆☆☆", "Crown Rare"];

/** 弾名（日本語）＋パック名。弾にパックが複数あって、どれからも出るなら「共通」。英語は弾名だけ */
export function packLabel(p: AppPrint, sets: AppSet[], multiPack: Set<string>, lang: Lang = "ja"): string {
  const set = sets.find((s) => s.code === p.set);
  if (lang === "en") return set?.name ?? p.setName;
  const name = set?.nameJa ?? p.setName;
  if (p.how) return p.how.split(/[|｜]/)[0];
  if (p.pack) return `${name}・${p.pack}`;
  return multiPack.has(p.set) ? `${name}・共通` : name;
}

/** 弾の中にパックが複数ある弾（最強の遺伝子・時空の激闘…） */
const multiCache = new WeakMap<object, Set<string>>();
export function useMultiPackSets(): Set<string> {
  const { data } = useData();
  let r = multiCache.get(data);
  if (!r) {
    const s = new Map<string, Set<string>>();
    for (const c of data.cards) for (const p of c.prints) if (p.pack) (s.get(p.set) ?? s.set(p.set, new Set()).get(p.set)!).add(p.pack);
    r = new Set([...s].filter(([, v]) => v.size > 1).map(([k]) => k));
    multiCache.set(data, r);
  }
  return r;
}

/** いちばん手に入れやすい収録（通常レアリティ→早い弾）。プロモしか無ければプロモ */
export function mainPrint(c: AppCard): AppPrint {
  const rank = (p: AppPrint) => (p.rarity === "Promo" ? 50 : RANK.indexOf(p.rarity) < 0 ? 40 : RANK.indexOf(p.rarity));
  return [...c.prints].sort((a, b) => rank(a) - rank(b))[0];
}

/** 1行の収録表示 */
export function PrintLine({ p, compact }: { p: AppPrint; compact?: boolean }) {
  const { data } = useData();
  const multi = useMultiPackSets();
  const lang = useLang();
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <SetBadge set={p.set} />
      <span className={`truncate font-bold ${compact ? "text-[11px]" : "text-xs"}`}>{packLabel(p, data.sets, multi, lang)}</span>
      <span className="shrink-0 text-[10px] font-bold text-muted">{rarityLabel(p.rarity, lang)}</span>
    </span>
  );
}
