import { useEffect, useMemo, useRef, useState } from "react";
import { PoolFab, PoolGrid, PoolToolbar, QueryBox, usePoolResults } from "../components/pool.tsx";
import { Chip, Logo } from "../components/ui.tsx";
import { useData } from "../context.tsx";
import { openCard } from "../detail.ts";
import { logOpen, logSearch } from "../search-log.ts";
import { usePool } from "../pool.ts";
import { navigate, searchPath, useRoute } from "../router.ts";
import { dateStr, useLang, useT } from "../i18n.ts";
import { pickExamples } from "../examples.ts";

const csv = (s: string | null) => (s ? s.split(",").filter(Boolean) : []);

/** 検索文（URLの ?q= と ?x= ?tag=）を条件にする */
export function useQueryConds(q: string, excluded: Set<string>, tagParam = "") {
  const { engine } = useData();
  const { parsed, unread } = useMemo(() => {
    const { conds: base, unread } = engine.explain(q);
    if (tagParam && !base.some((c) => c.id === `tag:${tagParam}`)) base.unshift({ id: `tag:${tagParam}`, kind: "tag", tag: tagParam, label: engine.tagLabel(tagParam, "ja"), en: engine.tagLabel(tagParam, "en"), weight: 1 });
    return { parsed: base, unread };
  }, [engine, q, tagParam]);
  const conds = useMemo(() => parsed.filter((c) => !excluded.has(c.id)), [parsed, [...excluded].join()]);
  return { parsed, conds, unread };
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

  const { parsed, conds, unread } = useQueryConds(q, excluded, tagParam);
  const favOnly = usePool().favOnly;
  const { hits, scored, total } = usePoolResults(conds);
  const lang = useLang();
  const t = useT();
  useEffect(() => logSearch(q, total, "search", lang, unread), [q, total, lang, unread]);
  // 検索の例: 開くたび・検索欄を空に戻すたびに選び直す
  const examples = useMemo(() => pickExamples(lang), [lang, !q]);
  const labelOf = useMemo(() => new Map(parsed.map((c) => [c.id, lang === "en" ? c.en : c.label])), [parsed, lang]);

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
          history={wide}
          left={
            <>
              <span>{hits.length}</span>
              <span className="text-xs text-muted">{scored && total > hits.length ? t(`/ ${total}件`, `/ ${total}`) : t("件", "cards")}</span>
            </>
          }
        />
      </div>

      <div className="px-4 pb-6">
        {!q && !tagParam && !favOnly && (
          <div className="mb-3">
            {!wide && (
              <h1 className="mb-2">
                <Logo />
              </h1>
            )}
            <p className="mb-2 text-xs font-bold text-muted">{t("ふだんの言葉で探せます（タップで詳細・長押しでデッキに追加）", "Search in plain words (tap for details, long-press to add to your deck)")}</p>
            <div className={wide ? "flex flex-wrap gap-2 pb-2" : "scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 pb-2"}>
              {examples.map((ex) => (
                <Chip key={ex} onClick={() => go({ q: ex }, false)}>
                  {ex}
                </Chip>
              ))}
            </div>
          </div>
        )}
        {q && !favOnly && hits.length === 0 && <p className="py-8 text-center text-sm font-bold text-muted">{t("見つかりませんでした。条件をタップして外すか、絞り込みをゆるめてください。", "Nothing found. Tap a condition to remove it, or loosen the filters.")}</p>}
        <PoolGrid
          hits={hits}
          wide={wide}
          counts={counts}
          onTap={(c) => {
            logOpen(q, lang);
            openCard(c.id, hits.map((h) => h.card.id));
          }}
          footer={(h) =>
            scored && (
              <div className="mt-1 space-y-0.5 text-[10px] leading-tight font-bold text-muted">
                {h.note && <div className="truncate text-accent-deep">{lang === "en" ? h.noteEn : h.note}</div>}
                {h.matched
                  .filter((id) => labelOf.has(id) && !(h.note && (id.startsWith("deck:") || id === "meta")))
                  .slice(0, 2)
                  .map((id) => (
                    <div key={id} className="truncate text-accent-deep">✓ {labelOf.get(id)}</div>
                  ))}
                {h.effects.length > 0 && <div className="truncate">{(lang === "en" ? h.effectsEn : h.effects).slice(0, 2).join(lang === "en" ? " / " : "・")}</div>}
              </div>
            )
          }
        />
        <p className="mt-8 text-center text-[10px] text-muted">
          {t(`データ ${data.cards.length} 種 ・ ${dateStr(data.builtAt, lang)} 時点`, `${data.cards.length} cards ・ as of ${dateStr(data.builtAt, lang)}`)}
        </p>
      </div>
      {!wide && <PoolFab history />}
    </div>
  );
}
