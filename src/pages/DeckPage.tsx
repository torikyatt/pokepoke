import { toPng } from "html-to-image";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PoolFab, PoolGrid, PoolToolbar, QueryBox, usePoolResults } from "../components/pool.tsx";
import { EnergyIcon, Header, IconDeck, Pressable, Thumb } from "../components/ui.tsx";
import { useData } from "../context.tsx";
import { thumbUrl } from "../data/load.ts";
import { useSettings } from "../store.ts";
import { canAdd, checkDeck, DECK_SIZE, decodeShare, download, encodeShare, fromFile, guessEnergy, MAX_ENERGY, MAX_SAME_NAME, toFile } from "../deck.ts";
import { navigate } from "../router.ts";
import { openCard } from "../detail.ts";
import { useNav } from "../nav.ts";
import { useDecks, useToast, type Deck } from "../store.ts";
import type { AppCard, EnergyType } from "../types.ts";
import { useQueryConds } from "./SearchPage.tsx";
import { mainPrint, packLabel, PrintLine, SetBadge, useMultiPackSets } from "../components/prints.tsx";

export const ZONE_TYPES: EnergyType[] = ["grass", "fire", "water", "lightning", "psychic", "fighting", "darkness", "metal"];

/** デッキ内の並び（図鑑順＝アプリと同じ） */
export function deckCards(deck: Pick<Deck, "cards">, byId: Map<string, AppCard>): AppCard[] {
  return deck.cards
    .map((id) => byId.get(id))
    .filter((c): c is AppCard => !!c)
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id, "en", { numeric: true }));
}

// デッキ編集画面の上の枠: いつも10枚×2段。大きくすると1画面に見える列が減り、横にスクロールする
const SLOT_VISIBLE = { s: 10, m: 7, l: 5 } as const;

// ---------------- 一覧 ----------------

export function DeckListPage() {
  const { byId } = useData();
  const { decks, create, select, importDecks } = useDecks();
  const show = useToast((s) => s.show);
  const fileRef = useRef<HTMLInputElement>(null);
  const onImport = async (file: File) => {
    try {
      const n = importDecks(fromFile(JSON.parse(await file.text()), byId));
      show(`${n} 個のデッキを読み込みました`);
    } catch (e) {
      show(e instanceof Error ? e.message : "読み込めませんでした", "error");
    }
  };
  return (
    <div>
      <Header
        title="デッキ"
        right={
          <>
            <button type="button" className="neu-sm neu-press rounded-full px-3 py-1.5 text-xs font-bold text-muted" onClick={() => fileRef.current?.click()}>
              読み込み
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onImport(f);
                e.target.value = "";
              }}
            />
          </>
        }
      />
      <div className="mx-auto grid max-w-3xl grid-cols-1 gap-4 px-4 py-3 sm:grid-cols-2">
        {decks.map((d) => {
          const cards = deckCards(d, byId);
          const ok = checkDeck(d, byId).ok;
          return (
            <button key={d.id} type="button" onClick={() => { select(d.id); navigate(`/deck/${d.id}`); }} className="neu neu-press rounded-2xl p-3 text-left">
              <div className="mb-2 flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate font-extrabold">{d.name}</span>
                {d.energy.map((t) => (
                  <EnergyIcon key={t} type={t} size="sm" />
                ))}
                <span className={`rounded-full px-2 py-0.5 text-xs font-extrabold ${ok ? "bg-accent text-white" : "neu-in text-muted"}`}>
                  {d.cards.length}/{DECK_SIZE}
                </span>
              </div>
              <div className="grid grid-cols-10 gap-1">
                {Array.from({ length: 10 }, (_, i) => cards[i]).map((c, i) => (c ? <Thumb key={i} card={c} className="rounded-sm" /> : <div key={i} className="neu-in aspect-[367/512] rounded-sm" />))}
              </div>
            </button>
          );
        })}
        <button type="button" onClick={() => navigate(`/deck/${create()}/edit`)} className="neu-in flex min-h-28 flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-line font-extrabold text-muted">
          <span className="text-3xl leading-none">＋</span>
          新しいデッキを作る
        </button>
      </div>
    </div>
  );
}

// ---------------- 編集（ポケポケ本体のデッキ編集画面に寄せる） ----------------

