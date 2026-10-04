// カード一覧まわりの部品: ツールバー、グリッド、並べ替え・絞り込みシート、右下の丸ボタン
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAddToDeck, useData } from "../context.tsx";
import { activeCount, EMPTY_FILTERS, matchFilters, RARITIES, SORTS, sortHits, usePool, type Filters, type SortKey } from "../pool.ts";
import { SCORED_KINDS, type Cond, type Hit } from "../search/engine.ts";
import type { AppCard, CardGroup, CardKind, EnergyType, Rule, Stage } from "../types.ts";
import { GROUP_JA, KIND_JA, STAGE_JA } from "../types.ts";
import { useDecks, useFavorites } from "../store.ts";
import { Chip, EnergyIcon, IconHeart, IconSearch, IconSort, PoolCard, Sheet } from "./ui.tsx";

const TYPES: EnergyType[] = ["grass", "fire", "water", "lightning", "psychic", "fighting", "darkness", "metal", "dragon", "colorless"];
const KINDS: CardKind[] = ["pokemon", "supporter", "item", "tool", "stadium", "fossil"];
const STAGES: Stage[] = ["basic", "stage1", "stage2"];
const RULES: [Rule, string][] = [["normal", "通常"], ["ex", "ex"], ["mega_ex", "メガシンカex"]];
const GROUPS: CardGroup[] = ["baby", "ultra_beast", "ancient", "future", "team_rocket"];
const HP_STEPS = Array.from({ length: 23 }, (_, i) => 30 + i * 10);
const DMG_STEPS = [30, 50, 70, 90, 100, 120, 150, 180, 200];

/** 検索文＋絞り込み＋並べ替えを通した一覧 */
export function usePoolResults(conds: Cond[]) {
  const { engine } = useData();
  const { filters, sort, desc, favOnly } = usePool();
  const favs = useFavorites((s) => s.ids);
  const { data } = useData();
  const scored = conds.some((c) => SCORED_KINDS.includes(c.kind));
  // 「〇〇デッキ」「〇〇と相性がいい」「大会でよく使われる」は、図鑑順より関係の深い順のほうが役に立つ
  const usageFirst = conds.some((c) => c.kind === "deck" || c.kind === "partner" || c.kind === "meta");
  return useMemo(() => {
    // お気に入りを開いているときは、お気に入りの中から探す
    const fav = favOnly ? new Set(favs) : undefined;
    const raw: Hit[] = engine.run(conds, Infinity).filter((h) => (!fav || fav.has(h.card.id)) && matchFilters(h.card, filters));
    // 検索文があるときは「一致度順」なら上位50件（SPEC 4.3）。他の並びでは一致したもの全部を並べ替える
    const key: SortKey = sort === "order" && usageFirst ? "score" : sort === "score" && !scored ? "order" : sort;
    const sorted = sortHits(raw, key, key === sort ? desc : key === "score", data.meta?.usage);
    return { hits: key === "score" && !usageFirst ? sorted.slice(0, 50) : sorted, scored, total: raw.length };
  }, [engine, conds, filters, sort, desc, scored, usageFirst, favOnly, favs, data]);
}

