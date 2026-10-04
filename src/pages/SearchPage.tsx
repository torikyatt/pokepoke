import { useEffect, useMemo, useRef, useState } from "react";
import { CardImage, Chip, EnergyIcon } from "../components/ui.tsx";
import { useAddToDeck, useData } from "../context.tsx";
import { navigate, searchPath, useRoute } from "../router.ts";
import type { Cond } from "../search/engine.ts";
import { useMisses } from "../store.ts";
import type { CardKind, EnergyType } from "../types.ts";
import { KIND_JA } from "../types.ts";

const TYPES: EnergyType[] = ["grass", "fire", "water", "lightning", "psychic", "fighting", "darkness", "metal", "dragon", "colorless"];
const KINDS: CardKind[] = ["pokemon", "supporter", "item", "tool", "stadium", "fossil"];
const EXAMPLES = [
  "エネ加速できる炎のカード",
  "ベンチに攻撃できる雷ポケモン",
  "にげるエネ0のたね",
  "相手の手札を減らすサポート",
  "コインで火力が上がるワザ",
  "水1個であとは無色のワザ",
  "トラッシュの枚数で変わる",
  "HP150以上の鋼ポケモン",
];
const PAGE = 60;

const csv = (s: string | null) => (s ? s.split(",").filter(Boolean) : []);

