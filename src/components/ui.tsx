import { useRef, type ReactNode } from "react";
import { thumbUrl } from "../data/load.ts";
import { navigate, useRoute } from "../router.ts";
import { useDecks, useToast } from "../store.ts";
import type { AppCard, EnergyType } from "../types.ts";
import { TYPE_JA } from "../types.ts";

const TYPE_STYLE: Record<EnergyType, string> = {
  grass: "bg-green-600 text-white",
  fire: "bg-red-600 text-white",
  water: "bg-sky-600 text-white",
  lightning: "bg-yellow-400 text-slate-900",
  psychic: "bg-purple-600 text-white",
  fighting: "bg-orange-700 text-white",
  darkness: "bg-teal-900 text-white",
  metal: "bg-slate-500 text-white",
  dragon: "bg-amber-600 text-white",
  colorless: "bg-slate-200 text-slate-800",
};

export function EnergyIcon({ type, size = "md" }: { type: EnergyType; size?: "sm" | "md" | "lg" }) {
  const s = size === "sm" ? "h-4 w-4 text-[9px]" : size === "lg" ? "h-7 w-7 text-sm" : "h-5 w-5 text-[11px]";
  const label = type === "colorless" ? "無" : type === "dragon" ? "竜" : TYPE_JA[type];
  return (
    <span title={TYPE_JA[type]} className={`inline-flex shrink-0 items-center justify-center rounded-full font-bold leading-none ${s} ${TYPE_STYLE[type]}`}>
      {label}
    </span>
  );
}

export function Cost({ cost }: { cost: Partial<Record<EnergyType, number>> }) {
  const list = (Object.entries(cost) as [EnergyType, number][]).flatMap(([t, n]) => Array(n).fill(t) as EnergyType[]);
  list.sort((a, b) => (a === "colorless" ? 1 : 0) - (b === "colorless" ? 1 : 0));
  if (!list.length) return <span className="text-xs text-slate-400">なし</span>;
  return (
    <span className="inline-flex gap-0.5">
      {list.map((t, i) => (
        <EnergyIcon key={i} type={t} size="sm" />
      ))}
    </span>
  );
}

export function Chip({ children, onClick, active, tone = "slate", title }: { children: ReactNode; onClick?: () => void; active?: boolean; tone?: "slate" | "blue" | "amber"; title?: string }) {
  const tones = {
    slate: active ? "bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900" : "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
    blue: "bg-blue-100 text-blue-900 dark:bg-blue-900/60 dark:text-blue-100",
    amber: "bg-amber-100 text-amber-900 dark:bg-amber-900/50 dark:text-amber-100",
  };
  const cls = `inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs whitespace-nowrap ${tones[tone]}`;
  return onClick ? (
    <button type="button" title={title} onClick={onClick} className={`${cls} active:opacity-70`}>
      {children}
    </button>
  ) : (
    <span title={title} className={cls}>
      {children}
    </span>
  );
}

/** カード画像。タップで詳細、長押しで onLongPress（デッキに追加） */
export function CardImage({ card, onLongPress, className = "", footer }: { card: AppCard; onLongPress?: () => void; className?: string; footer?: ReactNode }) {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const long = useRef(false);
  const start = useRef<{ x: number; y: number }>(undefined);
  const cancel = () => clearTimeout(timer.current);
  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        className="no-callout block w-full touch-manipulation"
        onPointerDown={(e) => {
          long.current = false;
          start.current = { x: e.clientX, y: e.clientY };
          if (!onLongPress) return;
          timer.current = setTimeout(() => {
            long.current = true;
            navigator.vibrate?.(30);
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
        onClick={() => {
          if (!long.current) navigate(`/card/${card.id}`);
        }}
        aria-label={card.nameJa}
      >
        <Thumb card={card} />
      </button>
      {footer}
    </div>
  );
}

export function Thumb({ card, className = "" }: { card: AppCard; className?: string }) {
  return (
    <img
      src={thumbUrl(card)}
      alt={card.nameJa}
      loading="lazy"
      decoding="async"
      draggable={false}
      width={160}
      height={223}
      className={`aspect-[367/512] w-full rounded-md bg-slate-200 object-cover shadow-sm dark:bg-slate-800 ${className}`}
      onError={(e) => {
        const img = e.currentTarget;
        if (img.src !== card.image) img.src = card.image;
      }}
    />
  );
}

export function Toast() {
  const { message, tone } = useToast();
  if (!message) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex justify-center px-4">
      <div className={`rounded-lg px-4 py-2 text-sm shadow-lg ${tone === "error" ? "bg-red-600 text-white" : "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"}`}>
        {message}
      </div>
    </div>
  );
}

export function BottomNav() {
  const { parts } = useRoute();
  const deck = useDecks((s) => s.decks.find((d) => d.id === s.currentId));
  const tab = parts[0] === "deck" || parts[0] === "share" ? "deck" : parts[0] === "settings" ? "settings" : "search";
  const item = (key: string, label: string, path: string, icon: ReactNode, badge?: string) => (
    <button
      type="button"
      onClick={() => navigate(path)}
      className={`relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] ${tab === key ? "text-red-600 dark:text-red-400" : "text-slate-500"}`}
    >
      {icon}
      {label}
      {badge && <span className="absolute top-1 left-1/2 ml-2 rounded-full bg-red-600 px-1.5 text-[10px] leading-4 text-white">{badge}</span>}
    </button>
  );
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
      <div className="mx-auto flex max-w-3xl">
        {item("search", "検索", "/", <IconSearch />)}
        {item("deck", "デッキ", "/deck", <IconDeck />, deck ? `${deck.cards.length}` : undefined)}
        {item("settings", "設定", "/settings", <IconGear />)}
      </div>
    </nav>
  );
}

const svg = "h-6 w-6 fill-none stroke-current stroke-2";
const IconSearch = () => (
  <svg viewBox="0 0 24 24" className={svg} aria-hidden>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" strokeLinecap="round" />
  </svg>
);
const IconDeck = () => (
  <svg viewBox="0 0 24 24" className={svg} aria-hidden>
    <rect x="6" y="3" width="12" height="16" rx="2" />
    <path d="M9 21h10a2 2 0 0 0 2-2V7" strokeLinecap="round" />
  </svg>
);
const IconGear = () => (
  <svg viewBox="0 0 24 24" className={svg} aria-hidden>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" strokeLinecap="round" />
  </svg>
);

export function Header({ title, back, right }: { title: ReactNode; back?: boolean; right?: ReactNode }) {
  return (
    <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
      {back && (
        <button type="button" onClick={() => history.back()} className="-ml-1 rounded p-1 text-slate-500" aria-label="戻る">
          <svg viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current stroke-2" aria-hidden>
            <path d="m15 18-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
      <h1 className="min-w-0 flex-1 truncate text-base font-bold">{title}</h1>
      {right}
    </header>
  );
}
