// PC（横幅1024px以上）の画面: カード一覧・カード詳細・デッキを横に並べ、ページを切り替えずに検索と構築ができる
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { DetailPane } from "../components/detail.tsx";
import { EnergyIcon, Pressable, Thumb, Toast } from "../components/ui.tsx";
import { useData } from "../context.tsx";
import { checkDeck, DECK_SIZE, download, toFile } from "../deck.ts";
import { openCard } from "../detail.ts";
import { parseHash, useNav } from "../nav.ts";
import { RouteContext, navigate, useHash } from "../router.ts";
import { useDecks, useSettings, useToast, type Deck } from "../store.ts";
import { deckCards, DeckList, EnergyZone, IMPORT_ACCEPT, SharePage, useDeckExport, useImportDeckFile } from "./DeckPage.tsx";
import { SearchPage } from "./SearchPage.tsx";
import { SettingsPage } from "./SettingsPage.tsx";
import { cardName, useLang, useT } from "../i18n.ts";

export function Desktop() {
  const hash = useHash();
  const { base, sync } = useNav();
  useLayoutEffect(() => sync(hash), [hash]);
  const { parts } = parseHash(hash);
  const select = useDecks((s) => s.select);

  // #/deck/<id>… はデッキを選ぶだけ（一覧は検索の列のまま）
  useEffect(() => {
    if (parts[0] === "deck") {
      if (parts[1]) select(parts[1]);
      navigate(base.search.replace(/^#/, ""), { replace: true });
    }
  }, [hash]);

  // 「/」で検索欄へ
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key !== "/" || t.closest("input, textarea, select")) return;
      e.preventDefault();
      document.querySelector<HTMLInputElement>("#pool-column input[type=search]")?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const deck = useDecks((s) => s.decks.find((d) => d.id === s.currentId) ?? s.decks[0]);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const id of deck?.cards ?? []) m.set(id, (m.get(id) ?? 0) + 1);
    return m;
  }, [deck]);
  const closeModal = () => navigate(base.search.replace(/^#/, ""));
  const t = useT();

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <header className="flex shrink-0 items-center gap-4 px-5 py-2.5">
        <button type="button" onClick={() => navigate("/")} className="text-lg font-extrabold tracking-wider">
          POKÉPOKE LAB
        </button>
        <span className="text-xs font-bold text-muted">{t("ふだんの言葉でカードを探す ・ 「/」で検索欄へ", "Find cards in plain words ・ press “/” to search")}</span>
        <div className="flex-1" />
        <button type="button" onClick={() => navigate("/settings")} className="neu-sm neu-press rounded-full px-4 py-1.5 text-xs font-extrabold text-muted">
          {t("設定", "Settings")}
        </button>
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(360px,27vw)_minmax(330px,25vw)] gap-3 px-3 pb-3">
        <section id="pool-column" className="neu min-h-0 overflow-y-auto rounded-3xl" aria-label={t("カード一覧", "Cards")}>
          <RouteContext.Provider value={base.search}>
            <SearchPage wide counts={counts} />
          </RouteContext.Provider>
        </section>
        <section className="neu min-h-0 overflow-hidden rounded-3xl" aria-label={t("カード詳細", "Card details")}>
          <DetailPane />
        </section>
        <section className="neu min-h-0 overflow-y-auto rounded-3xl" aria-label={t("デッキ", "Deck")}>
          <DeckColumn deck={deck} />
        </section>
      </div>

      {parts[0] === "settings" && (
        <Modal title={t("設定", "Settings")} onClose={closeModal}>
          <SettingsPage embedded />
        </Modal>
      )}
      {parts[0] === "share" && (
        <Modal title={t("共有されたデッキ", "Shared deck")} onClose={closeModal}>
          <SharePage code={parts[1] ?? ""} embedded />
        </Modal>
      )}
      <Toast />
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const t = useT();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label={t("閉じる", "Close")} className="absolute inset-0 bg-[#3d4757]/35" onClick={onClose} />
      <div className="pop-in relative flex max-h-[88dvh] w-full max-w-2xl flex-col rounded-3xl bg-canvas shadow-2xl">
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <h2 className="text-lg font-extrabold">{title}</h2>
          <button type="button" onClick={onClose} className="neu-sm neu-press flex h-8 w-8 items-center justify-center rounded-full text-muted" aria-label={t("閉じる", "Close")}>
            ✕
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto pb-4">{children}</div>
      </div>
    </div>
  );
}

