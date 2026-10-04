// カード詳細の画像: 絵柄違い（同じ名前・同じ性能の別イラスト）を左右にスワイプして切り替える。PCは左右の矢印でも
import { useEffect, useRef, useState } from "react";
import { printImageUrl, thumbUrl } from "../data/load.ts";
import { useSettings } from "../store.ts";
import type { AppCard } from "../types.ts";
import { SetBadge, RARITY_JA } from "./prints.tsx";

export function PrintGallery({ card, index, onIndex }: { card: AppCard; index: number; onIndex: (i: number) => void }) {
  const lang = useSettings((s) => s.imageLang);
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
              alt={`${card.nameJa}（${pr.id.toUpperCase()}）`}
              onError={(e) => {
                // 日本語 → 英語 → 一覧のサムネイルの順に試す
                const img = e.currentTarget;
                const step = Number(img.dataset.fallback ?? 0);
                img.dataset.fallback = String(step + 1);
                if (step === 0) img.src = printImageUrl(pr, "en");
                else if (step === 1) img.src = thumbUrl(card, lang);
              }}
              className="aspect-[367/512] w-full shrink-0 snap-center rounded-xl bg-line object-cover"
            />
          ))}
        </div>
        {n > 1 && (
          <>
            <button type="button" aria-label="前の絵柄" onClick={() => go(-1)} disabled={index === 0} className="absolute top-1/2 left-1 hidden h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-sm font-extrabold text-ink shadow disabled:opacity-0 [@media(hover:hover)]:flex">
              ‹
            </button>
            <button type="button" aria-label="次の絵柄" onClick={() => go(1)} disabled={index === n - 1} className="absolute top-1/2 right-1 hidden h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-sm font-extrabold text-ink shadow disabled:opacity-0 [@media(hover:hover)]:flex">
              ›
            </button>
          </>
        )}
      </div>
      {n > 1 && (
        <div className="mt-1.5 space-y-1">
          <div className="flex justify-center gap-1" role="tablist" aria-label="絵柄">
            {card.prints.map((pr, i) => (
              <button
                key={pr.id}
                type="button"
                role="tab"
                aria-selected={i === index}
                aria-label={`${i + 1}枚目の絵柄`}
                onClick={() => onIndex(i)}
                className={`h-1.5 rounded-full transition-all ${i === index ? "w-4 bg-accent" : "w-1.5 bg-[#c5cfdb]"}`}
              />
            ))}
          </div>
          <div className="flex items-center justify-center gap-1 text-[10px] font-bold text-muted">
            <SetBadge set={p.set} />
            <span>{RARITY_JA[p.rarity] ?? p.rarity}</span>
            <span className="tabular-nums">
              {index + 1}/{n}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
