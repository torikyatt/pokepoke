import { useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { thumbUrls } from "../data/load.ts";
import { useNav, type Tab } from "../nav.ts";
import { useSettings, useToast } from "../store.ts";
import type { AppCard, EnergyType } from "../types.ts";
import { TYPE_JA } from "../types.ts";
import { cardName, typeName, useLang, useT } from "../i18n.ts";

const TYPE_STYLE: Record<EnergyType, string> = {
  grass: "bg-[#5cb85c] text-white",
  fire: "bg-[#e8574a] text-white",
  water: "bg-[#3d9be9] text-white",
  lightning: "bg-[#f2c831] text-[#5a4300]",
  psychic: "bg-[#a65fd1] text-white",
  fighting: "bg-[#c4703a] text-white",
  darkness: "bg-[#2f5a64] text-white",
  metal: "bg-[#8d99a6] text-white",
  dragon: "bg-[#c9a43a] text-white",
  colorless: "bg-white text-[#7a8796] ring-1 ring-[#d5dde7]",
};

/** 画像に書き出す用（Tailwind の影などを使わない、インラインの色） */
export const ENERGY_COLOR: Record<EnergyType, { bg: string; fg: string }> = {
  grass: { bg: "#5cb85c", fg: "#fff" }, fire: { bg: "#e8574a", fg: "#fff" }, water: { bg: "#3d9be9", fg: "#fff" },
  lightning: { bg: "#f2c831", fg: "#5a4300" }, psychic: { bg: "#a65fd1", fg: "#fff" }, fighting: { bg: "#c4703a", fg: "#fff" },
  darkness: { bg: "#2f5a64", fg: "#fff" }, metal: { bg: "#8d99a6", fg: "#fff" }, dragon: { bg: "#c9a43a", fg: "#fff" }, colorless: { bg: "#fff", fg: "#7a8796" },
};
export const energyLetter = (type: EnergyType, lang: "ja" | "en") => (lang === "en" ? EN_LETTER[type] : type === "colorless" ? "無" : type === "dragon" ? "竜" : TYPE_JA[type]);

const EN_LETTER: Record<EnergyType, string> = { grass: "G", fire: "R", water: "W", lightning: "L", psychic: "P", fighting: "F", darkness: "D", metal: "M", dragon: "N", colorless: "C" };

export function EnergyIcon({ type, size = "md" }: { type: EnergyType; size?: "sm" | "md" | "lg" | "xl" | "fill" }) {
  // fill: 置き場所いっぱいの大きさ（文字は枠の幅に合わせる。@container の中で使う）
  const s = { sm: "h-4 w-4 text-[9px]", md: "h-5 w-5 text-[11px]", lg: "h-7 w-7 text-sm", xl: "h-9 w-9 text-base", fill: "aspect-square w-full text-[45cqw]" }[size];
  const lang = useLang();
  // 英語はカードゲームの慣例の1文字（草=G 炎=R 水=W 雷=L 超=P 闘=F 悪=D 鋼=M ドラゴン=N 無色=C）
  const label = energyLetter(type, lang);
  return (
    <span title={typeName(type, lang)} className={`inline-flex shrink-0 items-center justify-center rounded-full font-extrabold leading-none shadow-sm ${s} ${TYPE_STYLE[type]}`}>
      {label}
    </span>
  );
}

export function Cost({ cost }: { cost: Partial<Record<EnergyType, number>> }) {
  const t = useT();
  const list = (Object.entries(cost) as [EnergyType, number][]).flatMap(([t, n]) => Array(n).fill(t) as EnergyType[]);
  list.sort((a, b) => (a === "colorless" ? 1 : 0) - (b === "colorless" ? 1 : 0));
  if (!list.length) return <span className="text-xs text-muted">{t("なし", "None")}</span>;
  return (
    <span className="inline-flex gap-0.5">
      {list.map((t, i) => (
        <EnergyIcon key={i} type={t} size="sm" />
      ))}
    </span>
  );
}

/** 丸い選択チップ（選ぶとティール色） */
export function Chip({ children, onClick, active, tone = "plain", title }: { children: ReactNode; onClick?: () => void; active?: boolean; tone?: "plain" | "match" | "text"; title?: string }) {
  const base = "inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold whitespace-nowrap transition";
  const cls = active
    ? "bg-accent text-white shadow-[inset_0_2px_4px_rgb(0_0_0/0.15)]"
    : tone === "match"
      ? "bg-[#dff4f1] text-accent-deep"
      : tone === "text"
        ? "bg-[#fdf1d8] text-[#9a6b12]"
        : "neu-sm text-ink";
  return onClick ? (
    <button type="button" title={title} onClick={onClick} className={`${base} ${cls} active:scale-95`} aria-pressed={active}>
      {children}
    </button>
  ) : (
    <span title={title} className={`${base} ${cls}`}>
      {children}
    </span>
  );
}

/** アプリと同じトグルスイッチ */
export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} className="flex items-center gap-2">
      {label && <span className="text-sm font-extrabold text-muted">{label}</span>}
      <span className={`relative h-8 w-14 rounded-full transition-colors ${on ? "bg-gradient-to-r from-accent-deep to-accent" : "neu-in"}`}>
        <span className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow-md transition-all ${on ? "left-7" : "left-1"}`} />
      </span>
    </button>
  );
}

/** 長押しとタップを分けて扱うボタン */
export function Pressable({ onTap, onLongPress, children, className = "", label }: { onTap?: (el: HTMLButtonElement) => void; onLongPress?: () => void; children: ReactNode; className?: string; label?: string }) {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const long = useRef(false);
  const start = useRef<{ x: number; y: number }>(undefined);
  const cancel = () => clearTimeout(timer.current);
  return (
    <button
      type="button"
      aria-label={label}
      className={`no-callout block w-full touch-manipulation transition-transform active:scale-[0.97] ${className}`}
      onPointerDown={(e) => {
        long.current = false;
        start.current = { x: e.clientX, y: e.clientY };
        if (!onLongPress) return;
        timer.current = setTimeout(() => {
          long.current = true;
          navigator.vibrate?.(25);
          onLongPress();
        }, 450);
      }}
      onPointerMove={(e) => {
        if (start.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 10) cancel();
      }}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onContextMenu={(e) => e.preventDefault()}
      onClick={(e) => {
        if (!long.current) onTap?.(e.currentTarget);
      }}
    >
      {children}
    </button>
  );
}

export function Thumb({ card, className = "" }: { card: AppCard; className?: string }) {
  const lang = useSettings((s) => s.imageLang);
  const uiLang = useLang();
  const urls = thumbUrls(card, lang);
  return (
    <img
      key={`${card.id}-${lang}`}
      src={urls[0]}
      alt={cardName(card, uiLang)}
      loading="lazy"
      decoding="async"
      draggable={false}
      width={160}
      height={223}
      className={`aspect-[367/512] w-full rounded-md bg-line object-cover ${className}`}
      onError={(e) => {
        // 読めなければ次の候補（日本語 → 英語、オンライン画像 → 埋め込み）
        const img = e.currentTarget;
        const i = Number(img.dataset.try ?? 0) + 1;
        img.dataset.try = String(i);
        if (urls[i]) img.src = urls[i];
      }}
    />
  );
}

/** 一覧のカード。左下に枚数タブ（アプリと同じ形） */
export function PoolCard({ card, count, maxed, onTap, onLongPress, compact }: { card: AppCard; count?: number; maxed?: boolean; onTap?: () => void; onLongPress?: () => void; compact?: boolean }) {
  const lang = useLang();
  return (
    <Pressable onTap={onTap} onLongPress={onLongPress} label={cardName(card, lang)} className="relative rounded-md shadow-[2px_3px_6px_rgb(150_165_185/0.45)]">
      <Thumb card={card} className={maxed ? "opacity-45" : ""} />
      {!!count && (
        <span className={`count-tab absolute bottom-0 left-0 flex w-[56%] items-center justify-center font-extrabold ${compact ? "h-[19%] text-sm" : "h-[17%] text-lg"}`}>
          {count}
        </span>
      )}
    </Pressable>
  );
}

export function Toast() {
  const { message, tone } = useToast();
  if (!message) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-32 z-[60] flex justify-center px-4">
      <div className={`pop-in rounded-full px-4 py-2 text-sm font-bold shadow-lg ${tone === "error" ? "bg-danger text-white" : "bg-badge text-white"}`}>{message}</div>
    </div>
  );
}

export function BottomNav() {
  const { active: tab, goTab } = useNav();
  const t = useT();
  const item = (key: Tab, label: string, _path: string, icon: ReactNode) => (
    <button type="button" onClick={() => goTab(key)} aria-current={tab === key ? "page" : undefined} className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-bold ${tab === key ? "text-accent" : "text-muted"}`}>
      {icon}
      {label}
    </button>
  );
  return (
    <nav className="neu fixed inset-x-0 bottom-0 z-[46] rounded-t-3xl pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto flex max-w-3xl">
        {item("search", t("カード", "Cards"), "/", <IconSearch />)}
        {item("deck", t("デッキ", "Decks"), "/deck", <IconDeck />)}
        {item("settings", t("設定", "Settings"), "/settings", <IconGear />)}
      </div>
    </nav>
  );
}