/** n/20・お気に入り・カードの大きさ・虫めがね（PCでは並べ替え・絞り込みも）のバー */
export function PoolToolbar({ left, searchOpen, onSearch, filter }: { left: ReactNode; searchOpen?: boolean; onSearch?: () => void; filter?: boolean }) {
  const { columns, setColumns, favOnly, setFavOnly } = usePool();
  const nFav = useFavorites((s) => s.ids.length);
  const seg = (on: boolean) => `flex h-7 w-8 items-center justify-center rounded-full transition ${on ? "bg-white text-accent shadow" : "text-muted"}`;
  return (
    <div className="neu flex items-center gap-2 rounded-2xl px-2.5 py-1.5">
      <div className="neu-in flex items-center gap-1.5 rounded-full px-3 py-0.5 text-sm font-extrabold">{left}</div>
      <div className="flex-1" />
      <button
        type="button"
        onClick={() => setFavOnly(!favOnly)}
        aria-pressed={favOnly}
        title="お気に入り"
        className={`flex h-8 items-center gap-1 rounded-full px-2.5 text-xs font-extrabold transition ${favOnly ? "bg-[#ffe3e8] text-[#e5566a] shadow-[inset_0_1px_3px_rgb(229_86_106/0.25)]" : "neu-sm neu-press text-muted"}`}
      >
        <IconHeart filled={favOnly} className="h-4 w-4" />
        お気に入り{nFav > 0 && <span className="tabular-nums">{nFav}</span>}
      </button>
      <div className="neu-in flex rounded-full p-0.5" role="group" aria-label="カードの大きさ">
        <button type="button" onClick={() => setColumns(3)} aria-pressed={columns === 3} title="カードを大きく" aria-label="カードを大きく" className={seg(columns === 3)}>
          <IconCardsLarge />
        </button>
        <button type="button" onClick={() => setColumns(5)} aria-pressed={columns === 5} title="カードを小さく" aria-label="カードを小さく" className={seg(columns === 5)}>
          <IconCardsSmall />
        </button>
      </div>
      {filter && (
        <>
          <span className="h-6 w-px bg-line" />
          <FilterButton />
        </>
      )}
      {onSearch && (
        <>
          <span className="h-6 w-px bg-line" />
          <button type="button" onClick={onSearch} aria-label="検索" aria-pressed={searchOpen} className={`flex h-8 w-8 items-center justify-center rounded-full ${searchOpen ? "neu-in text-accent" : "text-muted"}`}>
            <IconSearch className="h-6 w-6 fill-none stroke-current stroke-[2.4]" />
          </button>
        </>
      )}
    </div>
  );
}

// カードの大きさのアイコン（大きいカード2枚 / 小さいカード6枚）
const IconCardsLarge = () => (
  <svg viewBox="0 0 20 20" className="h-4 w-4 fill-current" aria-hidden>
    <rect x="2" y="2.5" width="7" height="10" rx="1.4" />
    <rect x="11" y="2.5" width="7" height="10" rx="1.4" />
    <rect x="2" y="14.5" width="7" height="3" rx="1" opacity=".45" />
    <rect x="11" y="14.5" width="7" height="3" rx="1" opacity=".45" />
  </svg>
);
const IconCardsSmall = () => (
  <svg viewBox="0 0 20 20" className="h-4 w-4 fill-current" aria-hidden>
    {[1.5, 7.5, 13.5].flatMap((x) => [2.5, 11].map((y) => <rect key={`${x}-${y}`} x={x} y={y} width="5" height="6.5" rx="1" />))}
  </svg>
);

/** お気に入りの中で、そのままデッキに出し入れする小さな −／＋ */
function QuickAdd({ card }: { card: AppCard }) {
  const addToDeck = useAddToDeck();
  const deckId = useDecks((s) => s.currentId ?? s.decks[0]?.id);
  const count = useDecks((s) => s.decks.find((d) => d.id === deckId)?.cards.filter((id) => id === card.id).length ?? 0);
  const removeCard = useDecks((s) => s.removeCard);
  const b = "flex h-7 flex-1 items-center justify-center rounded-full text-base font-extrabold leading-none disabled:opacity-35";
  return (
    <div className="mt-1 flex items-center gap-1">
      <button type="button" aria-label={`${card.nameJa}を1枚外す`} disabled={!count} onClick={() => deckId && removeCard(deckId, card.id)} className={`neu-sm neu-press text-muted ${b}`}>
        −
      </button>
      <button type="button" aria-label={`${card.nameJa}をデッキに追加`} onClick={() => addToDeck(card)} className={`btn-ok ${b}`}>
        ＋
      </button>
    </div>
  );
}

