// カード詳細の画像: 絵柄違い（同じ名前・同じ性能の別イラスト）を左右にスワイプして切り替える。PCは左右の矢印でも。
// タップ（クリック）すると画面いっぱいに拡大して見られる
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { printImageUrl, thumbUrl } from "../data/load.ts";
import { useSettings } from "../store.ts";
import type { AppCard } from "../types.ts";
import { SetBadge, rarityLabel } from "./prints.tsx";
import { cardName, useLang, useT } from "../i18n.ts";

export function PrintGallery({ card, index, onIndex }: { card: AppCard; index: number; onIndex: (i: number) => void }) {
  const lang = useSettings((s) => s.imageLang);
  const uiLang = useLang();
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const n = card.prints.length;
  // 外から（収録の一覧をタップしたとき）指定された絵柄へスクロールする
  const fromScroll = useRef(false);
  const mounted = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // 開いた直後は何もしない（進化ラインから移ってきたときのスクロール位置を崩さない）
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    if (fromScroll.current) {
      fromScroll.current = false;
      return;
    }
    el.scrollTo({ left: index * el.clientWidth, behavior: "smooth" });
    // 下の「収録」から選んだときは、画像が見えるところまで戻す
    if (el.getBoundingClientRect().bottom < 0 || el.getBoundingClientRect().top > window.innerHeight) el.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [index]);

  const onScroll = () => {
    const el = ref.current!;
    const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
    if (i !== index) {
      fromScroll.current = true;
      onIndex(i);
    }
  };
  const go = (d: number) => onIndex(Math.min(n - 1, Math.max(0, index + d)));
  const p = card.prints[index] ?? card.prints[0];
  const [zoom, setZoom] = useState(false);

  return (
    <div>
      <div className="group relative rounded-xl shadow-[3px_5px_12px_rgb(150_165_185/0.55)]">
        <div ref={ref} onScroll={onScroll} className="scrollbar-none flex snap-x snap-mandatory overflow-x-auto rounded-xl" style={{ touchAction: "pan-x pan-y" }}>
          {card.prints.map((pr, i) => (
            <img
              key={`${pr.id}-${lang}`}
              src={printImageUrl(pr, lang)}
              loading={i === 0 ? "eager" : "lazy"}
              draggable={false}
              alt={`${cardName(card, uiLang)}（${pr.id.toUpperCase()}）`}
              onClick={() => setZoom(true)}
              onError={(e) => {
                // 日本語 → 英語 → 一覧のサムネイルの順に試す
                const img = e.currentTarget;
                const step = Number(img.dataset.fallback ?? 0);
                img.dataset.fallback = String(step + 1);
                if (step === 0) img.src = printImageUrl(pr, "en");
                else if (step === 1) img.src = thumbUrl(card, lang);
              }}
              className="aspect-[367/512] w-full shrink-0 cursor-zoom-in snap-center rounded-xl bg-line object-cover"
            />
          ))}
        </div>
        {n > 1 && (
          <>
            <button type="button" aria-label={t("前の絵柄", "Previous art")} onClick={() => go(-1)} disabled={index === 0} className="absolute top-1/2 left-1 hidden h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-sm font-extrabold text-ink shadow disabled:opacity-0 [@media(hover:hover)]:flex">
              ‹
            </button>
            <button type="button" aria-label={t("次の絵柄", "Next art")} onClick={() => go(1)} disabled={index === n - 1} className="absolute top-1/2 right-1 hidden h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-sm font-extrabold text-ink shadow disabled:opacity-0 [@media(hover:hover)]:flex">
              ›
            </button>
          </>
        )}
      </div>
      {n > 1 && (
        <div className="mt-1.5 space-y-1">
          <div className="flex justify-center gap-1" role="tablist" aria-label={t("絵柄", "Artwork")}>
            {card.prints.map((pr, i) => (
              <button
                key={pr.id}
                type="button"
                role="tab"
                aria-selected={i === index}
                aria-label={t(`${i + 1}枚目の絵柄`, `Art ${i + 1}`)}
                onClick={() => onIndex(i)}
                className={`h-1.5 rounded-full transition-all ${i === index ? "w-4 bg-accent" : "w-1.5 bg-[#c5cfdb]"}`}
              />
            ))}
          </div>
          <div className="flex items-center justify-center gap-1 text-[10px] font-bold text-muted">
            <SetBadge set={p.set} />
            <span>{rarityLabel(p.rarity, uiLang)}</span>
            <span className="tabular-nums">
              {index + 1}/{n}
            </span>
          </div>
        </div>
      )}
      {zoom && <ZoomView card={card} index={index} onIndex={onIndex} onClose={() => setZoom(false)} />}
    </div>
  );
}