export function DeckBuilderPage({ id }: { id: string }) {
  const { byId, engine } = useData();
  const deck = useDecks((s) => s.decks.find((d) => d.id === id));
  const { add, removeCard, select } = useDecks();
  const { slotSize, setSlotSize } = useSettings();
  const show = useToast((s) => s.show);
  const [searchOpen, setSearchOpen] = useState(false);
  const [input, setInput] = useState("");
  const [q, setQ] = useState("");
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => select(id), [id]);

  const { parsed, conds } = useQueryConds(q, excluded);
  const { hits } = usePoolResults(conds);
  const cards = useMemo(() => (deck ? deckCards(deck, byId) : []), [deck, byId]);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const cid of deck?.cards ?? []) m.set(cid, (m.get(cid) ?? 0) + 1);
    return m;
  }, [deck]);
  const nameCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of cards) m.set(c.nameEn, (m.get(c.nameEn) ?? 0) + 1);
    return m;
  }, [cards]);

  if (!deck) return <Header title="デッキが見つかりません" back={() => navigate("/deck")} />;
  const full = deck.cards.length >= DECK_SIZE;

  return (
    <div className="pb-28">
      <div className="sticky top-0 z-30 bg-canvas/95 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 backdrop-blur">
        <div className="neu rounded-3xl p-3">
          <div className="scrollbar-none -mx-1 snap-x snap-mandatory overflow-x-auto px-1 pb-1">
          <div className="grid grid-cols-10 gap-1.5" style={{ width: `${(1000 / SLOT_VISIBLE[slotSize]).toFixed(2)}%` }}>
            {Array.from({ length: DECK_SIZE }, (_, i) => cards[i]).map((c, i) =>
              c ? (
                <Pressable key={`${c.id}-${i}`} onTap={() => openCard(c.id)} onLongPress={() => { removeCard(deck.id, c.id); show(`「${c.nameJa}」を1枚外しました`); }} label={`${c.nameJa}（長押しで外す）`} className="pop-in snap-start rounded-[4px] shadow-[1px_2px_3px_rgb(150_165_185/0.5)]">
                  <Thumb card={c} className="rounded-[4px]" />
                </Pressable>
              ) : (
                <div key={i} className="neu-in flex aspect-[367/512] snap-start items-center justify-center rounded-[4px] text-lg font-light text-[#b8c3d1]">
                  ＋
                </div>
              ),
            )}
          </div>
          </div>
          <div className="mt-2 flex items-center justify-end gap-1 text-[11px] font-bold text-muted">
            {slotSize !== "s" && <span className="mr-auto">← 横にスクロール →</span>}
            <span className="mr-1">枠の大きさ</span>
            {(["s", "m", "l"] as const).map((v) => (
              <button key={v} type="button" aria-pressed={slotSize === v} onClick={() => setSlotSize(v)} className={`h-6 w-7 rounded-full ${slotSize === v ? "bg-accent text-white" : "neu-in"}`}>
                {{ s: "小", m: "中", l: "大" }[v]}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-3">
          <PoolToolbar
            left={
              <>
                <IconDeck className="h-5 w-5 fill-none stroke-current stroke-[2.2]" />
                <span className={full ? "text-accent-deep" : ""}>
                  {deck.cards.length}/{DECK_SIZE}
                </span>
              </>
            }
            searchOpen={searchOpen}
            onSearch={() => setSearchOpen((v) => !v)}
          />
        </div>
        {searchOpen && (
          <div className="mt-3">
            <QueryBox
              autoFocus
              value={input}
              onChange={(v) => {
                setInput(v);
                clearTimeout(timer.current);
                timer.current = setTimeout(() => {
                  setQ(v.trim());
                  setExcluded(new Set());
                }, 350);
              }}
              onSubmit={(v) => {
                clearTimeout(timer.current);
                setQ(v.trim());
                setExcluded(new Set());
              }}
              conds={parsed}
              excluded={excluded}
              onToggle={(cid) => setExcluded((s) => (s.has(cid) ? new Set([...s].filter((x) => x !== cid)) : new Set([...s, cid])))}
            />
          </div>
        )}
      </div>

      <div className="px-4">
        <p className="mb-2 text-center text-[11px] font-bold text-muted">タップで詳細 ・ 長押しで追加 ・ 上の枠を長押しで外す</p>
        <PoolGrid
          hits={hits}
          counts={counts}
          maxed={(c) => full || (nameCounts.get(c.nameEn) ?? 0) >= MAX_SAME_NAME}
          onTap={(c) => openCard(c.id)}
        />
      </div>

      <button
        type="button"
        onClick={() => navigate(`/deck/${deck.id}`, { replace: true })}
        aria-label="編集を終える"
        title="編集を終える"
        className="btn-ok fixed left-4 z-40 flex h-14 w-14 items-center justify-center rounded-full"
        style={{ bottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
      >
        <svg viewBox="0 0 24 24" className="h-8 w-8 fill-none stroke-white stroke-[3]" aria-hidden>
          <path d="m5 12.5 4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <PoolFab bottom="bottom-5" />
    </div>
  );
}

/** デッキを画像・共有URLで書き出す（デッキ確認画面とPCのデッキ列で共通） */
export function useDeckExport(deck: Deck | undefined) {
  const { byId } = useData();
  const show = useToast((s) => s.show);
  const imageRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);
  const [preview, setPreview] = useState<string>(); // 作った画像（画面に出して、長押し・右クリックで保存してもらう）
  const lang = useSettings((s) => s.imageLang);
  const savePng = async () => {
    if (!deck || !imageRef.current) return;
    setExporting(true);
    try {
      // オンラインなら高解像度画像、取れなければサムネイルで書き出す（SPEC 5.3）
      const imgs = [...imageRef.current.querySelectorAll("img")];
      await Promise.all(
        imgs.map(
          (img) =>
            new Promise<void>((res) => {
              const card = byId.get(img.dataset.id!)!;
              const fallback = () => {
                img.onerror = () => res();
                img.onload = () => res();
                img.removeAttribute("crossorigin");
                img.src = thumbUrl(card, lang);
              };
              img.onload = () => res();
              img.onerror = fallback;
              // 日本語の大きい画像（Game8）は別オリジンで画像化できないので、日本語はサムネイルで書き出す
              if (navigator.onLine && lang === "en") {
                img.crossOrigin = "anonymous";
                img.src = card.image;
              } else fallback();
            }),
        ),
      );
      // Webフォントは別オリジンなので取り込まない（端末のフォントで描く）
      const url = await toPng(imageRef.current, { pixelRatio: 2, backgroundColor: "#e6ecf3", skipFonts: true });
      setPreview(url);
    } catch {
      show("画像を作れませんでした", "error");
    } finally {
      setExporting(false);
    }
  };

  const share = async () => {
    if (!deck) return;
    const url = `${location.href.split("#")[0]}#/share/${encodeShare(deck)}`;
    try {
      if (navigator.share) await navigator.share({ title: deck.name, url });
      else {
        await navigator.clipboard.writeText(url);
        show("共有URLをコピーしました");
      }
    } catch {
      prompt("このURLをコピーしてください", url);
    }
  };

  const image = deck && (
    <>
      <div style={{ position: "fixed", left: -10000, top: 0 }} aria-hidden>
        <DeckImage ref={imageRef} deck={deck} cards={deckCards(deck, byId)} />
      </div>
      {preview && (
        <ImagePreview
          url={preview}
          onClose={() => setPreview(undefined)}
          onDownload={async () => download(`${deck.name}.png`, await (await fetch(preview)).blob(), "image/png")}
        />
      )}
    </>
  );
  return { savePng, share, exporting, image };
}

// ---------------- 確認・書き出し ----------------

export function DeckViewPage({ id }: { id: string }) {
  const { byId } = useData();
  const deck = useDecks((s) => s.decks.find((d) => d.id === id));
  const { update, remove, create } = useDecks();
  const show = useToast((s) => s.show);
  const { deckView, setDeckView } = useSettings();
  const { savePng, share, exporting, image } = useDeckExport(deck);
  if (!deck) return <Header title="デッキが見つかりません" back={() => navigate("/deck")} />;
  const cards = deckCards(deck, byId);
  const check = checkDeck(deck, byId);

  const btn = "neu neu-press rounded-2xl py-3 text-sm font-extrabold disabled:opacity-40";
  return (
    <div>
      <Header title="デッキ" back={() => navigate("/deck")} />
      <div className="mx-auto max-w-3xl space-y-4 px-4 pb-8">
        <input
          value={deck.name}
          onChange={(e) => update(deck.id, { name: e.target.value })}
          className="neu-in w-full rounded-full px-4 py-2.5 text-base font-extrabold outline-none"
          aria-label="デッキ名"
        />

        <div className="flex items-center justify-between">
          <span className="text-sm font-extrabold text-muted">
            {cards.length}/{DECK_SIZE} 枚
          </span>
          <div className="neu-in flex rounded-full p-0.5 text-xs font-bold" role="tablist" aria-label="表示">
            {(["grid", "list"] as const).map((v) => (
              <button key={v} type="button" role="tab" aria-selected={deckView === v} onClick={() => setDeckView(v)} className={`rounded-full px-4 py-1.5 ${deckView === v ? "bg-white text-accent shadow" : "text-muted"}`}>
                {v === "grid" ? "カード" : "リスト"}
              </button>
            ))}
          </div>
        </div>

        {deckView === "list" ? (
          <DeckList cards={cards} />
        ) : (
          <div className="neu rounded-3xl p-3">
            <div className="grid grid-cols-5 gap-2">
              {Array.from({ length: DECK_SIZE }, (_, i) => cards[i]).map((c, i) =>
                c ? (
                  <Pressable key={i} onTap={() => openCard(c.id)} label={c.nameJa} className="rounded-md shadow-[1px_2px_4px_rgb(150_165_185/0.5)]">
                    <Thumb card={c} />
                  </Pressable>
                ) : (
                  <div key={i} className="neu-in aspect-[367/512] rounded-md" />
                ),
              )}
            </div>
          </div>
        )}

        <button type="button" onClick={() => navigate(`/deck/${deck.id}/edit`)} className="btn-ok w-full rounded-full py-4 text-lg">
          デッキを編集
        </button>

        <EnergyZone deck={deck} />

        <div className={`rounded-2xl p-4 text-sm font-bold ${check.ok ? "bg-[#dff4f1] text-accent-deep" : "bg-[#fdf1d8] text-[#8a5c0c]"}`}>
          {check.ok ? "✓ このデッキでバトルできます" : check.problems.map((p) => <div key={p}>・{p}</div>)}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button type="button" disabled={!cards.length || exporting} onClick={savePng} className={btn}>
            {exporting ? "画像を作成中…" : "画像で保存"}
          </button>
          <button type="button" disabled={!cards.length} onClick={share} className={btn}>
            共有URL
          </button>
          <button type="button" onClick={() => download(`${deck.name}.json`, JSON.stringify(toFile([deck]), null, 1))} className={btn}>
            書き出し（JSON）
          </button>
          <button
            type="button"
            onClick={() => {
              const nid = create(`${deck.name}のコピー`, { cards: [...deck.cards], energy: [...deck.energy] });
              navigate(`/deck/${nid}`);
            }}
            className={btn}
          >
            複製
          </button>
          <button
            type="button"
            onClick={() => {
              const all = useDecks.getState().decks;
              download("pokepoke-decks.json", JSON.stringify(toFile(all), null, 1));
            }}
            className={btn}
          >
            全デッキを書き出し
          </button>
          <button
            type="button"
            onClick={() => {
              if (confirm(`「${deck.name}」を削除しますか？`)) {
                remove(deck.id);
                navigate("/deck");
              }
            }}
            className={`${btn} text-danger`}
          >
            削除
          </button>
        </div>
      </div>

      {image}
    </div>
  );
}

/** エネルギーゾーン（最大3タイプ） */
export function EnergyZone({ deck }: { deck: Deck }) {
  const { byId } = useData();
  const { update } = useDecks();
  const show = useToast((s) => s.show);
  return (
    <div className="neu rounded-3xl p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-extrabold text-muted">エネルギー（{MAX_ENERGY}タイプまで）</h2>
        <button type="button" className="text-xs font-bold text-accent-deep" onClick={() => update(deck.id, { energy: guessEnergy(deck, byId) })}>
          デッキから自動設定
        </button>
      </div>
      <div className="flex flex-wrap justify-between gap-1">
        {ZONE_TYPES.map((t) => {
          const on = deck.energy.includes(t);
          return (
            <button
              key={t}
              type="button"
              aria-pressed={on}
              onClick={() => {
                if (on) update(deck.id, { energy: deck.energy.filter((x) => x !== t) });
                else if (deck.energy.length < MAX_ENERGY) update(deck.id, { energy: [...deck.energy, t] });
                else show(`エネルギーは${MAX_ENERGY}タイプまで`, "error");
              }}
              className={`rounded-full p-1 transition ${on ? "ring-[3px] ring-accent" : "opacity-40"}`}
            >
              <EnergyIcon type={t} size="xl" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** 縦の一覧: 小さなサムネ・カード名・枚数・収録パック。上にパックごとの枚数をまとめる */
export function DeckList({ cards }: { cards: AppCard[] }) {
  const { data } = useData();
  const multi = useMultiPackSets();
  const rows = [...new Map(cards.map((c) => [c.id, c])).values()].map((c) => ({ card: c, count: cards.filter((x) => x.id === c.id).length, main: mainPrint(c) }));
  // パックごとの枚数（いちばん手に入れやすい収録で数える）
  const byPack = new Map<string, { set: string; label: string; n: number }>();
  for (const r of rows) {
    const label = packLabel(r.main, data.sets, multi);
    const key = `${r.main.set}|${label}`;
    const cur = byPack.get(key) ?? byPack.set(key, { set: r.main.set, label, n: 0 }).get(key)!;
    cur.n += r.count;
  }
  if (!rows.length) return <p className="neu rounded-3xl p-6 text-center text-sm font-bold text-muted">まだカードがありません</p>;
  return (
    <div className="space-y-3">
      <div className="neu rounded-3xl p-3">
        <h3 className="mb-2 text-xs font-extrabold text-muted">出るパック</h3>
        <div className="space-y-1.5">
          {[...byPack.values()]
            .sort((a, b) => b.n - a.n)
            .map((p) => (
              <div key={`${p.set}${p.label}`} className="flex items-center gap-1.5">
                <SetBadge set={p.set} />
                <span className="min-w-0 flex-1 truncate text-xs font-bold">{p.label}</span>
                <span className="text-xs font-extrabold tabular-nums">{p.n}枚</span>
              </div>
            ))}
        </div>
      </div>
      <ul className="neu divide-y divide-line rounded-3xl px-3 py-1">
        {rows.map(({ card, count, main }) => {
          const others = [...new Set(card.prints.filter((p) => p !== main).map((p) => packLabel(p, data.sets, multi)))].filter((l) => l !== packLabel(main, data.sets, multi));
          return (
            <li key={card.id}>
              <Pressable onTap={() => openCard(card.id)} label={card.nameJa} className="flex items-center gap-3 py-2 text-left">
                <div className="w-10 shrink-0">
                  <Thumb card={card} className="rounded-[4px]" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm font-extrabold">{card.nameJa}</span>
                    <span className="shrink-0 rounded-full bg-badge px-2 py-0.5 text-xs font-extrabold text-white">×{count}</span>
                  </div>
                  <div className="mt-1">
                    <PrintLine p={main} />
                  </div>
                  {others.length > 0 && <div className="mt-0.5 truncate text-[10px] font-bold text-muted">ほか: {others.join(" / ")}</div>}
                </div>
              </Pressable>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** 画像にするデッキ: 左にカード20枚、右にカードの一覧（名前と枚数） */
function DeckImage({ deck, cards, ref }: { deck: Deck; cards: AppCard[]; ref: React.Ref<HTMLDivElement> }) {
  const lang = useSettings((s) => s.imageLang);
  const rows = [...new Map(cards.map((c) => [c.id, c])).values()].map((c) => ({ card: c, n: cards.filter((x) => x.id === c.id).length }));
  const groups: [string, typeof rows][] = [
    ["ポケモン", rows.filter((r) => r.card.kind === "pokemon")],
    ["トレーナーズ", rows.filter((r) => r.card.kind !== "pokemon")],
  ];
  const panel = { borderRadius: 24, background: "#eef2f7", boxShadow: "6px 6px 14px rgba(176,189,206,.55), -6px -6px 14px #fff" };
  return (
    <div ref={ref} style={{ width: 1400, padding: 28, background: "#e6ecf3", color: "#3d4757", fontFamily: "'M PLUS Rounded 1c', 'Hiragino Maru Gothic ProN', 'Hiragino Sans', sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
        <div style={{ fontSize: 32, fontWeight: 800, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{deck.name}</div>
        {deck.energy.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 14px", ...panel, borderRadius: 999 }}>
            <span style={{ fontSize: 15, fontWeight: 800, color: "#8794a7" }}>エネルギー</span>
            {deck.energy.map((t) => (
              <EnergyIcon key={t} type={t} size="lg" />
            ))}
          </div>
        )}
        <div style={{ fontSize: 18, fontWeight: 800, color: "#8794a7" }}>{cards.length}/{DECK_SIZE}</div>
      </div>
      <div style={{ display: "flex", gap: 20, alignItems: "stretch" }}>
        <div style={{ width: 900, flexShrink: 0, display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, padding: 16, ...panel }}>
          {cards.map((c, i) => (
            <img key={i} data-id={c.id} src={thumbUrl(c, lang)} alt={c.nameJa} style={{ width: "100%", aspectRatio: "367/512", borderRadius: 8, objectFit: "cover" }} />
          ))}
        </div>
        <div style={{ flex: 1, minWidth: 0, padding: "14px 18px", ...panel }}>
          {groups.map(([title, list]) =>
            list.length ? (
              <div key={title} style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 15, fontWeight: 800, color: "#8794a7", borderBottom: "2px solid #d5dde7", paddingBottom: 4, marginBottom: 6 }}>
                  <span>{title}</span>
                  <span>{list.reduce((a, r) => a + r.n, 0)}枚</span>
                </div>
                {list.map(({ card, n }) => (
                  <div key={card.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 0" }}>
                    <img data-id={card.id} src={thumbUrl(card, lang)} alt="" style={{ width: 30, aspectRatio: "367/512", borderRadius: 3, objectFit: "cover" }} />
                    <span style={{ flex: 1, minWidth: 0, fontSize: 19, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{card.nameJa}</span>
                    <span style={{ fontSize: 19, fontWeight: 800 }}>×{n}</span>
                  </div>
                ))}
              </div>
            ) : null,
          )}
        </div>
      </div>
      <div style={{ marginTop: 12, fontSize: 13, color: "#8794a7", textAlign: "right", fontWeight: 700 }}>POKÉPOKE LAB</div>
    </div>
  );
}

/** 作った画像を画面に出す。長押し（PCは右クリック）で保存できる */
function ImagePreview({ url, onClose, onDownload }: { url: string; onClose: () => void; onDownload: () => void }) {
  return createPortal(
    <div className="fixed inset-0 z-[70] flex flex-col items-center justify-center bg-[#3d4757]/60 p-3" role="dialog" aria-modal="true" aria-label="デッキの画像">
      <button type="button" aria-label="閉じる" className="absolute inset-0" onClick={onClose} />
      <div className="pop-in relative flex max-h-full w-full max-w-4xl flex-col gap-2 rounded-3xl bg-panel p-3 shadow-2xl">
        <div className="flex items-center gap-2">
          <p className="min-w-0 flex-1 text-xs font-bold text-muted">画像を長押し（PCは右クリック）して保存してください</p>
          <button type="button" onClick={onClose} className="neu-sm neu-press flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted" aria-label="閉じる">
            ✕
          </button>
        </div>
        <img src={url} alt="デッキの画像" className="min-h-0 w-full flex-1 rounded-xl object-contain" style={{ WebkitTouchCallout: "default" }} />
        <button type="button" onClick={onDownload} className="self-end text-[11px] font-bold text-accent-deep underline">
          ファイルとしてダウンロード
        </button>
      </div>
    </div>,
    document.body,
  );
}

// ---------------- 共有URLから ----------------

export function SharePage({ code, embedded }: { code: string; embedded?: boolean }) {
  const { byId } = useData();
  const importDecks = useDecks((s) => s.importDecks);
  const show = useToast((s) => s.show);
  let shared: ReturnType<typeof decodeShare> | undefined;
  try {
    shared = decodeShare(code);
  } catch {
    shared = undefined;
  }
  if (!shared) return <Header title="共有URLを読めませんでした" back={() => navigate("/deck")} />;
  const cards = deckCards(shared, byId);
  const check = checkDeck(shared, byId);
  return (
    <div>
      {embedded ? <h3 className="px-4 pb-3 text-base font-extrabold">{shared.name}</h3> : <Header title={`共有デッキ: ${shared.name}`} />}
      <div className="mx-auto max-w-3xl space-y-4 px-4 pb-8">
        <div className="flex items-center gap-2">
          {shared.energy.map((t) => (
            <EnergyIcon key={t} type={t} size="lg" />
          ))}
          <span className="text-sm font-bold text-muted">{cards.length} 枚</span>
        </div>
        {!check.ok && <div className="text-xs font-bold text-[#8a5c0c]">{check.problems.join(" / ")}</div>}
        <div className="neu grid grid-cols-5 gap-2 rounded-3xl p-3">
          {cards.map((c, i) => (
            <Pressable key={i} onTap={() => openCard(c.id)} label={c.nameJa}>
              <Thumb card={c} />
            </Pressable>
          ))}
        </div>
        <button
          type="button"
          className="btn-ok w-full rounded-full py-4 text-lg"
          onClick={() => {
            importDecks([{ name: shared!.name, energy: shared!.energy, cards: shared!.cards.filter((cid) => byId.has(cid)) }]);
            show("マイデッキに保存しました");
            navigate(embedded ? useNav.getState().base.search.slice(1) : "/deck");
          }}
        >
          マイデッキに保存
        </button>
      </div>
    </div>
  );
}