const svg = "h-6 w-6 fill-none stroke-current stroke-[2.2]";
export const IconSearch = ({ className = svg }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" strokeLinecap="round" />
  </svg>
);
export const IconDeck = ({ className = svg }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden>
    <rect x="5" y="4" width="12" height="16" rx="2" />
    <path d="M9 2h8a2 2 0 0 1 2 2v12" strokeLinecap="round" />
  </svg>
);
const IconGear = () => (
  <svg viewBox="0 0 24 24" className={svg} aria-hidden>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" strokeLinecap="round" />
  </svg>
);
export const IconHeart = ({ filled, className = "h-5 w-5" }: { filled?: boolean; className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden>
    <path d="M12 20.5s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.7c0 5.6-7.5 10.2-7.5 10.2Z" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
  </svg>
);
export const IconSort = () => (
  <svg viewBox="0 0 32 32" className="h-8 w-8" aria-hidden>
    <rect x="5" y="4" width="15" height="21" rx="2.5" fill="none" stroke="currentColor" strokeWidth="2.4" />
    <path d="M9 10h7M9 14h4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    <path d="M21 17v11M27 17v11M18.5 20.5h11M18.5 25h11" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
  </svg>
);

export const IconHistory = () => (
  <svg viewBox="0 0 32 32" className="h-8 w-8" aria-hidden>
    <path d="M6.5 16A10 10 0 1 0 9.4 8.9" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    <path d="M9.6 4.2v5h-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M16 10.5V16l3.8 2.6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** サイト名（INDEX＝索引 と DECKS を掛けている）。ロゴでは DECKS に色を付け、サブで「TCG Pocket 用」と分かるようにする */
export const BRAND = "POKÉPOKE INDECKS";
export function Logo({ className = "text-lg" }: { className?: string }) {
  return (
    <span className="inline-flex flex-col items-start leading-none">
      <span className={`font-extrabold tracking-wider text-ink ${className}`} aria-label={BRAND}>
        POKÉPOKE IN<span className="text-accent-deep">DECKS</span>
      </span>
      <span className="mt-1 text-[9px] font-extrabold tracking-[0.18em] text-muted">for Pokémon TCG Pocket</span>
    </span>
  );
}

export function Header({ title, back, right }: { title: ReactNode; back?: boolean | (() => void); right?: ReactNode }) {
  const t = useT();
  return (
    <header className="sticky top-0 z-30 bg-canvas/95 px-4 pt-3 pb-2 backdrop-blur">
      <div className="neu flex items-center gap-2 rounded-2xl px-3 py-2.5">
        {back && (
          <button type="button" onClick={() => (typeof back === "function" ? back() : history.back())} className="neu-sm neu-press -ml-0.5 flex h-8 w-8 items-center justify-center rounded-full text-muted" aria-label={t("戻る", "Back")}>
            <svg viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current stroke-[2.5]" aria-hidden>
              <path d="m15 18-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
        <h1 className="min-w-0 flex-1 truncate text-base font-extrabold">{title}</h1>
        {right}
      </div>
    </header>
  );
}

/** 画面下からせり上がるシート（PCでは画面の真ん中に出す）。
 *  backdrop-blur などの中に置かれても画面全体に出るよう、body の直下に描く */
/** 下から出るシート。上の帯（つまみ・タイトル）を下へスワイプしても閉じられる。z: 重なりの順（カード詳細を上に重ねたいときは下げる） */
export function Sheet({ open, onClose, title, children, footer, z = "z-50" }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; z?: string }) {
  const t = useT();
  const panel = useRef<HTMLDivElement>(null);
  const backdrop = useRef<HTMLButtonElement>(null);
  const drag = useRef<{ y: number; dy: number; lastY: number; lastT: number; v: number } | null>(null);
  if (!open) return null;
  const move = (dy: number, animate: boolean) => {
    const p = panel.current, b = backdrop.current;
    if (p) {
      p.style.transition = animate ? "transform 200ms cubic-bezier(.2,.8,.2,1)" : "none";
      p.style.transform = dy ? `translateY(${dy}px)` : "";
    }
    if (b) {
      b.style.transition = animate ? "opacity 200ms" : "none";
      b.style.opacity = String(Math.max(0, 1 - dy / ((p?.offsetHeight ?? 600) * 0.8)));
    }
  };
  const onDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button")) return; // ✕ はそのまま押せる
    drag.current = { y: e.clientY, dy: 0, lastY: e.clientY, lastT: e.timeStamp, v: 0 };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dt = e.timeStamp - d.lastT;
    if (dt > 0) d.v = (e.clientY - d.lastY) / dt;
    d.lastY = e.clientY;
    d.lastT = e.timeStamp;
    d.dy = Math.max(0, e.clientY - d.y);
    move(d.dy, false);
  };
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    // 下へ払った・半分近くまで下ろした → 閉じる（下まで下ろしてから）。それ以外は元の位置へ
    const speed = e.timeStamp - d.lastT > 90 ? 0 : d.v;
    if (speed > 0.5 || d.dy > Math.min(160, (panel.current?.offsetHeight ?? 400) * 0.35)) {
      move(panel.current?.offsetHeight ?? 800, true);
      setTimeout(onClose, 180);
    } else move(0, true);
  };
  return createPortal(
    <div className={`fixed inset-0 ${z} flex flex-col justify-end lg:items-center lg:justify-center lg:p-6`} role="dialog" aria-modal="true" aria-label={title}>
      <button ref={backdrop} type="button" aria-label={t("閉じる", "Close")} className="absolute inset-0 bg-[#3d4757]/35" onClick={onClose} />
      <div ref={panel} className="sheet-up relative mx-auto flex max-h-[88dvh] w-full max-w-3xl flex-col rounded-t-3xl bg-panel shadow-2xl lg:max-w-2xl lg:rounded-3xl">
        <div onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} className="cursor-grab touch-none select-none">
          <span aria-hidden className="mx-auto mt-2 block h-1 w-10 rounded-full bg-[#c5cfdb] lg:hidden" />
          <div className="flex items-center justify-between px-5 pt-2 pb-2 lg:pt-4">
            <h2 className="text-lg font-extrabold">{title}</h2>
            <button type="button" onClick={onClose} className="neu-sm neu-press flex h-8 w-8 items-center justify-center rounded-full text-muted" aria-label={t("閉じる", "Close")}>
              ✕
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">{children}</div>
        {footer && <div className="border-t border-line px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