/** 右の列: デッキの切り替え・中身・エネルギー・書き出し */
function DeckColumn({ deck }: { deck?: Deck }) {
  const { byId } = useData();
  const { decks, create, select, update, remove } = useDecks();
  const { deckView, setDeckView } = useSettings();
  const show = useToast((s) => s.show);
  const fileRef = useRef<HTMLInputElement>(null);
  const { savePng, share, exporting, image } = useDeckExport(deck);
  const cards = deck ? deckCards(deck, byId) : [];
  const check = deck ? checkDeck(deck, byId) : undefined;
  const t = useT();
  const lang = useLang();

  const onImport = useImportDeckFile();
  const small = "neu-sm neu-press rounded-full px-3 py-1.5 text-xs font-extrabold disabled:opacity-40";
  const btn = "neu-sm neu-press rounded-2xl py-2 text-xs font-extrabold disabled:opacity-40";

  return (
    <div className="space-y-3 p-4">
      <div className="flex items-center gap-2">
        <select
          value={deck?.id ?? ""}
          onChange={(e) => select(e.target.value)}
          aria-label={t("デッキを選ぶ", "Choose deck")}
          className="neu-in min-w-0 flex-1 rounded-full px-3 py-2 text-sm font-extrabold outline-none"
        >
          {!decks.length && <option value="">{t("デッキがありません", "No decks")}</option>}
          {decks.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}（{d.cards.length}/{DECK_SIZE}）
            </option>
          ))}
        </select>
        <button type="button" onClick={() => create()} className={`${small} text-accent-deep`}>
          {t("＋ 新規", "＋ New")}
        </button>
        <button type="button" onClick={() => fileRef.current?.click()} className={`${small} text-muted`}>
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
      </div>

      {!deck ? (
        <div className="neu-in flex flex-col items-center gap-3 rounded-2xl p-8 text-center text-sm font-bold text-muted">
          <p>{t("カード詳細の「＋ デッキに追加」で、ここにデッキができます", "Use “＋ Add to deck” on a card to start a deck here")}</p>
          <button type="button" onClick={() => create()} className="btn-ok rounded-full px-5 py-2 text-sm">
            {t("新しいデッキを作る", "New deck")}
          </button>
        </div>
      ) : (
        <>
          <input
            value={deck.name}
            onChange={(e) => update(deck.id, { name: e.target.value })}
            className="neu-in w-full rounded-full px-4 py-2 text-sm font-extrabold outline-none"
            aria-label={t("デッキ名", "Deck name")}
          />
          <div className="flex items-center gap-2">
            <span className={`text-sm font-extrabold ${cards.length === DECK_SIZE ? "text-accent-deep" : "text-muted"}`}>
              {cards.length}/{DECK_SIZE}{t(" 枚", "")}
            </span>
            {deck.energy.map((e) => (
              <EnergyIcon key={e} type={e} size="sm" />
            ))}
            <div className="flex-1" />
            <div className="neu-in flex rounded-full p-0.5 text-xs font-bold" role="tablist" aria-label={t("表示", "View")}>
              {(["grid", "list"] as const).map((v) => (
                <button key={v} type="button" role="tab" aria-selected={deckView === v} onClick={() => setDeckView(v)} className={`rounded-full px-3 py-1 ${deckView === v ? "bg-white text-accent shadow" : "text-muted"}`}>
                  {v === "grid" ? t("カード", "Cards") : t("リスト", "List")}
                </button>
              ))}
            </div>
          </div>

          {deckView === "list" ? (
            <DeckList cards={cards} />
          ) : (
            <div className="neu-in grid grid-cols-5 gap-1.5 rounded-2xl p-2.5">
              {Array.from({ length: DECK_SIZE }, (_, i) => cards[i]).map((c, i) =>
                c ? (
                  <Pressable key={`${c.id}-${i}`} onTap={() => openCard(c.id)} onLongPress={() => { useDecks.getState().removeCard(deck.id, c.id); show(t(`「${c.nameJa}」を1枚外しました`, `Removed one ${c.nameEn}`)); }} label={t(`${c.nameJa}（長押しで外す）`, `${cardName(c, lang)} (long-press to remove)`)} className="pop-in rounded-[4px] shadow-[1px_2px_3px_rgb(150_165_185/0.5)]">
                    <Thumb card={c} className="rounded-[4px]" />
                  </Pressable>
                ) : (
                  <div key={i} className="flex aspect-[367/512] items-center justify-center rounded-[4px] border border-dashed border-[#c5cfdb] text-sm text-[#b8c3d1]">
                    ＋
                  </div>
                ),
              )}
            </div>
          )}

          <EnergyZone deck={deck} />

          {check && (
            <div className={`rounded-2xl px-3 py-2.5 text-xs font-bold ${check.ok ? "bg-[#dff4f1] text-accent-deep" : "bg-[#fdf1d8] text-[#8a5c0c]"}`}>
              {check.ok ? t("✓ このデッキでバトルできます", "✓ This deck is ready to battle") : check.problems.map((p) => <div key={p}>・{p}</div>)}
            </div>
          )}

          <div className="grid grid-cols-3 gap-2">
            <button type="button" disabled={!cards.length || exporting} onClick={savePng} className={btn}>
              {exporting ? t("作成中…", "Creating…") : t("画像で保存", "Save image")}
            </button>
            <button type="button" disabled={!cards.length} onClick={share} className={btn}>
              {t("共有URL", "Share URL")}
            </button>
            <button type="button" onClick={() => download(`${deck.name}.json`, JSON.stringify(toFile([deck]), null, 1))} className={btn}>
              {t("JSON書き出し", "Export JSON")}
            </button>
            <button type="button" onClick={() => create(t(`${deck.name}のコピー`, `${deck.name} (copy)`), { cards: [...deck.cards], energy: [...deck.energy] })} className={btn}>
              {t("複製", "Duplicate")}
            </button>
            <button type="button" onClick={() => download("pokepoke-decks.json", JSON.stringify(toFile(decks), null, 1))} className={btn}>
              {t("全デッキ書き出し", "Export all")}
            </button>
            <button
              type="button"
              onClick={() => {
                if (confirm(t(`「${deck.name}」を削除しますか？`, `Delete “${deck.name}”?`))) remove(deck.id);
              }}
              className={`${btn} text-danger`}
            >
              {t("削除", "Delete")}
            </button>
          </div>
          {image}
        </>
      )}
    </div>
  );
}
