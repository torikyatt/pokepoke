import { useEffect, useMemo, useRef, useState } from "react";
import { PoolFab, PoolGrid, PoolToolbar, QueryBox, usePoolResults } from "../components/pool.tsx";
import { Chip } from "../components/ui.tsx";
import { useData } from "../context.tsx";
import { openCard } from "../detail.ts";
import { usePool } from "../pool.ts";
import { navigate, searchPath, useRoute } from "../router.ts";

export const EXAMPLES = [
  "エネ加速できる炎のカード",
  "ベンチに攻撃できる雷ポケモン",
  "にげるエネ0のたね",
  "相手の手札を減らすサポート",
  "コインで火力が上がるワザ",
  "水1個であとは無色のワザ",
  "トラッシュの枚数で変わる",
  "HP150以上の鋼ポケモン",
];

const csv = (s: string | null) => (s ? s.split(",").filter(Boolean) : []);

/** 検索文（URLの ?q= と ?x= ?tag=）を条件にする */
export function useQueryConds(q: string, excluded: Set<string>, tagParam = "") {
  const { engine } = useData();
  const parsed = useMemo(() => {
    const base = engine.parse(q);
    if (tagParam && !base.some((c) => c.id === `tag:${tagParam}`)) base.unshift({ id: `tag:${tagParam}`, kind: "tag", tag: tagParam, label: engine.tagJa.get(tagParam) ?? tagParam, weight: 1 });
    return base;
  }, [engine, q, tagParam]);
  const conds = useMemo(() => parsed.filter((c) => !excluded.has(c.id)), [parsed, [...excluded].join()]);
  return { parsed, conds };
}

/** カードの検索。wide は PC の左の列（右下の丸ボタンの代わりにツールバーで絞り込む） */
export function SearchPage({ wide, counts }: { wide?: boolean; counts?: Map<string, number> }) {
  const { data, engine } = useData();
  const { params } = useRoute();
  const q = params.get("q") ?? "";
  const tagParam = params.get("tag") ?? "";
  const excluded = new Set(csv(params.get("x")));
  const [input, setInput] = useState(q);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => setInput(q), [q]);

  const { parsed, conds } = useQueryConds(q, excluded, tagParam);
  const favOnly = usePool().favOnly;
  const { hits, scored, total } = usePoolResults(conds);
  const labelOf = useMemo(() => new Map(parsed.map((c) => [c.id, c.label])), [parsed]);

  const go = (patch: { q?: string; x?: string[] }, replace = true) =>
    navigate(searchPath({ q: patch.q ?? q, x: (patch.x ?? (patch.q !== undefined ? [] : [...excluded])).join(","), tag: patch.q !== undefined ? undefined : tagParam }), { replace });

  return (
    <div>
      <div className="sticky top-0 z-30 space-y-2.5 bg-canvas/95 px-4 pt-3 pb-3 backdrop-blur">
        <QueryBox
          value={input}
          onChange={(v) => {
            setInput(v);
            clearTimeout(timer.current);
            timer.current = setTimeout(() => go({ q: v.trim() }), 350);
          }}
          onSubmit={(v) => {
            clearTimeout(timer.current);
            go({ q: v.trim() }, v.trim() !== q);
          }}
          conds={parsed}
          excluded={excluded}
          onToggle={(id) => go({ x: excluded.has(id) ? [...excluded].filter((x) => x !== id) : [...excluded, id] })}
        />
        <PoolToolbar
          filter={wide}
          left={
            <>
              <span>{hits.length}</span>
              <span className="text-xs text-muted">{scored && total > hits.length ? `/ ${total}件` : "件"}</span>
            </>
          }
        />
      </div>

      <div className="px-4 pb-6">
        {!q && !tagParam && !favOnly && (
          <div className="mb-3">
            {!wide && <h1 className="mb-1 text-lg font-extrabold tracking-wider text-ink">POKÉPOKE LAB</h1>}
            <p className="mb-2 text-xs font-bold text-muted">ふだんの言葉で探せます（カードをタップで詳細・デッキに追加）</p>
            <div className={wide ? "flex flex-wrap gap-2 pb-2" : "scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 pb-2"}>
              {EXAMPLES.map((ex) => (
                <Chip key={ex} onClick={() => go({ q: ex }, false)}>
                  {ex}
                </Chip>
              ))}
            </div>
          </div>
        )}
        {q && !favOnly && hits.length === 0 && <p className="py-8 text-center text-sm font-bold text-muted">見つかりませんでした。条件をタップして外すか、絞り込みをゆるめてください。</p>}
        <PoolGrid
          hits={hits}
          wide={wide}
          counts={counts}
          onTap={(c) => openCard(c.id)}
          footer={(h) =>
            scored && (
              <div className="mt-1 space-y-0.5 text-[10px] leading-tight font-bold text-muted">
                {h.matched
                  .filter((id) => labelOf.has(id))
                  .slice(0, 2)
                  .map((id) => (
                    <div key={id} className="truncate text-accent-deep">✓ {labelOf.get(id)}</div>
                  ))}
                {h.effects.length > 0 && <div className="truncate">{h.effects.slice(0, 2).join("・")}</div>}
              </div>
            )
          }
        />
        <p className="mt-8 text-center text-[10px] text-muted">
          データ {data.cards.length} 種 ・ {new Date(data.builtAt).toLocaleDateString("ja-JP")} 時点
        </p>
      </div>
      {!wide && <PoolFab />}
    </div>
  );
}
