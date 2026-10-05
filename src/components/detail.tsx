// カード詳細の入れ物: スマホは下からせり上がるシート、PCは真ん中の列。
// どちらも上に「戻る・カード名・共有・✕」と、今のデッキの枚数を増減する −／＋ を置く
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useAddToDeck, useData } from "../context.tsx";
import { DECK_SIZE } from "../deck.ts";
import { backDetail, closeDetail, reopenDetail, setCloseAnimator, stepCard, takeScrollAnchor, useDetail } from "../detail.ts";
import { CardDetail } from "../pages/CardPage.tsx";
import { useDecks, useFavorites, useToast } from "../store.ts";
import type { AppCard } from "../types.ts";
import { IconHeart, Thumb } from "./ui.tsx";
import { cardName, useLang, useT } from "../i18n.ts";
import { isSingleFile } from "../data/load.ts";

/** お気に入りの登録・解除（カード名の横に置く小さなボタン） */
export function FavToggle({ card }: { card: AppCard }) {
  const on = useFavorites((s) => s.ids.includes(card.id));
  const toggle = useFavorites((s) => s.toggle);
  const show = useToast((s) => s.show);
  const t = useT();
  const nm = cardName(card, useLang());
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => {
        toggle(card.id);
        show(on ? t(`「${nm}」をお気に入りから外しました`, `Removed ${nm} from favorites`) : t(`「${nm}」をお気に入りに登録しました`, `Added ${nm} to favorites`));
      }}
      aria-label={on ? t("お気に入りから外す", "Remove from favorites") : t("お気に入りに追加", "Add to favorites")}
      title={on ? t("お気に入りから外す", "Remove from favorites") : t("お気に入りに追加", "Add to favorites")}
      className={`flex shrink-0 items-center gap-0.5 rounded-full px-2 py-1 text-[10px] font-extrabold transition active:scale-95 ${on ? "bg-[#ffe3e8] text-[#e5566a]" : "neu-sm text-muted"}`}
    >
      <IconHeart filled={on} className="h-3.5 w-3.5" />
      {on ? t("登録済み", "Favorited") : t("お気に入り", "Favorite")}
    </button>
  );
}

/** 今のデッキの −／＋（カード画像の横に置く。狭くても押しやすい大きさ） */
export function DeckButtons({ card }: { card: AppCard }) {
  const addToDeck = useAddToDeck();
  const deck = useDecks((s) => s.decks.find((d) => d.id === s.currentId) ?? s.decks[0]);
  const removeCard = useDecks((s) => s.removeCard);
  const show = useToast((s) => s.show);
  const n = deck?.cards.filter((id) => id === card.id).length ?? 0;
  const t = useT();
  const nm = cardName(card, useLang());
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          aria-label={t("デッキから1枚外す", "Remove one from deck")}
          disabled={!n}
          onClick={() => {
            removeCard(deck!.id, card.id);
            show(t(`「${nm}」を1枚外しました（${deck!.cards.length - 1}/${DECK_SIZE}）`, `Removed one ${nm} (${deck!.cards.length - 1}/${DECK_SIZE})`));
          }}
          className="neu-sm neu-press flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xl font-extrabold text-muted disabled:opacity-35"
        >
          −
        </button>
        <button type="button" onClick={() => addToDeck(card)} className="btn-ok flex h-10 min-w-0 flex-1 items-center justify-center gap-0.5 rounded-full px-2 text-xs tracking-normal whitespace-nowrap">
          <span className="text-lg leading-none">＋</span>{t("デッキに追加", "Add to deck")}
        </button>
      </div>
      <div className="truncate text-center text-[10px] font-bold text-muted">
        {deck ? (
          <>
            {t(`${deck.name}に `, `${deck.name}: `)}
            <span className={`text-sm tabular-nums ${n ? "text-accent-deep" : "text-ink"}`}>{n}</span>
            {t(` 枚（${deck.cards.length}/${DECK_SIZE}）`, ` (${deck.cards.length}/${DECK_SIZE})`)}
          </>
        ) : (
          t("デッキはまだありません", "No decks yet")
        )}
      </div>
    </div>
  );
}