/**
 * 拡大表示。画面いっぱいに大きい画像を出す。絵柄違いは左右にスワイプ（PCは矢印・←→キー）。
 * どこかをタップ・✕・Esc で閉じる。詳細シートは動かす（transform）ので、その外（body 直下）に出す
 */
function ZoomView({ card, index, onIndex, onClose }: { card: AppCard; index: number; onIndex: (i: number) => void; onClose: () => void }) {
  const lang = useSettings((s) => s.imageLang);
  const uiLang = useLang();
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const n = card.prints.length;
  const [i, setI] = useState(index);
  const [shown, setShown] = useState(false);
  // 開いたときは、いま見ている絵柄から
  useLayoutEffect(() => {
    const el = ref.current;
    if (el) el.scrollLeft = index * el.clientWidth;
    requestAnimationFrame(() => setShown(true));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const close = () => {
    onIndex(i); // 拡大中に切り替えた絵柄を、詳細にも反映する
    setShown(false);
    setTimeout(onClose, 150);
  };
  const go = (d: number) => {
    const el = ref.current;
    const to = Math.min(n - 1, Math.max(0, i + d));
    if (el) el.scrollTo({ left: to * el.clientWidth, behavior: "smooth" });
  };
  useEffect(() => {
    // 拡大中のキーは拡大表示だけで使う（後ろの画面の Esc などは動かさない）
    const onKey = (e: KeyboardEvent) => {
      if (!["Escape", "ArrowLeft", "ArrowRight"].includes(e.key)) return;
      e.stopImmediatePropagation();
      e.preventDefault();
      if (e.key === "Escape") close();
      else go(e.key === "ArrowLeft" ? -1 : 1);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });
  return createPortal(
    <div
      role="dialog"
      aria-modal
      aria-label={t("カード画像の拡大", "Card image")}
      onClick={close}
      className={`fixed inset-0 z-[80] bg-[#1d2430]/85 transition-opacity duration-150 ${shown ? "opacity-100" : "opacity-0"}`}
    >
      <div
        ref={ref}
        onScroll={() => {
          const el = ref.current!;
          setI(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
        }}
        className="scrollbar-none flex h-full snap-x snap-mandatory overflow-x-auto"
      >
        {card.prints.map((pr) => (
          <div key={pr.id} className="flex h-full w-full shrink-0 snap-center items-center justify-center p-4 pt-[max(3.5rem,env(safe-area-inset-top))] pb-[max(3rem,env(safe-area-inset-bottom))]">
            <img
              src={printImageUrl(pr, lang)}
              alt={`${cardName(card, uiLang)}（${pr.id.toUpperCase()}）`}
              draggable={false}
              onError={(e) => {
                const img = e.currentTarget;
                if (!img.dataset.fallback) {
                  img.dataset.fallback = "1";
                  img.src = printImageUrl(pr, "en");
                }
              }}
              className={`aspect-[367/512] max-h-full max-w-full rounded-[4%] object-contain shadow-2xl transition-transform duration-150 ${shown ? "scale-100" : "scale-95"}`}
            />
          </div>
        ))}
      </div>
      <button type="button" aria-label={t("閉じる", "Close")} className="absolute top-[max(0.75rem,env(safe-area-inset-top))] right-3 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-lg font-extrabold text-ink shadow">
        ✕
      </button>
      {n > 1 && (
        <>
          <button type="button" aria-label={t("前の絵柄", "Previous art")} onClick={(e) => (e.stopPropagation(), go(-1))} disabled={i === 0} className="absolute top-1/2 left-3 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-xl font-extrabold text-ink shadow disabled:opacity-0 [@media(hover:hover)]:flex">
            ‹
          </button>
          <button type="button" aria-label={t("次の絵柄", "Next art")} onClick={(e) => (e.stopPropagation(), go(1))} disabled={i === n - 1} className="absolute top-1/2 right-3 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-xl font-extrabold text-ink shadow disabled:opacity-0 [@media(hover:hover)]:flex">
            ›
          </button>
          <div className="pointer-events-none absolute inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] text-center text-xs font-bold text-white/80 tabular-nums">
            {i + 1} / {n}
          </div>
        </>
      )}
    </div>,
    document.body,
  );
}
