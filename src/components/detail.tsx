// カード詳細の入れ物: スマホは下からせり上がるシート、PCは真ん中の列。
// どちらも上に「戻る・カード名・✕」と、今のデッキの枚数を増減する −／＋ を置く
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useAddToDeck, useData } from "../context.tsx";
import { DECK_SIZE } from "../deck.ts";
import { backDetail, closeDetail, reopenDetail, takeScrollAnchor, useDetail } from "../detail.ts";
import { CardDetail } from "../pages/CardPage.tsx";
import { useDecks, useFavorites, useToast } from "../store.ts";
import type { AppCard } from "../types.ts";
import { IconHeart, Thumb } from "./ui.tsx";

/** お気に入りの登録・解除（カード名の横に置く小さなボタン） */
export function FavToggle({ card }: { card: AppCard }) {
  const on = useFavorites((s) => s.ids.includes(card.id));
  const toggle = useFavorites((s) => s.toggle);
  const show = useToast((s) => s.show);
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => {
        toggle(card.id);
        show(on ? `「${card.nameJa}」をお気に入りから外しました` : `「${card.nameJa}」をお気に入りに登録しました`);
      }}
      aria-label={on ? "お気に入りから外す" : "お気に入りに追加"}
      title={on ? "お気に入りから外す" : "お気に入りに追加"}
      className={`flex shrink-0 items-center gap-0.5 rounded-full px-2 py-1 text-[10px] font-extrabold transition active:scale-95 ${on ? "bg-[#ffe3e8] text-[#e5566a]" : "neu-sm text-muted"}`}
    >
      <IconHeart filled={on} className="h-3.5 w-3.5" />
      {on ? "登録済み" : "お気に入り"}
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
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          aria-label="デッキから1枚外す"
          disabled={!n}
          onClick={() => {
            removeCard(deck!.id, card.id);
            show(`「${card.nameJa}」を1枚外しました（${deck!.cards.length - 1}/${DECK_SIZE}）`);
          }}
          className="neu-sm neu-press flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xl font-extrabold text-muted disabled:opacity-35"
        >
          −
        </button>
        <button type="button" onClick={() => addToDeck(card)} className="btn-ok flex h-10 min-w-0 flex-1 items-center justify-center gap-0.5 rounded-full px-2 text-xs tracking-normal whitespace-nowrap">
          <span className="text-lg leading-none">＋</span>デッキに追加
        </button>
      </div>
      <div className="truncate text-center text-[10px] font-bold text-muted">
        {deck ? (
          <>
            {deck.name}に <span className={`text-sm tabular-nums ${n ? "text-accent-deep" : "text-ink"}`}>{n}</span> 枚（{deck.cards.length}/{DECK_SIZE}）
          </>
        ) : (
          "デッキはまだありません"
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

/** 戻る（1枚前へ）・カード名・✕（まとめて閉じる） */
function DetailHeader({ card }: { card?: AppCard }) {
  const { pos } = useDetail();
  return (
    <div className="flex items-center gap-2">
      {pos > 0 ? (
        <IconBtn label="1つ前のカードへ" onClick={backDetail}>
          <BackIcon />
        </IconBtn>
      ) : (
        <span className="w-7 shrink-0" />
      )}
      <h2 className="min-w-0 flex-1 truncate text-center text-sm font-extrabold">
        {card?.nameJa}
        {pos > 0 && <span className="ml-1.5 text-[10px] font-bold text-muted">{pos + 1}枚目</span>}
      </h2>
      <IconBtn label="閉じる" onClick={() => closeDetail()}>
        <span className="text-sm font-extrabold">✕</span>
      </IconBtn>
    </div>
  );
}

/** 開いていたカードの見ていた位置（1つ戻ったときに元の位置へ） */
function useScrollMemory(ref: React.RefObject<HTMLDivElement | null>, key: string) {
  const mem = useRef(new Map<string, number>());
  const cur = useRef(key);
  useLayoutEffect(() => {
    const el = ref.current;
    cur.current = key;
    if (!el) return;
    // 進化ラインから移ってきたときは、進化ラインが前と同じ高さに来るように
    const a = takeScrollAnchor();
    const target = a && el.querySelector<HTMLElement>(`[data-anchor="${a.name}"]`);
    if (a && target) {
      const align = () => (el.scrollTop = target.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop - a.top);
      align();
      requestAnimationFrame(align); // 後から高さが変わる欄があっても合わせ直す
      return;
    }
    el.scrollTo(0, mem.current.get(key) ?? 0);
  }, [key]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const on = () => mem.current.set(cur.current, el.scrollTop);
    el.addEventListener("scroll", on, { passive: true });
    return () => el.removeEventListener("scroll", on);
  }, []);
}

const HALF = 0.5; // 半分まで下げたときの位置（シートの高さに対する割合）

/** スマホ: 下からせり上がる詳細。下へスワイプで閉じる。途中で離すと半分の高さで止まり、後ろの画面を見ながら使える */
export function DetailSheet() {
  const { byId } = useData();
  const { stack, pos, open, snap } = useDetail();
  const id = stack[pos];
  const card = id ? byId.get(id) : undefined;
  const sheet = useRef<HTMLDivElement>(null);
  const header = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const dragRef = useRef<number | null>(null);
  useScrollMemory(content, `${pos}:${id}`);

  // いっぱいに開いている間は、後ろの画面がスクロールしないようにする
  const full = open && snap === "full";
  useEffect(() => {
    document.documentElement.style.overflow = full ? "hidden" : "";
  }, [full]);

  useEffect(() => {
    const el = sheet.current!;
    let startY = 0, startX = 0, startOff = 0, lastY = 0, lastT = 0, v = 0;
    let decided = false, dragging = false, fromHeader = false;
    const set = (off: number | null) => {
      dragRef.current = off;
      setDrag(off);
    };
    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      startY = lastY = t.clientY;
      startX = t.clientX;
      lastT = e.timeStamp;
      v = 0;
      decided = dragging = false;
      fromHeader = !!header.current?.contains(e.target as Node);
      startOff = useDetail.getState().snap === "half" ? el.offsetHeight * HALF : 0;
    };
    const onMove = (e: TouchEvent) => {
      const t = e.touches[0];
      const dy = t.clientY - startY;
      const dx = t.clientX - startX;
      if (!decided) {
        if (Math.abs(dy) < 6 && Math.abs(dx) < 6) return;
        decided = true;
        const half = useDetail.getState().snap === "half";
        // 縦の動きで、つまみ部分か、半分の高さのときか、いちばん上まで戻した状態から下へ引いたら、シートを動かす
        dragging = Math.abs(dy) > Math.abs(dx) && (fromHeader || half || (dy > 0 && (content.current?.scrollTop ?? 0) <= 0));
      }
      if (!dragging) return;
      e.preventDefault();
      if (e.timeStamp > lastT) v = (t.clientY - lastY) / (e.timeStamp - lastT);
      lastY = t.clientY;
      lastT = e.timeStamp;
      set(Math.max(0, startOff + dy));
    };
    const onEnd = () => {
      if (!dragging) return;
      dragging = false;
      const h = el.offsetHeight;
      const proj = (dragRef.current ?? 0) + v * 220;
      set(null);
      if (proj > h * 0.75) closeDetail();
      else useDetail.setState({ snap: proj > h * 0.22 ? "half" : "full" });
    };
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, []);

  const h = sheet.current?.offsetHeight ?? window.innerHeight;
  const transform = drag !== null ? `translateY(${drag}px)` : !open ? "translateY(105%)" : snap === "half" ? `translateY(${HALF * 100}%)` : "translateY(0)";
  const dim = drag !== null ? Math.max(0, 1 - drag / (h * HALF)) : full ? 1 : 0;
  return (
    <>
      <button
        type="button"
        tabIndex={-1}
        aria-label="閉じる"
        onClick={() => closeDetail()}
        className={`fixed inset-0 z-[49] bg-[#3d4757]/35 transition-opacity duration-300 ${dim > 0 && open ? "" : "pointer-events-none"}`}
        style={{ opacity: open ? dim : 0 }}
      />
      <div
        ref={sheet}
        role="dialog"
        aria-modal={full}
        aria-hidden={!open}
        aria-label={card?.nameJa ?? "カード詳細"}
        className={`fixed inset-x-0 bottom-0 z-50 mx-auto flex h-[94dvh] max-w-3xl flex-col rounded-t-3xl bg-canvas shadow-[0_-6px_24px_rgb(61_71_87/0.22)] ${drag === null ? "transition-transform duration-300 ease-[cubic-bezier(.2,.8,.2,1)]" : ""} ${open ? "" : "pointer-events-none"}`}
        style={{ transform }}
      >
        <div ref={header} className="shrink-0 px-3 pt-1 pb-1.5">
          <button type="button" aria-label={snap === "half" ? "いっぱいに開く" : "半分に下げる"} onClick={() => useDetail.setState({ snap: snap === "half" ? "full" : "half" })} className="mx-auto block pt-0.5 pb-1">
            <span className="block h-1 w-10 rounded-full bg-[#c5cfdb]" />
          </button>
          <DetailHeader card={card} />
        </div>
        <div ref={content} className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain border-t border-line pb-[max(2rem,env(safe-area-inset-bottom))]">
          {id && <CardDetail key={id} id={id} actions={card && <DeckButtons card={card} />} fav={card && <FavToggle card={card} />} />}
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
      aria-label={`最近見たカード「${cards[0].nameJa}」を開く`}
      className="neu pop-in fixed left-1/2 z-[47] flex max-w-[52vw] -translate-x-1/2 items-end gap-2 rounded-t-2xl px-3 pt-3 pb-1.5"
      style={{ bottom }}
    >
      <span className="absolute top-1 left-1/2 h-1 w-8 -translate-x-1/2 rounded-full bg-[#c5cfdb]" />
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
        <span className="block text-[9px] font-bold text-muted">最近見たカード{pos > 0 ? `（${pos + 1}枚）` : ""}</span>
        <span className="block truncate text-xs font-extrabold">{cards[0].nameJa}</span>
      </span>
      <span className="self-center text-xs text-muted">▲</span>
    </button>
  );
}

/** PC: 真ん中の列の詳細 */
export function DetailPane() {
  const { byId } = useData();
  const { stack, pos, open } = useDetail();
  const id = open ? stack[pos] : undefined;
  const card = id ? byId.get(id) : undefined;
  const content = useRef<HTMLDivElement>(null);
  useScrollMemory(content, `${pos}:${id}`);
  return (
    <div className="flex h-full min-h-0 flex-col">
      {card ? (
        <div className="shrink-0 border-b border-line px-3 py-1.5">
          <DetailHeader card={card} />
        </div>
      ) : null}
      <div ref={content} className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
        {id ? (
          <CardDetail key={id} id={id} keepOpen actions={card && <DeckButtons card={card} />} fav={card && <FavToggle card={card} />} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center text-sm font-bold text-muted">
            <p>
              左の一覧のカードをクリックすると
              <br />
              ここに詳細が出ます
            </p>
            {stack.length > 0 && (
              <button type="button" onClick={reopenDetail} className="neu-sm neu-press rounded-full px-4 py-2 text-ink">
                最後に見たカードを開く（{byId.get(stack[pos])?.nameJa}）
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
