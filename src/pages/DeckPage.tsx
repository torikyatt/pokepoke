import { toPng } from "html-to-image";
import { useEffect, useMemo, useRef, useState } from "react";
import { PoolFab, PoolGrid, PoolToolbar, QueryBox, usePoolResults } from "../components/pool.tsx";
import { EnergyIcon, Header, IconDeck, Pressable, Thumb } from "../components/ui.tsx";
import { useData } from "../context.tsx";
import { thumbUrl } from "../data/load.ts";
import { useSettings } from "../store.ts";
import { canAdd, checkDeck, DECK_SIZE, decodeShare, download, encodeShare, fromFile, guessEnergy, MAX_ENERGY, MAX_SAME_NAME, toFile } from "../deck.ts";
import { navigate } from "../router.ts";
import { useDecks, useMisses, useToast, type Deck } from "../store.ts";
import type { AppCard, EnergyType } from "../types.ts";
import { TYPE_JA } from "../types.ts";
import { useQueryConds } from "./SearchPage.tsx";

const ZONE_TYPES: EnergyType[] = ["grass", "fire", "water", "lightning", "psychic", "fighting", "darkness", "metal"];

/** デッキ内の並び（図鑑順＝アプリと同じ） */
function deckCards(deck: Pick<Deck, "cards">, byId: Map<string, AppCard>): AppCard[] {
  return deck.cards
    .map((id) => byId.get(id))
    .filter((c): c is AppCard => !!c)
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id, "en", { numeric: true }));
}

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
  const show = useToast((s) => s.show);
  const logMiss = useMisses((s) => s.log);
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
          <div className="grid grid-cols-10 gap-1.5">
            {Array.from({ length: DECK_SIZE }, (_, i) => cards[i]).map((c, i) =>
              c ? (
                <Pressable key={`${c.id}-${i}`} onTap={() => removeCard(deck.id, c.id)} onLongPress={() => navigate(`/card/${c.id}`)} label={`${c.nameJa}を外す`} className="pop-in rounded-[4px] shadow-[1px_2px_3px_rgb(150_165_185/0.5)]">
                  <Thumb card={c} className="rounded-[4px]" />
                </Pressable>
              ) : (
                <div key={i} className="neu-in flex aspect-[367/512] items-center justify-center rounded-[4px] text-lg font-light text-[#b8c3d1]">
                  ＋
                </div>
              ),
            )}
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
                if (v.trim() && !engine.parse(v).some((c) => c.kind !== "text")) logMiss(v);
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
        <p className="mb-2 text-center text-[11px] font-bold text-muted">タップで追加 ・ 長押しで詳細 ・ 上の枠をタップで外す</p>
        <PoolGrid
          hits={hits}
          counts={counts}
          maxed={(c) => full || (nameCounts.get(c.nameEn) ?? 0) >= MAX_SAME_NAME}
          onTap={(c) => {
            const err = canAdd(deck, c, byId);
            if (err) show(err, "error");
            else add(deck.id, c.id);
          }}
          onLongPress={(c) => navigate(`/card/${c.id}`)}
        />
      </div>

      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <button type="button" onClick={() => navigate(`/deck/${deck.id}`, { replace: true })} className="btn-ok pointer-events-auto h-16 w-[62%] max-w-sm rounded-full text-2xl">
          OK
        </button>
      </div>
      <PoolFab bottom="bottom-5" />
    </div>
  );
}

// ---------------- 確認・書き出し ----------------

export function DeckViewPage({ id }: { id: string }) {
  const { byId } = useData();
  const deck = useDecks((s) => s.decks.find((d) => d.id === id));
  const { update, remove, create } = useDecks();
  const show = useToast((s) => s.show);
  const imageRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);
  const lang = useSettings((s) => s.imageLang);
  if (!deck) return <Header title="デッキが見つかりません" back={() => navigate("/deck")} />;
  const cards = deckCards(deck, byId);
  const check = checkDeck(deck, byId);

  const savePng = async () => {
    if (!imageRef.current) return;
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
      download(`${deck.name}.png`, await (await fetch(url)).blob(), "image/png");
      show("画像を保存しました");
    } catch {
      show("画像を作れませんでした", "error");
    } finally {
      setExporting(false);
    }
  };

  const share = async () => {
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

        <div className="neu rounded-3xl p-3">
          <div className="grid grid-cols-5 gap-2">
            {Array.from({ length: DECK_SIZE }, (_, i) => cards[i]).map((c, i) =>
              c ? (
                <Pressable key={i} onTap={() => navigate(`/card/${c.id}`)} label={c.nameJa} className="rounded-md shadow-[1px_2px_4px_rgb(150_165_185/0.5)]">
                  <Thumb card={c} />
                </Pressable>
              ) : (
                <div key={i} className="neu-in aspect-[367/512] rounded-md" />
              ),
            )}
          </div>
        </div>

        <button type="button" onClick={() => navigate(`/deck/${deck.id}/edit`)} className="btn-ok w-full rounded-full py-4 text-lg">
          デッキを編集
        </button>

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

        <div className={`rounded-2xl p-4 text-sm font-bold ${check.ok ? "bg-[#dff4f1] text-accent-deep" : "bg-[#fdf1d8] text-[#8a5c0c]"}`}>
          {check.ok ? "✓ このデッキでバトルできます" : check.problems.map((p) => <div key={p}>・{p}</div>)}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button type="button" disabled={!cards.length || exporting} onClick={savePng} className={btn}>
            {exporting ? "画像を作成中…" : "画像として保存"}
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

      <div style={{ position: "fixed", left: -10000, top: 0 }} aria-hidden>
        <DeckImage ref={imageRef} deck={deck} cards={cards} />
      </div>
    </div>
  );
}

function DeckImage({ deck, cards, ref }: { deck: Deck; cards: AppCard[]; ref: React.Ref<HTMLDivElement> }) {
  const lang = useSettings((s) => s.imageLang);
  return (
    <div ref={ref} style={{ width: 1000, padding: 28, background: "#e6ecf3", color: "#3d4757", fontFamily: "'M PLUS Rounded 1c', sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
        <div style={{ fontSize: 30, fontWeight: 800, flex: 1 }}>{deck.name}</div>
        {deck.energy.map((t) => (
          <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 18, fontWeight: 700 }}>
            <EnergyIcon type={t} size="lg" />
            {TYPE_JA[t]}
          </span>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, padding: 16, borderRadius: 24, background: "#eef2f7", boxShadow: "6px 6px 14px rgba(176,189,206,.55), -6px -6px 14px #fff" }}>
        {cards.map((c, i) => (
          <img key={i} data-id={c.id} src={thumbUrl(c, lang)} alt={c.nameJa} style={{ width: "100%", aspectRatio: "367/512", borderRadius: 8, objectFit: "cover" }} />
        ))}
      </div>
      <div style={{ marginTop: 12, fontSize: 13, color: "#8794a7", textAlign: "right", fontWeight: 700 }}>ポケポケ検索</div>
    </div>
  );
}

// ---------------- 共有URLから ----------------

export function SharePage({ code }: { code: string }) {
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
      <Header title={`共有デッキ: ${shared.name}`} />
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
            <Pressable key={i} onTap={() => navigate(`/card/${c.id}`)} label={c.nameJa}>
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
            navigate("/deck");
          }}
        >
          マイデッキに保存
        </button>
      </div>
    </div>
  );
}