/** 検索文の入力欄と、一致した条件のチップ（タップで外す） */
export function QueryBox({ value, onChange, onSubmit, conds, excluded, onToggle, autoFocus }: { value: string; onChange: (v: string) => void; onSubmit?: (v: string) => void; conds: Cond[]; excluded: Set<string>; onToggle: (id: string) => void; autoFocus?: boolean }) {
  return (
    <div className="space-y-2">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit?.(value);
          (document.activeElement as HTMLElement | null)?.blur();
        }}
        className="neu-in flex items-center gap-2 rounded-full px-4 py-2"
      >
        <IconSearch className="h-5 w-5 shrink-0 fill-none stroke-muted stroke-[2.4]" />
        <input
          type="search"
          enterKeyHint="search"
          autoFocus={autoFocus}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="例: エネ加速できる炎のカード"
          className="min-w-0 flex-1 bg-transparent text-base font-bold outline-none placeholder:font-medium placeholder:text-muted"
        />
        {value && (
          <button type="button" onClick={() => onChange("")} className="text-muted" aria-label="消す">
            ✕
          </button>
        )}
      </form>
      {conds.length > 0 && (
        <div className="flex flex-wrap gap-1.5" aria-label="一致した条件（タップで外す）">
          {conds.map((c) => {
            const off = excluded.has(c.id);
            return (
              <Chip key={c.id} tone={c.kind === "text" ? "text" : "match"} title={off ? "タップで戻す" : "タップで外す"} onClick={() => onToggle(c.id)}>
                <span className={off ? "line-through opacity-50" : ""}>{c.label}</span>
                <span aria-hidden>{off ? "↺" : "×"}</span>
              </Chip>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** カードのグリッド。下までスクロールすると続きを出す */
export function PoolGrid({ hits, counts, maxed, onTap, footer, wide }: { hits: Hit[]; counts?: Map<string, number>; maxed?: (c: AppCard) => boolean; onTap: (c: AppCard) => void; footer?: (h: Hit) => ReactNode; wide?: boolean }) {
  const { columns, favOnly, setFavOnly } = usePool();
  const addToDeck = useAddToDeck(); // 長押しで今のデッキに追加（タップは詳細）
  const nFav = useFavorites((s) => s.ids.length);
  const [shown, setShown] = useState(90);
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => setShown(90), [hits]);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && setShown((n) => n + 90), { rootMargin: "800px" });
    io.observe(el);
    return () => io.disconnect();
  }, [hits]);
  return (
    <>
      {favOnly && (
        <div className="mb-3 flex items-center gap-2 rounded-2xl bg-[#ffe3e8]/70 px-3 py-2 text-xs font-bold text-[#b8394c]">
          <IconHeart filled className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1 leading-tight">
            お気に入り {hits.length < nFav ? `${nFav}枚中 ${hits.length}枚` : `${nFav}枚`}
            <span className="block text-[10px] font-medium text-[#c76676]">−／＋ でそのままデッキに出し入れ</span>
          </span>
          <button type="button" onClick={() => setFavOnly(false)} className="shrink-0 rounded-full bg-white/80 px-2.5 py-1 text-[11px] font-extrabold">
            すべてのカード
          </button>
        </div>
      )}
      {favOnly && !nFav && <p className="py-10 text-center text-sm font-bold text-muted">まだお気に入りはありません。カード詳細の「♡ お気に入りに追加」で登録できます</p>}
      <div
        className={wide ? `grid ${columns === 5 ? "gap-2" : "gap-3"}` : `grid ${columns === 5 ? "grid-cols-5 gap-2 sm:grid-cols-7 md:grid-cols-8" : "grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5"}`}
        style={wide ? { gridTemplateColumns: `repeat(auto-fill, minmax(${columns === 5 ? 76 : 116}px, 1fr))` } : undefined}
      >
        {hits.slice(0, shown).map((h) => (
          <div key={h.card.id}>
            <PoolCard card={h.card} count={counts?.get(h.card.id)} maxed={maxed?.(h.card)} compact={columns === 5} onTap={() => onTap(h.card)} onLongPress={() => addToDeck(h.card)} />
            {favOnly ? <QuickAdd card={h.card} /> : footer?.(h)}
          </div>
        ))}
      </div>
      {hits.length > shown && <div ref={sentinel} className="h-10" />}
    </>
  );
}

/** ツールバーに置く並べ替え・絞り込みボタン（PC） */
function FilterButton() {
  const { filters, sort } = usePool();
  const [open, setOpen] = useState(false);
  const n = activeCount(filters);
  const label = SORTS.find((s) => s.key === sort)?.label;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="neu-sm neu-press relative flex items-center gap-1.5 rounded-full py-1.5 pr-3 pl-2 text-xs font-extrabold text-[#5aa9d6]">
        <span className="scale-75">
          <IconSort />
        </span>
        <span className="text-ink">{label}</span>
        {n > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-[11px] text-white">{n}</span>}
      </button>
      <SortFilterSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}

/** 右下の丸ボタン（並べ替え・絞り込み）と、上に戻るボタン */
export function PoolFab({ bottom = "bottom-24" }: { bottom?: string }) {
  const { filters, sort } = usePool();
  const [open, setOpen] = useState(false);
  const n = activeCount(filters);
  return (
    <>
      <div className={`fixed right-4 z-40 ${bottom} pb-[env(safe-area-inset-bottom)]`}>
        <button type="button" onClick={() => setOpen(true)} aria-label="並べ替え・絞り込み" className="neu neu-press relative flex h-16 w-16 items-center justify-center rounded-full text-[#5aa9d6]">
          <IconSort />
          {(n > 0 || sort !== "order") && <span className="absolute -top-1 -left-1 flex h-6 min-w-6 items-center justify-center rounded-full bg-accent px-1 text-xs font-extrabold text-white">{n || "↕"}</span>}
        </button>
        <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} aria-label="いちばん上へ" className="absolute -top-2 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-badge text-sm text-white shadow">
          ↑
        </button>
      </div>
      <SortFilterSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="py-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-extrabold text-muted">{title}</h3>
        {right}
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </section>
  );
}

function NumSelect({ value, onChange, options, placeholder, suffix }: { value?: number; onChange: (v?: number) => void; options: number[]; placeholder: string; suffix: string }) {
  return (
    <select value={value ?? ""} onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))} className="neu-in rounded-full px-3 py-1.5 text-sm font-bold outline-none">
      <option value="">{placeholder}</option>
      {options.map((n) => (
        <option key={n} value={n}>
          {n}
          {suffix}
        </option>
      ))}
    </select>
  );
}