function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} className="neu-sm neu-press flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted">
      {children}
    </button>
  );
}
const BackIcon = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-[2.5]" aria-hidden>
    <path d="m15 18-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ShareIcon = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-[2.3]" aria-hidden>
    <path d="M12 15V3m0 0L8 7m4-4 4 4M7 11H6a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-1" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** このカードのURLを共有（スマホは共有メニュー、ないときはコピー） */
function useShareCard() {
  const show = useToast((s) => s.show);
  const t = useT();
  const lang = useLang();
  return async (card: AppCard) => {
    // 公開しているサイトでは、カード名と画像がリンクのプレビューに出る共有用ページ（/c/<ID>）を渡す（scripts/share-pages.ts）
    const base = location.href.split("#")[0].replace(/[^/]*$/, "");
    const url = import.meta.env.DEV || isSingleFile ? `${location.href.split("#")[0]}#/card/${card.id}` : `${base}c/${card.id}`;
    const title = `${cardName(card, lang)} | POKÉPOKE INDECKS`;
    try {
      if (navigator.share) await navigator.share({ title, url });
      else {
        await navigator.clipboard.writeText(url);
        show(t("カードのURLをコピーしました", "Card URL copied"));
      }
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return; // 共有メニューを閉じただけ
      prompt(t("このURLをコピーしてください", "Copy this URL"), url);
    }
  };
}

/** 戻る（1枚前へ）・カード名・共有・✕（まとめて閉じる）。名前が真ん中に来るよう、左右を同じ幅にする */
function DetailHeader({ card }: { card?: AppCard }) {
  const { pos } = useDetail();
  const t = useT();
  const lang = useLang();
  const share = useShareCard();
  return (
    <div className="flex items-center gap-2">
      <div className="flex w-16 shrink-0">
        {pos > 0 && (
          <IconBtn label={t("1つ前のカードへ", "Previous card")} onClick={backDetail}>
            <BackIcon />
          </IconBtn>
        )}
      </div>
      <h2 className="min-w-0 flex-1 truncate text-center text-sm font-extrabold">
        {card && cardName(card, lang)}
      </h2>
      <div className="flex w-16 shrink-0 justify-end gap-2">
        {card && (
          <IconBtn label={t("このカードを共有", "Share this card")} onClick={() => share(card)}>
            <ShareIcon />
          </IconBtn>
        )}
        <IconBtn label={t("閉じる", "Close")} onClick={() => closeDetail()}>
          <span className="text-sm font-extrabold">✕</span>
        </IconBtn>
      </div>
    </div>
  );
}

/**
 * 詳細のスクロール位置:
 *   新しく開いたカード … いちばん上から（進化ラインから移ったときだけ、進化ラインを同じ高さに）
 *   戻る・進む・「最近見たカード」で開き直したとき … そのカードで見ていた位置へ
 * スクロールする枠はカードごとに作り直す（key）。前のカードのスクロール位置が残ったり、
 * iPhone で位置を変えた直後に描かれず真っ白になったりするのを避ける
 */
function useScrollMemory(ref: React.RefObject<HTMLDivElement | null>, key: string) {
  const mem = useRef(new Map<string, number>());
  const nav = useDetail((s) => s.nav);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const a = takeScrollAnchor();
    const target = a && el.querySelector<HTMLElement>(`[data-anchor="${a.name}"]`);
    if (a && target) {
      const align = () => (el.scrollTop = target.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop - a.top);
      align();
      requestAnimationFrame(align); // 後から高さが変わる欄があっても合わせ直す
      return;
    }
    const y = nav.kind === "history" ? (mem.current.get(key) ?? 0) : 0;
    if (y) el.scrollTop = y;
  }, [key, nav.seq]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const on = () => mem.current.set(key, el.scrollTop);
    el.addEventListener("scroll", on, { passive: true });
    return () => el.removeEventListener("scroll", on);
  }, [key]);
}

