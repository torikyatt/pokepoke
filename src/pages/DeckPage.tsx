import { toPng } from "html-to-image";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PoolFab, PoolGrid, PoolToolbar, QueryBox, usePoolResults } from "../components/pool.tsx";
import { EnergyIcon, ENERGY_COLOR, energyLetter, Header, IconDeck, Pressable, Thumb } from "../components/ui.tsx";
import { useData } from "../context.tsx";
import { largeUrl, thumbUrl } from "../data/load.ts";
import { useSettings } from "../store.ts";
import { canAdd, checkDeck, DECK_SIZE, decodeShare, download, encodeShare, fromFile, guessEnergy, MAX_ENERGY, MAX_SAME_NAME, toFile } from "../deck.ts";
import { navigate } from "../router.ts";
import { openCard } from "../detail.ts";
import { useNav } from "../nav.ts";
import { useDecks, useToast, type Deck } from "../store.ts";
import type { AppCard, EnergyType } from "../types.ts";
import { useQueryConds } from "./SearchPage.tsx";
import { mainPrint, packLabel, PrintLine, SetBadge, useMultiPackSets } from "../components/prints.tsx";
import { cardName, useLang, useT } from "../i18n.ts";
import { deckFromImage, qrImage, shareUrlOf } from "../deck-qr.ts";

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

/** 「読み込み」: JSON の書き出しファイルか、デッキの画像（QR コード入り）から取り込む */
export function useImportDeckFile() {
  const { byId } = useData();
  const importDecks = useDecks((s) => s.importDecks);
  const show = useToast((s) => s.show);
  const t = useT();
  return async (file: File) => {
    try {
      if (file.type.startsWith("image/")) {
        const d = await deckFromImage(file);
        if (!d) return show(t("画像からデッキのQRコードが見つかりませんでした", "No deck QR code found in the image"), "error");
        importDecks([{ name: d.name, energy: d.energy, cards: d.cards.filter((id) => byId.has(id)) }]);
        return show(t(`「${d.name}」を画像から読み込みました`, `Imported “${d.name}” from the image`));
      }
      const n = importDecks(fromFile(JSON.parse(await file.text()), byId));
      show(t(`${n} 個のデッキを読み込みました`, `Imported ${n} deck${n === 1 ? "" : "s"}`));
    } catch (e) {
      show(e instanceof Error ? e.message : t("読み込めませんでした", "Couldn't import"), "error");
    }
  };
}
/** 読み込みで選べるファイル（書き出したJSONと、デッキの画像） */
export const IMPORT_ACCEPT = "application/json,.json,image/*";