export function SearchPage() {
  const { engine, data } = useData();
  const { params } = useRoute();
  const addToDeck = useAddToDeck();
  const logMiss = useMisses((s) => s.log);

  const q = params.get("q") ?? "";
  const types = csv(params.get("t")) as EnergyType[];
  const kinds = csv(params.get("k")) as CardKind[];
  const excluded = new Set(csv(params.get("x")));
  const tagParam = params.get("tag") ?? "";
  const [input, setInput] = useState(q);
  const [shown, setShown] = useState(PAGE);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => setInput(q), [q]);
  useEffect(() => setShown(PAGE), [q, params.get("t"), params.get("k"), params.get("x")]);

  const go = (patch: { q?: string; t?: string[]; k?: string[]; x?: string[] }, replace = true) =>
    navigate(
      searchPath({
        q: patch.q ?? q,
        t: (patch.t ?? types).join(","),
        k: (patch.k ?? kinds).join(","),
        x: (patch.x ?? (patch.q !== undefined ? [] : [...excluded])).join(","),
        tag: patch.q !== undefined ? undefined : tagParam,
      }),
      { replace },
    );

  // カード詳細のタグからの検索（?tag=…）はタグ条件そのものを使う
  const parsed = useMemo(() => {
    const base = engine.parse(q);
    if (tagParam && !base.some((c) => c.id === `tag:${tagParam}`)) base.unshift({ id: `tag:${tagParam}`, kind: "tag", tag: tagParam, label: engine.tagJa.get(tagParam) ?? tagParam, weight: 1 });
    return base;
  }, [engine, q, tagParam]);
  const conds: Cond[] = useMemo(() => {
    const extra: Cond[] = [
      ...types.map((t): Cond => ({ id: `type:${t}`, kind: "type", type: t, label: "" })),
      ...kinds.map((k): Cond => ({ id: `kind:${k}`, kind: "cardKind", value: k, label: "" })),
    ];
    return [...parsed.filter((c) => !excluded.has(c.id) && !extra.some((e) => e.id === c.id)), ...extra];
  }, [parsed, params.toString()]);
  const scored = conds.some((c) => ["tag", "variable", "name", "text"].includes(c.kind));
  const hits = useMemo(() => engine.run(conds, scored ? 50 : Infinity), [engine, conds, scored]);
  const labelOf = useMemo(() => new Map(parsed.map((c) => [c.id, c.label])), [parsed]);

  const submit = (value: string) => {
    clearTimeout(timer.current);
    if (value.trim() && !engine.parse(value).some((c) => c.kind !== "text")) logMiss(value);
    go({ q: value.trim() }, value.trim() !== q);
    (document.activeElement as HTMLElement | null)?.blur();
  };

  const toggle = <T extends string>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  return (
    <div>
      <div className="sticky top-0 z-30 space-y-2 border-b border-slate-200 bg-white/95 px-4 pt-3 pb-2 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(input);
          }}
          className="flex gap-2"
        >
          <input
            type="search"
            enterKeyHint="search"
            value={input}
            placeholder="例: エネ加速できる炎のカード"
            onChange={(e) => {
              const v = e.target.value;
              setInput(v);
              clearTimeout(timer.current);
              timer.current = setTimeout(() => go({ q: v.trim() }), 350);
            }}
            className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-base outline-none focus:border-red-500 dark:border-slate-700 dark:bg-slate-950"
          />
          <button type="submit" className="rounded-lg bg-red-600 px-4 text-sm font-bold text-white active:bg-red-700">
            検索
          </button>
        </form>

        {parsed.length > 0 && (
          <div className="flex flex-wrap gap-1.5" aria-label="一致した条件（タップで外す）">
            {parsed.map((c) => {
              const off = excluded.has(c.id);
              return (
                <Chip
                  key={c.id}
                  tone={c.kind === "text" ? "amber" : "blue"}
                  title={off ? "タップで戻す" : "タップで外す"}
                  onClick={() => go({ x: off ? [...excluded].filter((x) => x !== c.id) : [...excluded, c.id] })}
                >
                  <span className={off ? "line-through opacity-50" : ""}>{c.label}</span>
                  <span aria-hidden>{off ? "↺" : "×"}</span>
                </Chip>
              );
            })}
          </div>
        )}

        <div className="scrollbar-none -mx-4 flex gap-1.5 overflow-x-auto px-4">
          {TYPES.map((t) => (
            <button key={t} type="button" onClick={() => go({ t: toggle(types, t) })} className={`rounded-full p-0.5 ${types.includes(t) ? "ring-2 ring-red-500" : "opacity-80"}`} aria-pressed={types.includes(t)}>
              <EnergyIcon type={t} size="lg" />
            </button>
          ))}
        </div>
        <div className="scrollbar-none -mx-4 flex gap-1.5 overflow-x-auto px-4">
          {KINDS.map((k) => (
            <Chip key={k} active={kinds.includes(k)} onClick={() => go({ k: toggle(kinds, k) })}>
              {KIND_JA[k]}
            </Chip>
          ))}
        </div>
      </div>

      <div className="px-4 py-3">
        {!q && !types.length && !kinds.length && (
          <div className="mb-4 rounded-lg bg-white p-3 text-sm shadow-sm dark:bg-slate-900">
            <p className="mb-2 text-slate-600 dark:text-slate-300">ふだんの言葉で探せます。カードは長押しで今のデッキに追加。</p>
            <div className="flex flex-wrap gap-1.5">
              {EXAMPLES.map((ex) => (
                <Chip key={ex} onClick={() => go({ q: ex }, false)}>
                  {ex}
                </Chip>
              ))}
            </div>
          </div>
        )}
        <p className="mb-2 text-xs text-slate-500">
          {scored ? `上位 ${hits.length} 件` : `${hits.length} 件`}
          {q && hits.length === 0 && " — 条件をタップして外すと広がります"}
        </p>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
          {hits.slice(0, shown).map((h) => (
            <CardImage
              key={h.card.id}
              card={h.card}
              onLongPress={() => addToDeck(h.card)}
              footer={
                scored && (
                  <div className="mt-1 space-y-0.5 text-[10px] leading-tight text-slate-600 dark:text-slate-400">
                    {h.matched
                      .filter((id) => labelOf.has(id))
                      .slice(0, 2)
                      .map((id) => (
                        <div key={id} className="truncate">✓ {labelOf.get(id)}</div>
                      ))}
                    {h.effects.length > 0 && <div className="truncate text-slate-400">{h.effects.slice(0, 2).join("・")}</div>}
                  </div>
                )
              }
            />
          ))}
        </div>
        {hits.length > shown && (
          <button type="button" onClick={() => setShown((n) => n + PAGE)} className="mt-4 w-full rounded-lg bg-slate-200 py-2 text-sm dark:bg-slate-800">
            もっと見る（残り {hits.length - shown} 件）
          </button>
        )}
        <p className="mt-6 text-center text-[10px] text-slate-400">データ {data.cards.length} 種 ・ {new Date(data.builtAt).toLocaleDateString("ja-JP")} 時点</p>
      </div>
    </div>
  );
}