const HALF = 0.5; // 半分まで下げたときの位置（シートの高さに対する割合）
type SheetPos = "full" | "half" | "closed";
// 位置ごとの見た目。指で動かしている間は DOM を直接書き換え、離したらこの値に揃える（React と同じ文字列にする）
const SHEET_TRANSFORM: Record<SheetPos, string> = { full: "translate3d(0,0,0)", half: `translate3d(0,${HALF * 100}%,0)`, closed: "translate3d(0,105%,0)" };
const SHEET_DIM: Record<SheetPos, string> = { full: "1", half: "0", closed: "0" };
const SLOW = 0.3; // これより遅ければ「ゆっくり」（px/ms）
/** 真ん中あたりをゆっくり動かしている（ここで離すと半分の高さで止まる） */
const inHalfZone = (off: number, h: number, speed: number) => Math.abs(speed) <= SLOW && Math.abs(off - h * HALF) < h * 0.12;

/**
 * スマホ: 下からせり上がる詳細。下へスワイプで閉じる。
 * 速く・雑に払っても閉じる。半分の高さで止まるのは、ちょうど真ん中あたりでゆっくり離したときだけ（後ろの画面を見ながら使える）
 */
export function DetailSheet() {
  const { byId } = useData();
  const { stack, pos, open, snap } = useDetail();
  const id = stack[pos];
  const card = id ? byId.get(id) : undefined;
  const t = useT();
  const lang = useLang();
  const sheet = useRef<HTMLDivElement>(null);
  const backdrop = useRef<HTMLButtonElement>(null);
  const header = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const scrollKey = `${pos}:${id}`;
  useScrollMemory(content, scrollKey);
  // 中身は開く・閉じる・高さの切り替えでは描き直さない（閉じる動きが引っかからないように）。
  // −／＋ やお気に入りは、それぞれがストアを見て更新される
  const body = useMemo(() => id && <CardDetail id={id} actions={card && <DeckButtons card={card} />} fav={card && <FavToggle card={card} />} />, [id, card]);

  // いっぱいに開いている間は、後ろの画面がスクロールしないようにする
  const full = open && snap === "full";
  useEffect(() => {
    document.documentElement.style.overflow = full ? "hidden" : "";
  }, [full]);

  useEffect(() => {
    const el = sheet.current!;
    let startY = 0, startX = 0, startOff = 0, off = 0, lastY = 0, lastT = 0, v = 0;
    let decided = false, dragging = false, fromHeader = false;
    // 指に合わせて動かす（毎フレーム React を描き直すと重いので、見た目だけ直接変える）
    const follow = (y: number) => {
      off = y;
      el.style.transform = `translate3d(0,${y}px,0)`;
      const b = backdrop.current;
      if (b) b.style.opacity = String(Math.max(0, 1 - y / (el.offsetHeight * HALF)));
      // 真ん中あたりをゆっくり動かしている間は、シートのふちを光らせて「ここで離すと止まる」と知らせる
      const hint = inHalfZone(y, el.offsetHeight, v);
      if (hint !== (el.dataset.hint === "1")) {
        el.dataset.hint = hint ? "1" : "";
        if (hint) navigator.vibrate?.(8); // 振動できる端末では軽く
      }
    };
    const settle = (to: SheetPos) => {
      el.dataset.hint = "";
      el.style.transition = "";
      el.style.transform = SHEET_TRANSFORM[to];
      const b = backdrop.current;
      if (b) {
        b.style.transition = "";
        b.style.opacity = SHEET_DIM[to];
      }
      if (to === "closed") closeDetail();
      else useDetail.setState({ snap: to });
    };
    // 閉じる動き: 見た目だけ先に下ろし、動き終わってから閉じた状態にする（done）
    setCloseAnimator((done) => {
      el.style.transition = "";
      el.style.transform = SHEET_TRANSFORM.closed;
      const b = backdrop.current;
      if (b) {
        b.style.transition = "";
        b.style.opacity = "0";
      }
      // 下りている間は、幕もシートも触れないようにする（後ろの一覧のカードをすぐ押せるように）
      el.style.pointerEvents = "none";
      if (b) b.style.pointerEvents = "none";
      let finished = false;
      const stop = () => {
        finished = true;
        el.removeEventListener("transitionend", onDone);
        clearTimeout(timer);
        el.style.pointerEvents = "";
        if (b) b.style.pointerEvents = "";
      };
      const finish = () => {
        if (finished) return;
        stop();
        done();
      };
      const onDone = (e: TransitionEvent) => e.target === el && e.propertyName === "transform" && finish();
      el.addEventListener("transitionend", onDone);
      const timer = setTimeout(finish, 400); // 動きが無かったとき（もう下にあるときなど）
      return stop;
    });
    // 後ろの一覧が指を離したあとも滑っている（慣性スクロール中）と、iPhone は次のタッチを「止める」ために使い、
    // シートのボタンを押しても反応しない。シートに触れたら滑りを止め、タップが届かなかったら代わりに押す
    let pageMovedAt = 0;
    const onPageScroll = () => (pageMovedAt = performance.now());
    window.addEventListener("scroll", onPageScroll, { passive: true });
    let rescue = false, tapX = 0, tapY = 0, moved = false, synthAt = 0, nativeAt = 0;
    const onClickCapture = (e: MouseEvent) => {
      if (!e.isTrusted) return;
      nativeAt = performance.now();
      // 代わりに押したあとに、本物のタップも届いたら二重にならないよう捨てる
      if (nativeAt - synthAt < 600) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    el.addEventListener("click", onClickCapture, true);
    const onStart = (e: TouchEvent) => {
      const p = e.touches[0];
      rescue = performance.now() - pageMovedAt < 150;
      if (rescue) window.scrollTo(window.scrollX, window.scrollY); // 滑りを止める
      tapX = p.clientX;
      tapY = p.clientY;
      moved = false;
      startY = lastY = p.clientY;
      startX = p.clientX;
      lastT = e.timeStamp;
      v = 0;
      decided = dragging = false;
      fromHeader = !!header.current?.contains(e.target as Node);
      startOff = useDetail.getState().snap === "half" ? el.offsetHeight * HALF : 0;
    };
    const onMove = (e: TouchEvent) => {
      const p = e.touches[0];
      if (Math.abs(p.clientX - tapX) > 10 || Math.abs(p.clientY - tapY) > 10) moved = true;
      const dy = p.clientY - startY;
      const dx = p.clientX - startX;
      if (!decided) {
        if (Math.abs(dy) < 6 && Math.abs(dx) < 6) return;
        decided = true;
        const half = useDetail.getState().snap === "half";
        // 縦の動きで、つまみ部分か、半分の高さのときか、いちばん上まで戻した状態から下へ引いたら、シートを動かす
        dragging = Math.abs(dy) > Math.abs(dx) && (fromHeader || half || (dy > 0 && (content.current?.scrollTop ?? 0) <= 0));
        if (dragging) {
          el.style.transition = "none";
          if (backdrop.current) backdrop.current.style.transition = "none";
        }
      }
      if (!dragging) return;
      e.preventDefault();
      // 速さは直近の動きから（なめらかにするため、前の値と混ぜる）
      const dt = e.timeStamp - lastT;
      if (dt > 0) v = 0.6 * ((p.clientY - lastY) / dt) + 0.4 * v;
      lastY = p.clientY;
      lastT = e.timeStamp;
      follow(Math.max(0, startOff + dy));
    };
    const onEnd = (e: TouchEvent) => {
      if (rescue && !moved && !dragging) {
        rescue = false;
        const startedAt = performance.now();
        // 本物のタップが届かなかったときだけ、触れた場所のボタンを押す
        setTimeout(() => {
          if (nativeAt >= startedAt) return;
          const hit = document.elementFromPoint(tapX, tapY);
          const target = (hit?.closest("button, a, summary, label, input, [role=button], [role=tab]") ?? hit) as HTMLElement | null;
          if (target && el.contains(target)) {
            synthAt = performance.now();
            target.click();
          }
        }, 60);
      }
      if (!dragging) return;
      dragging = false;
      const h = el.offsetHeight;
      // 指を止めてから離したなら、速さは 0
      const speed = e.timeStamp - lastT > 90 ? 0 : v;
      if (speed > SLOW) settle("closed"); // 下へ払った（速さ px/ms）
      else if (speed < -SLOW) settle("full"); // 上へ払った
      else if (inHalfZone(off, h, speed)) settle("half"); // 真ん中あたりで離した
      else settle(off < h * HALF ? "full" : "closed");
    };
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    return () => {
      setCloseAnimator(undefined);
      window.removeEventListener("scroll", onPageScroll);
      el.removeEventListener("click", onClickCapture, true);
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, []);

  const at: SheetPos = !open ? "closed" : snap;
  return (
    <>
      <button
        ref={backdrop}
        type="button"
        tabIndex={-1}
        aria-label={t("閉じる", "Close")}
        onClick={() => closeDetail()}
        className={`fixed inset-0 z-[49] bg-[#3d4757]/35 will-change-[opacity] transition-opacity duration-300 ${full ? "" : "pointer-events-none"}`}
        style={{ opacity: SHEET_DIM[at] }}
      />
      <div
        ref={sheet}
        role="dialog"
        aria-modal={full}
        aria-hidden={!open}
        aria-label={card ? cardName(card, lang) : t("カード詳細", "Card details")}
        className={`group fixed inset-x-0 bottom-0 z-50 mx-auto flex h-[94dvh] max-w-3xl flex-col rounded-t-3xl bg-canvas shadow-[0_-6px_24px_rgb(61_71_87/0.22)] [backface-visibility:hidden] will-change-transform transition-transform duration-300 ease-[cubic-bezier(.2,.8,.2,1)] ${open ? "" : "pointer-events-none"}`}
        style={{ transform: SHEET_TRANSFORM[at] }}
      >
        {/* 半分で止まる位置の合図: ふちが水色にふわっと光る */}
        <div aria-hidden className="pointer-events-none absolute inset-0 z-10 rounded-t-3xl opacity-0 shadow-[0_-6px_34px_12px_rgb(120_200_255/0.75),inset_0_0_0_2px_rgb(150_215_255),inset_0_14px_22px_-12px_rgb(175_225_255/0.8)] transition-opacity duration-200 group-data-[hint=1]:opacity-100" />
        <div ref={header} className="shrink-0 px-3 pt-1 pb-1.5">
          <button type="button" aria-label={snap === "half" ? t("いっぱいに開く", "Expand") : t("半分に下げる", "Lower halfway")} onClick={() => useDetail.setState({ snap: snap === "half" ? "full" : "half" })} className="mx-auto block pt-0.5 pb-1">
            <span className="block h-1 w-10 rounded-full bg-[#c5cfdb] transition-all duration-150 group-data-[hint=1]:w-16 group-data-[hint=1]:bg-[#8fd3ff]" />
          </button>
          <DetailHeader card={card} />
        </div>
        <div key={scrollKey} ref={content} className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain border-t border-line pb-[calc(8rem+env(safe-area-inset-bottom))]">
          {body}
        </div>
      </div>
    </>
  );
}

/** 閉じた詳細のしまい場所。タップか上へスワイプで、最後に見ていたカードを履歴ごと開き直す */
export function DetailDock({ bottom }: { bottom: string }) {
  const { byId } = useData();
  const { stack, pos, open } = useDetail();
  const startY = useRef(0);
  const t = useT();
  const lang = useLang();
  const cards = stack
    .slice(0, pos + 1)
    .reverse()
    .slice(0, 3)
    .map((id) => byId.get(id))
    .filter((c): c is AppCard => !!c);
  if (open || !cards.length) return null;
  return (
    <button
      type="button"
      onClick={reopenDetail}
      onTouchStart={(e) => (startY.current = e.touches[0].clientY)}
      onTouchEnd={(e) => e.changedTouches[0].clientY - startY.current < -24 && reopenDetail()}
      aria-label={t(`最近見たカード「${cards[0].nameJa}」を開く`, `Open recently viewed: ${cards[0].nameEn}`)}
      className="neu neu-press pop-in fixed left-1/2 z-[47] flex max-w-[56vw] -translate-x-1/2 items-center gap-2 rounded-2xl border border-white/70 py-1.5 pr-2.5 pl-2"
      style={{ bottom }}
    >
      <span className="relative h-9 w-7 shrink-0">
        {cards
          .slice()
          .reverse()
          .map((c, i, arr) => {
            const k = arr.length - 1 - i; // 0 がいちばん手前
            return (
              <span key={`${c.id}-${k}`} className="absolute bottom-0 left-0 w-6 overflow-hidden rounded-[3px] shadow" style={{ transform: `translate(${k * 3}px, ${-k * 3}px) rotate(${k * 6}deg)`, zIndex: 3 - k }}>
                <Thumb card={c} className="rounded-[3px]" />
              </span>
            );
          })}
      </span>
      <span className="min-w-0 text-left leading-tight">
        <span className="block text-[9px] font-bold text-muted">{t("最近見たカード", "Recently viewed")}{pos > 0 ? t(`（${pos + 1}枚）`, ` (${pos + 1})`) : ""}</span>
        <span className="block truncate text-xs font-extrabold">{cardName(cards[0], lang)}</span>
      </span>
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-canvas text-[10px] text-muted">▲</span>
    </button>
  );
}

/**
 * 詳細を開いている間の下のボタン（「最近見たカード」と同じ場所・大きさ）。開いた一覧（検索結果・デッキ）の前・次のカードへ移る。
 *   左をタップ → 前のカード、右をタップ → 次のカード、真ん中 → 閉じる
 *   ボタンの上を左右にスワイプ → 指の動きに合わせて次々に移る（左へ動かすと次へ）
 */
export function DetailNav({ bottom }: { bottom: string }) {
  const { byId } = useData();
  const { open, list, listPos } = useDetail();
  const t = useT();
  const lang = useLang();
  const drag = useRef<{ x: number; steps: number; moved: boolean } | null>(null);
  const [shift, setShift] = useState(0); // スワイプ中のサムネイルのずれ（指についてくる感じ）
  if (!open) return null;
  const prev = listPos > 0 ? byId.get(list[listPos - 1]) : undefined;
  const next = listPos >= 0 && listPos < list.length - 1 ? byId.get(list[listPos + 1]) : undefined;
  const STEP = 30; // 1枚分のスワイプの長さ（px）
  const onDown = (e: React.PointerEvent) => {
    drag.current = { x: e.clientX, steps: 0, moved: false };
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || listPos < 0) return;
    const dx = e.clientX - d.x;
    if (!d.moved && Math.abs(dx) < 8) return;
    if (!d.moved) {
      d.moved = true;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
    const steps = Math.trunc(dx / STEP);
    if (steps !== d.steps) {
      stepCard(-(steps - d.steps)); // 左へ動かすと次のカードへ
      d.steps = steps;
    }
    setShift(Math.max(-STEP, Math.min(STEP, dx - steps * STEP)) * 0.5);
  };
  const onUp = () => {
    setShift(0);
    // スワイプしたあとのクリックは、タップとして扱わない
    if (drag.current?.moved) setTimeout(() => (drag.current = null), 0);
    else drag.current = null;
  };
  const tap = (f: () => void) => () => {
    if (drag.current?.moved) return;
    f();
  };
  const side = "flex h-full min-w-0 flex-1 items-center gap-1 px-1.5 text-muted disabled:opacity-30";
  const thumb = (c?: AppCard) => <span className="block w-6 shrink-0 overflow-hidden rounded-[3px] shadow">{c ? <Thumb card={c} className="rounded-[3px]" /> : <span className="block aspect-[367/512] bg-line" />}</span>;
  return (
    <div
      role="group"
      aria-label={t("前・次のカード", "Previous / next card")}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      className="neu pop-in fixed left-1/2 z-[52] flex h-12 w-[56vw] max-w-64 -translate-x-1/2 touch-none items-stretch overflow-hidden rounded-2xl border border-white/70 select-none"
      style={{ bottom }}
    >
      <button type="button" disabled={!prev} onClick={tap(() => stepCard(-1))} aria-label={prev ? t(`前のカード「${prev.nameJa}」`, `Previous: ${prev.nameEn}`) : t("前のカードはありません", "No previous card")} className={`${side} justify-start`}>
        <span className="text-base font-extrabold">‹</span>
        <span className="block shrink-0" style={{ transform: `translateX(${shift}px)` }}>{thumb(prev)}</span>
      </button>
      <button type="button" onClick={tap(() => closeDetail())} aria-label={t("閉じる", "Close")} className="flex w-14 shrink-0 flex-col items-center justify-center border-x border-line/70 text-muted active:bg-line/40">
        <span className="text-sm leading-none font-extrabold">✕</span>
        {listPos >= 0 && list.length > 1 && (
          <span className="mt-0.5 text-[9px] leading-none font-bold tabular-nums">
            {listPos + 1}/{list.length}
          </span>
        )}
      </button>
      <button type="button" disabled={!next} onClick={tap(() => stepCard(1))} aria-label={next ? t(`次のカード「${next.nameJa}」`, `Next: ${next.nameEn}`) : t("次のカードはありません", "No next card")} className={`${side} justify-end`}>
        <span className="block shrink-0" style={{ transform: `translateX(${shift}px)` }}>{thumb(next)}</span>
        <span className="text-base font-extrabold">›</span>
      </button>
          </div>
  );
}

/** PC: 真ん中の列の詳細 */
export function DetailPane() {
  const { byId } = useData();
  const { stack, pos, open } = useDetail();
  const id = open ? stack[pos] : undefined;
  const card = id ? byId.get(id) : undefined;
  const content = useRef<HTMLDivElement>(null);
  const scrollKey = `${pos}:${id}`;
  useScrollMemory(content, scrollKey);
  const t = useT();
  const lang = useLang();
  const last = byId.get(stack[pos]);
  return (
    <div className="flex h-full min-h-0 flex-col">
      {card ? (
        <div className="shrink-0 border-b border-line px-3 py-1.5">
          <DetailHeader card={card} />
        </div>
      ) : null}
      <div key={scrollKey} ref={content} className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
        {id ? (
          <CardDetail id={id} keepOpen actions={card && <DeckButtons card={card} />} fav={card && <FavToggle card={card} />} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center text-sm font-bold text-muted">
            <p className="whitespace-pre-line">{t("左の一覧のカードをクリックすると\nここに詳細が出ます", "Click a card in the list on the left\nto see its details here")}</p>
            {stack.length > 0 && (
              <button type="button" onClick={reopenDetail} className="neu-sm neu-press rounded-full px-4 py-2 text-ink">
                {t("最後に見たカードを開く", "Open last viewed card")}（{last && cardName(last, lang)}）
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