export function DeckListPage() {
  const { byId } = useData();
  const { decks, create, select } = useDecks();
  const fileRef = useRef<HTMLInputElement>(null);
  const t = useT();
  const onImport = useImportDeckFile();
  return (
    <div>
      <Header
        title={t("デッキ", "Decks")}
        right={
          <>
            <button type="button" className="neu-sm neu-press rounded-full px-3 py-1.5 text-xs font-bold text-muted" onClick={() => fileRef.current?.click()}>
              {t("読み込み", "Import")}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept={IMPORT_ACCEPT}
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
                {d.energy.map((e) => (
                  <EnergyIcon key={e} type={e} size="sm" />
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
          {t("新しいデッキを作る", "New deck")}
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
  const t = useT();
  const lang = useLang();
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

  if (!deck) return <Header title={t("デッキが見つかりません", "Deck not found")} back={() => navigate("/deck")} />;
  const full = deck.cards.length >= DECK_SIZE;

  return (
    <div className="pb-28">
      <div className="sticky top-0 z-30 bg-canvas/95 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 backdrop-blur">
        <div className="neu rounded-3xl p-3">
          <div className="scrollbar-none -mx-1 snap-x snap-mandatory overflow-x-auto px-1 pb-1">
          <div className="grid grid-cols-10 gap-1.5" style={{ width: `${(1000 / SLOT_VISIBLE[slotSize]).toFixed(2)}%` }}>
            {Array.from({ length: DECK_SIZE }, (_, i) => cards[i]).map((c, i) =>
              c ? (
                <Pressable key={`${c.id}-${i}`} onTap={() => openCard(c.id)} onLongPress={() => { removeCard(deck.id, c.id); show(t(`「${c.nameJa}」を1枚外しました`, `Removed one ${c.nameEn}`)); }} label={t(`${c.nameJa}（長押しで外す）`, `${cardName(c, lang)} (long-press to remove)`)} className="pop-in snap-start rounded-[4px] shadow-[1px_2px_3px_rgb(150_165_185/0.5)]">
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
            {slotSize !== "s" && <span className="mr-auto">{t("← 横にスクロール →", "← scroll →")}</span>}
            <span className="mr-1">{t("枠の大きさ", "Slot size")}</span>
            {(["s", "m", "l"] as const).map((v) => (
              <button key={v} type="button" aria-pressed={slotSize === v} onClick={() => setSlotSize(v)} className={`h-6 w-7 rounded-full ${slotSize === v ? "bg-accent text-white" : "neu-in"}`}>
                {lang === "en" ? { s: "S", m: "M", l: "L" }[v] : { s: "小", m: "中", l: "大" }[v]}
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
        <p className="mb-2 text-center text-[11px] font-bold text-muted">{t("タップで詳細 ・ 長押しで追加 ・ 上の枠を長押しで外す", "Tap for details ・ long-press to add ・ long-press a slot above to remove")}</p>
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
        aria-label={t("編集を終える", "Done editing")}
        title={t("編集を終える", "Done editing")}
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
  const t = useT();
  const savePng = async () => {
    if (!deck || !imageRef.current) return;
    setExporting(true);
    try {
      // オンラインなら高解像度画像、取れなければサムネイルで書き出す（SPEC 5.3）
      const imgs = [...imageRef.current.querySelectorAll<HTMLImageElement>("img[data-id]")];
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
              // 大きい画像は自前で置いたもの（同じサイト）なら使える。外部の画像しか無ければサムネイルで書き出す
              const big = largeUrl(card, lang);
              if (!/^https?:/.test(big)) img.src = big;
              else if (navigator.onLine) {
                img.crossOrigin = "anonymous";
                img.src = big;
              } else fallback();
            }),
        ),
      );
      // Webフォントは別オリジンなので取り込まない（端末のフォントで描く）
      const opts = { pixelRatio: 2, backgroundColor: "#e6ecf3", skipFonts: true };
      // iPhone・Mac の Safari（iPhone ではどのブラウザも同じ仕組み）は、1回目の画像化で画像の取り込みが間に合わず、
      // 一部のカードが空白になることがある。一度空振りで描いてから本番を描く
      if (navigator.vendor === "Apple Computer, Inc.") await toPng(imageRef.current, opts);
      const url = await toPng(imageRef.current, opts);
      setPreview(url);
    } catch {
      show(t("画像を作れませんでした", "Couldn't create the image"), "error");
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
        show(t("共有URLをコピーしました", "Share URL copied"));
      }
    } catch {
      prompt(t("このURLをコピーしてください", "Copy this URL"), url);
    }
  };

  const image = deck && (
    <>
      <div style={{ position: "fixed", left: -10000, top: 0 }} aria-hidden>
        <DeckImage ref={imageRef} deck={deck} cards={deckCards(deck, byId)} qr={qrImage(shareUrlOf(deck))} />
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
  const t = useT();
  const lang = useLang();
  if (!deck) return <Header title={t("デッキが見つかりません", "Deck not found")} back={() => navigate("/deck")} />;
  const cards = deckCards(deck, byId);
  const check = checkDeck(deck, byId);

  const btn = "neu neu-press rounded-2xl py-3 text-sm font-extrabold disabled:opacity-40";
  return (
    <div>
      <Header title={t("デッキ", "Deck")} back={() => navigate("/deck")} />
      <div className="mx-auto max-w-3xl space-y-4 px-4 pb-8">
        <input
          value={deck.name}
          onChange={(e) => update(deck.id, { name: e.target.value })}
          className="neu-in w-full rounded-full px-4 py-2.5 text-base font-extrabold outline-none"
          aria-label={t("デッキ名", "Deck name")}
        />

        <div className="flex items-center justify-between">
          <span className="text-sm font-extrabold text-muted">
            {cards.length}/{DECK_SIZE}{t(" 枚", "")}
          </span>
          <div className="neu-in flex rounded-full p-0.5 text-xs font-bold" role="tablist" aria-label={t("表示", "View")}>
            {(["grid", "list"] as const).map((v) => (
              <button key={v} type="button" role="tab" aria-selected={deckView === v} onClick={() => setDeckView(v)} className={`rounded-full px-4 py-1.5 ${deckView === v ? "bg-white text-accent shadow" : "text-muted"}`}>
                {v === "grid" ? t("カード", "Cards") : t("リスト", "List")}
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
                  <Pressable key={i} onTap={() => openCard(c.id)} label={cardName(c, lang)} className="rounded-md shadow-[1px_2px_4px_rgb(150_165_185/0.5)]">
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
          {t("デッキを編集", "Edit deck")}
        </button>

        <EnergyZone deck={deck} />

        <div className={`rounded-2xl p-4 text-sm font-bold ${check.ok ? "bg-[#dff4f1] text-accent-deep" : "bg-[#fdf1d8] text-[#8a5c0c]"}`}>
          {check.ok ? t("✓ このデッキでバトルできます", "✓ This deck is ready to battle") : check.problems.map((p) => <div key={p}>・{p}</div>)}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button type="button" disabled={!cards.length || exporting} onClick={savePng} className={btn}>
            {exporting ? t("画像を作成中…", "Creating image…") : t("画像で保存", "Save as image")}
          </button>
          <button type="button" disabled={!cards.length} onClick={share} className={btn}>
            {t("共有URL", "Share URL")}
          </button>
          <button type="button" onClick={() => download(`${deck.name}.json`, JSON.stringify(toFile([deck]), null, 1))} className={btn}>
            {t("書き出し（JSON）", "Export (JSON)")}
          </button>
          <button
            type="button"
            onClick={() => {
              const nid = create(t(`${deck.name}のコピー`, `${deck.name} (copy)`), { cards: [...deck.cards], energy: [...deck.energy] });
              navigate(`/deck/${nid}`);
            }}
            className={btn}
          >
            {t("複製", "Duplicate")}
          </button>
          <button
            type="button"
            onClick={() => {
              const all = useDecks.getState().decks;
              download("pokepoke-decks.json", JSON.stringify(toFile(all), null, 1));
            }}
            className={btn}
          >
            {t("全デッキを書き出し", "Export all decks")}
          </button>
          <button
            type="button"
            onClick={() => {
              if (confirm(t(`「${deck.name}」を削除しますか？`, `Delete “${deck.name}”?`))) {
                remove(deck.id);
                navigate("/deck");
              }
            }}
            className={`${btn} text-danger`}
          >
            {t("削除", "Delete")}
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
  const t = useT();
  return (
    <div className="neu rounded-3xl p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <h2 className="text-sm font-extrabold whitespace-nowrap text-muted">{t(`エネルギー（${MAX_ENERGY}タイプまで）`, `Energy (up to ${MAX_ENERGY} types)`)}</h2>
        <button type="button" className="ml-auto text-xs font-bold whitespace-nowrap text-accent-deep" onClick={() => update(deck.id, { energy: guessEnergy(deck, byId) })}>
          {t("デッキから自動設定", "Set from deck")}
        </button>
      </div>
      {/* 画面の幅にかかわらず8タイプを1列に並べる（狭い画面では丸が小さくなる） */}
      <div className="grid grid-cols-8 gap-1.5">
        {ZONE_TYPES.map((ty) => {
          const on = deck.energy.includes(ty);
          return (
            <button
              key={ty}
              type="button"
              aria-pressed={on}
              onClick={() => {
                if (on) update(deck.id, { energy: deck.energy.filter((x) => x !== ty) });
                else if (deck.energy.length < MAX_ENERGY) update(deck.id, { energy: [...deck.energy, ty] });
                else show(t(`エネルギーは${MAX_ENERGY}タイプまで`, `Up to ${MAX_ENERGY} Energy types`), "error");
              }}
              className={`@container mx-auto w-full max-w-11 rounded-full p-[3px] transition ${on ? "ring-[3px] ring-accent" : "opacity-40"}`}
            >
              <EnergyIcon type={ty} size="fill" />
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
  const t = useT();
  const lang = useLang();
  const rows = [...new Map(cards.map((c) => [c.id, c])).values()].map((c) => ({ card: c, count: cards.filter((x) => x.id === c.id).length, main: mainPrint(c) }));
  // パックごとの枚数（いちばん手に入れやすい収録で数える）
  const byPack = new Map<string, { set: string; label: string; n: number }>();
  for (const r of rows) {
    const label = packLabel(r.main, data.sets, multi, lang);
    const key = `${r.main.set}|${label}`;
    const cur = byPack.get(key) ?? byPack.set(key, { set: r.main.set, label, n: 0 }).get(key)!;
    cur.n += r.count;
  }
  if (!rows.length) return <p className="neu rounded-3xl p-6 text-center text-sm font-bold text-muted">{t("まだカードがありません", "No cards yet")}</p>;
  return (
    <div className="space-y-3">
      <div className="neu rounded-3xl p-3">
        <h3 className="mb-2 text-xs font-extrabold text-muted">{t("出るパック", "Where to pull")}</h3>
        <div className="space-y-1.5">
          {[...byPack.values()]
            .sort((a, b) => b.n - a.n)
            .map((p) => (
              <div key={`${p.set}${p.label}`} className="flex items-center gap-1.5">
                <SetBadge set={p.set} />
                <span className="min-w-0 flex-1 truncate text-xs font-bold">{p.label}</span>
                <span className="text-xs font-extrabold tabular-nums">{t(`${p.n}枚`, `${p.n}`)}</span>
              </div>
            ))}
        </div>
      </div>
      <ul className="neu divide-y divide-line rounded-3xl px-3 py-1">
        {rows.map(({ card, count, main }) => {
          const others = [...new Set(card.prints.filter((p) => p !== main).map((p) => packLabel(p, data.sets, multi, lang)))].filter((l) => l !== packLabel(main, data.sets, multi, lang));
          return (
            <li key={card.id}>
              <Pressable onTap={() => openCard(card.id)} label={cardName(card, lang)} className="flex items-center gap-3 py-2 text-left">
                <div className="w-10 shrink-0">
                  <Thumb card={card} className="rounded-[4px]" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm font-extrabold">{cardName(card, lang)}</span>
                    <span className="shrink-0 rounded-full bg-badge px-2 py-0.5 text-xs font-extrabold text-white">×{count}</span>
                  </div>
                  <div className="mt-1">
                    <PrintLine p={main} />
                  </div>
                  {others.length > 0 && <div className="mt-0.5 truncate text-[10px] font-bold text-muted">{t("ほか: ", "Also: ")}{others.join(" / ")}</div>}
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
function DeckImage({ deck, cards, qr, ref }: { deck: Deck; cards: AppCard[]; qr: { url: string; size: number }; ref: React.Ref<HTMLDivElement> }) {
  const lang = useSettings((s) => s.imageLang);
  const uiLang = useLang();
  const t = useT();
  const rows = [...new Map(cards.map((c) => [c.id, c])).values()].map((c) => ({ card: c, n: cards.filter((x) => x.id === c.id).length }));
  const groups: [string, typeof rows][] = [
    [t("ポケモン", "Pokémon"), rows.filter((r) => r.card.kind === "pokemon")],
    [t("トレーナーズ", "Trainers"), rows.filter((r) => r.card.kind !== "pokemon")],
  ];
  // 画像にするときは影を使わない（iPhone の Safari では影が四角い灰色の塊になって写る）。
  // 文字もウェブフォントを使わない（画像にはウェブフォントを埋め込まないので、画面で測った幅とずれて折り返してしまう）
  const panel = { borderRadius: 24, background: "#f3f6fa", border: "2px solid #dbe3ee" };
  // 一覧の行の高さ: 左の20枠と同じ高さ（約 950px）から、QR コードと見出しの分を引いた中に収める
  const LIST_SPACE = 950 - (qr.size + 24) - 2 * 34;
  const rowH = Math.min(50, Math.floor(LIST_SPACE / Math.max(1, rows.length)));
  const rowFont = Math.min(19, Math.round(rowH * 0.45));
  const nowrap = { whiteSpace: "nowrap", flexShrink: 0 } as const;
  return (
    <div ref={ref} style={{ width: 1400, padding: 28, background: "#e6ecf3", color: "#3d4757", fontFamily: "'Hiragino Maru Gothic ProN', 'Hiragino Sans', 'Yu Gothic', 'Meiryo', system-ui, sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
        <div style={{ fontSize: 32, fontWeight: 800, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{deck.name}</div>
        {deck.energy.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px 6px 16px", ...panel, borderRadius: 999, ...nowrap }}>
            <span style={{ fontSize: 15, fontWeight: 800, color: "#8794a7", ...nowrap }}>{t("エネルギー", "Energy")}</span>
            {deck.energy.map((e) => (
              <span
                key={e}
                style={{
                  width: 30, height: 30, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 800, lineHeight: 1,
                  background: ENERGY_COLOR[e].bg, color: ENERGY_COLOR[e].fg, border: e === "colorless" ? "1px solid #d5dde7" : "none", ...nowrap,
                }}
              >
                {energyLetter(e, uiLang)}
              </span>
            ))}
          </div>
        )}
        <div style={{ fontSize: 22, fontWeight: 800, color: "#8794a7", ...nowrap }}>{cards.length}/{DECK_SIZE}</div>
      </div>
      <div style={{ display: "flex", gap: 20, alignItems: "stretch" }}>
        {/* 左: いつも20枠（足りないところは空き枠）。画像の大きさをデッキの中身で変えないため */}
        <div style={{ width: 900, flexShrink: 0, display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, padding: 16, ...panel }}>
          {Array.from({ length: DECK_SIZE }, (_, i) => cards[i]).map((c, i) =>
            c ? (
              <img key={i} data-id={c.id} src={thumbUrl(c, lang)} alt={cardName(c, uiLang)} style={{ width: "100%", aspectRatio: "367/512", borderRadius: 8, objectFit: "cover" }} />
            ) : (
              <div key={i} style={{ width: "100%", aspectRatio: "367/512", borderRadius: 8, border: "2px dashed #cfd8e3" }} />
            ),
          )}
        </div>
        {/* 右: カードの一覧と、その下にデッキの QR コード。左と同じ高さに収める（一覧が長ければ行を詰める） */}
        <div style={{ flex: 1, minWidth: 0, padding: "14px 18px", ...panel, display: "flex", flexDirection: "column" }}>
          <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
            {groups.map(([title, list]) =>
              list.length ? (
                <div key={title} style={{ marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 15, fontWeight: 800, color: "#8794a7", borderBottom: "2px solid #d5dde7", paddingBottom: 4, marginBottom: 4 }}>
                    <span style={nowrap}>{title}</span>
                    <span style={nowrap}>{t(`${list.reduce((a, r) => a + r.n, 0)}枚`, `${list.reduce((a, r) => a + r.n, 0)}`)}</span>
                  </div>
                  {list.map(({ card, n }) => (
                    <div key={card.id} style={{ display: "flex", alignItems: "center", gap: 10, height: rowH }}>
                      <img data-id={card.id} src={thumbUrl(card, lang)} alt="" style={{ height: rowH - 8, aspectRatio: "367/512", borderRadius: 3, objectFit: "cover", flexShrink: 0 }} />
                      <span style={{ flex: 1, minWidth: 0, fontSize: rowFont, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cardName(card, uiLang)}</span>
                      <span style={{ fontSize: rowFont, fontWeight: 800, ...nowrap }}>×{n}</span>
                    </div>
                  ))}
                </div>
              ) : null,
            )}
          </div>
          {/* デッキの QR コード（カメラで読み取るか、この画像を「読み込み」で選ぶと取り込める）。縮めずに1マスちょうどで描く */}
          <div style={{ display: "flex", alignItems: "flex-end", gap: 14, paddingTop: 10, borderTop: "2px solid #d5dde7" }}>
            <img src={qr.url} alt="" width={qr.size} height={qr.size} style={{ width: qr.size, height: qr.size, imageRendering: "pixelated", flexShrink: 0 }} />
            <div style={{ minWidth: 0, fontSize: 13, fontWeight: 700, color: "#7a8796", lineHeight: 1.55 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: "#5b6779" }}>{t("デッキコード", "Deck code")}</div>
              <div>{t("カメラで読み取るか、この画像をPOKÉPOKE INDEXの「読み込み」で選ぶと取り込めます", "Scan it, or choose this image in POKÉPOKE INDEX's “Import”, to import the deck")}</div>
            </div>
          </div>
        </div>
      </div>
      <div style={{ marginTop: 12, fontSize: 13, color: "#8794a7", textAlign: "right", fontWeight: 700, whiteSpace: "nowrap" }}>POKÉPOKE INDEX</div>
    </div>
  );
}

/** 作った画像を画面に出す。長押し（PCは右クリック）で保存できる */
function ImagePreview({ url, onClose, onDownload }: { url: string; onClose: () => void; onDownload: () => void }) {
  const t = useT();
  return createPortal(
    <div className="fixed inset-0 z-[70] flex flex-col items-center justify-center bg-[#3d4757]/60 p-3" role="dialog" aria-modal="true" aria-label={t("デッキの画像", "Deck image")}>
      <button type="button" aria-label={t("閉じる", "Close")} className="absolute inset-0" onClick={onClose} />
      <div className="pop-in relative flex max-h-full w-full max-w-4xl flex-col gap-2 rounded-3xl bg-panel p-3 shadow-2xl">
        <div className="flex items-center gap-2">
          <p className="min-w-0 flex-1 text-xs font-bold text-muted">{t("画像を長押し（PCは右クリック）して保存してください", "Long-press the image (right-click on PC) to save it")}</p>
          <button type="button" onClick={onClose} className="neu-sm neu-press flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted" aria-label={t("閉じる", "Close")}>
            ✕
          </button>
        </div>
        <img src={url} alt={t("デッキの画像", "Deck image")} className="min-h-0 w-full flex-1 rounded-xl object-contain" style={{ WebkitTouchCallout: "default" }} />
        <button type="button" onClick={onDownload} className="self-end text-[11px] font-bold text-accent-deep underline">
          {t("ファイルとしてダウンロード", "Download as file")}
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
  const t = useT();
  const lang = useLang();
  let shared: ReturnType<typeof decodeShare> | undefined;
  try {
    shared = decodeShare(code);
  } catch {
    shared = undefined;
  }
  if (!shared) return <Header title={t("共有URLを読めませんでした", "Couldn't read the share URL")} back={() => navigate("/deck")} />;
  const cards = deckCards(shared, byId);
  const check = checkDeck(shared, byId);
  return (
    <div>
      {embedded ? <h3 className="px-4 pb-3 text-base font-extrabold">{shared.name}</h3> : <Header title={t(`共有デッキ: ${shared.name}`, `Shared deck: ${shared.name}`)} />}
      <div className="mx-auto max-w-3xl space-y-4 px-4 pb-8">
        <div className="flex items-center gap-2">
          {shared.energy.map((e) => (
            <EnergyIcon key={e} type={e} size="lg" />
          ))}
          <span className="text-sm font-bold text-muted">{t(`${cards.length} 枚`, `${cards.length} cards`)}</span>
        </div>
        {!check.ok && <div className="text-xs font-bold text-[#8a5c0c]">{check.problems.join(" / ")}</div>}
        <div className="neu grid grid-cols-5 gap-2 rounded-3xl p-3">
          {cards.map((c, i) => (
            <Pressable key={i} onTap={() => openCard(c.id)} label={cardName(c, lang)}>
              <Thumb card={c} />
            </Pressable>
          ))}
        </div>
        <button
          type="button"
          className="btn-ok w-full rounded-full py-4 text-lg"
          onClick={() => {
            importDecks([{ name: shared!.name, energy: shared!.energy, cards: shared!.cards.filter((cid) => byId.has(cid)) }]);
            show(t("マイデッキに保存しました", "Saved to your decks"));
            navigate(embedded ? useNav.getState().base.search.slice(1) : "/deck");
          }}
        >
          {t("マイデッキに保存", "Save to my decks")}
        </button>
      </div>
    </div>
  );
}