export function SortFilterSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data } = useData();
  const pool = usePool();
  const [f, setF] = useState<Filters>(pool.filters);
  const [sort, setSort] = useState<SortKey>(pool.sort);
  const [desc, setDesc] = useState(pool.desc);
  const [openTag, setOpenTag] = useState<string>();
  useEffect(() => {
    if (open) {
      setF(pool.filters);
      setSort(pool.sort);
      setDesc(pool.desc);
    }
  }, [open]);

  const toggle = <K extends keyof Filters>(key: K, v: Filters[K] extends (infer T)[] ? T : never) =>
    setF((cur) => {
      const list = cur[key] as unknown[];
      return { ...cur, [key]: list.includes(v) ? list.filter((x) => x !== v) : [...list, v] };
    });
  const topTags = data.tags.filter((t) => !t.parent);
  const childTags = (id: string) => data.tags.filter((t) => t.parent === id);
  const sets = [...data.sets].sort((a, b) => (a.code.startsWith("p") ? 1 : 0) - (b.code.startsWith("p") ? 1 : 0) || b.released.localeCompare(a.released));

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="並べ替え・絞り込み"
      footer={
        <div className="flex gap-3">
          <button type="button" onClick={() => { setF(EMPTY_FILTERS); setSort("order"); setDesc(false); }} className="neu neu-press flex-1 rounded-full py-3 font-extrabold text-muted">
            リセット
          </button>
          <button
            type="button"
            onClick={() => {
              pool.setFilters(f);
              pool.setSort(sort, desc);
              onClose();
              window.scrollTo({ top: 0 });
              document.getElementById("pool-column")?.scrollTo({ top: 0 });
            }}
            className="btn-ok flex-[2] rounded-full py-3 text-lg"
          >
            OK
          </button>
        </div>
      }
    >
      <Section
        title="並べ替え"
        right={
          <div className="neu-in flex rounded-full p-0.5 text-xs font-bold">
            {[false, true].map((d) => (
              <button key={String(d)} type="button" onClick={() => setDesc(d)} className={`rounded-full px-3 py-1 ${desc === d ? "bg-white text-accent shadow" : "text-muted"}`}>
                {d ? "大きい順" : "小さい順"}
              </button>
            ))}
          </div>
        }
      >
        {SORTS.map((s) => (
          <Chip key={s.key} active={sort === s.key} onClick={() => { setSort(s.key); setDesc(s.desc); }}>
            {s.label}
          </Chip>
        ))}
      </Section>

      <Section title="タイプ">
        {TYPES.map((t) => (
          <button key={t} type="button" onClick={() => toggle("types", t)} aria-pressed={f.types.includes(t)} className={`rounded-full p-1 ${f.types.includes(t) ? "ring-[3px] ring-accent" : "opacity-60"}`}>
            <EnergyIcon type={t} size="xl" />
          </button>
        ))}
      </Section>
      <Section title="カードの種類">
        {KINDS.map((k) => (
          <Chip key={k} active={f.kinds.includes(k)} onClick={() => toggle("kinds", k)}>
            {KIND_JA[k]}
          </Chip>
        ))}
      </Section>
      <Section title="進化">
        {STAGES.map((s) => (
          <Chip key={s} active={f.stages.includes(s)} onClick={() => toggle("stages", s)}>
            {STAGE_JA[s]}
          </Chip>
        ))}
      </Section>
      <Section title="ルール">
        {RULES.map(([r, label]) => (
          <Chip key={r} active={f.rules.includes(r)} onClick={() => toggle("rules", r)}>
            {label}
          </Chip>
        ))}
        <span className="mx-1 h-7 w-px bg-line" />
        <Chip active={f.ability === "yes"} onClick={() => setF({ ...f, ability: f.ability === "yes" ? "" : "yes" })}>
          特性あり
        </Chip>
        <Chip active={f.ability === "no"} onClick={() => setF({ ...f, ability: f.ability === "no" ? "" : "no" })}>
          特性なし
        </Chip>
      </Section>
      <Section title="HP">
        <NumSelect value={f.hpMin} onChange={(v) => setF({ ...f, hpMin: v })} options={HP_STEPS} placeholder="下限なし" suffix=" 以上" />
        <span className="self-center text-muted">〜</span>
        <NumSelect value={f.hpMax} onChange={(v) => setF({ ...f, hpMax: v })} options={HP_STEPS} placeholder="上限なし" suffix=" 以下" />
      </Section>
      <Section title="にげるエネ">
        {[0, 1, 2, 3, 4].map((n) => (
          <Chip key={n} active={f.retreat.includes(n)} onClick={() => toggle("retreat", n)}>
            {n === 4 ? "4以上" : n}
          </Chip>
        ))}
      </Section>
      <Section title="ワザ">
        <NumSelect value={f.damageMin} onChange={(v) => setF({ ...f, damageMin: v })} options={DMG_STEPS} placeholder="最大ダメージ" suffix=" 以上" />
        <NumSelect value={f.costMax} onChange={(v) => setF({ ...f, costMax: v })} options={[0, 1, 2, 3, 4]} placeholder="ワザのエネ数" suffix="エネ以下で使える" />
      </Section>
      <Section title="弱点">
        {TYPES.filter((t) => t !== "dragon" && t !== "colorless").map((t) => (
          <button key={t} type="button" onClick={() => toggle("weakness", t)} aria-pressed={f.weakness.includes(t)} className={`rounded-full p-1 ${f.weakness.includes(t) ? "ring-[3px] ring-accent" : "opacity-60"}`}>
            <EnergyIcon type={t} size="lg" />
          </button>
        ))}
      </Section>
      <Section title="効果">
        {topTags.map((t) => {
          const selected = f.tags.includes(t.id) || f.tags.some((x) => x.startsWith(t.id + "."));
          return (
            <Chip key={t.id} active={selected} onClick={() => setOpenTag(openTag === t.id ? undefined : t.id)}>
              {t.ja} {openTag === t.id ? "▴" : "▾"}
            </Chip>
          );
        })}
        {openTag && (
          <div className="neu-in mt-1 flex w-full flex-wrap gap-1.5 rounded-2xl p-3">
            {[data.tags.find((t) => t.id === openTag)!, ...childTags(openTag), ...childTags(openTag).flatMap((c) => childTags(c.id))].map((t) => (
              <Chip key={t.id} active={f.tags.includes(t.id)} onClick={() => toggle("tags", t.id)}>
                {t.id === openTag ? `${t.ja}（すべて）` : t.ja}
              </Chip>
            ))}
          </div>
        )}
      </Section>
      <Section title="グループ">
        {GROUPS.map((g) => (
          <Chip key={g} active={f.groups.includes(g)} onClick={() => toggle("groups", g)}>
            {GROUP_JA[g]}
          </Chip>
        ))}
      </Section>
      <Section title="レアリティ">
        {RARITIES.map((r) => (
          <Chip key={r.key} active={f.rarities.includes(r.key)} onClick={() => toggle("rarities", r.key)}>
            {r.label}
          </Chip>
        ))}
      </Section>
      <Section title="収録パック">
        {sets.map((s) => (
          <Chip key={s.code} active={f.sets.includes(s.code)} onClick={() => toggle("sets", s.code)}>
            {s.nameJa}
          </Chip>
        ))}
      </Section>
    </Sheet>
  );
}
