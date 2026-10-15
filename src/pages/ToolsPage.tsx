// ツールタブ（beta機能。設定でオンにすると下のタブに出る）。いろいろな追加機能をここに足していく
//   #/tools             ツールの一覧
//   #/tools/meta        大会で使われたデッキ（最近のアツいデッキ・新しい順・おすすめ・成績順）
//   #/tools/lists       リストの一覧
//   #/tools/list/<id>   リストの中身（その場で編集）
//   #/list/<共有コード>  共有されたリスト
import { toPng } from "html-to-image";
import { useEffect, useMemo, useRef, useState } from "react";
import { PoolFab, PoolGrid, PoolToolbar, QueryBox, usePoolResults } from "../components/pool.tsx";
import { Rarity, SetBadge } from "../components/prints.tsx";
import { DeckRow } from "../components/tournament-decks.tsx";
import { Chip, Header, Pressable, Sheet, Thumb } from "../components/ui.tsx";
import { useData } from "../context.tsx";
import { useTournamentDecks, type TournamentDeck } from "../data/decks.ts";
import { isSingleFile, printImageUrl, thumbUrl } from "../data/load.ts";
import { download } from "../deck.ts";
import { qrImage } from "../deck-qr.ts";
import { recommendScore } from "../deck-score.ts";
import { openCard } from "../detail.ts";
import { cardName, useLang, useT, type Lang } from "../i18n.ts";
import { canMirror, decodeList, encodeList, listCodeOf, printIndex, SIDES, type CardList, type ListItem, type ListKind, type ListSide } from "../lists.ts";
import { useNav } from "../nav.ts";
import { PoolScope } from "../pool.ts";
import { navigate, useRoute } from "../router.ts";
import { useEditTarget, useLists, useSettings, useToast } from "../store.ts";
import type { AppCard, AppPrint } from "../types.ts";
import { ImagePreview } from "./DeckPage.tsx";
import { useQueryConds } from "./SearchPage.tsx";

export function ToolRoutes({ parts }: { parts: string[] }) {
  if (parts[0] === "list") return <SharedListPage code={parts.slice(1).join("/")} />;
  switch (parts[1]) {
    case "meta":
      return <MetaPage />;
    case "lists":
      return <ListsPage />;
    case "list":
      if (!parts[2]) return <ListsPage />;
      return parts[3] === "edit" ? (
        <PoolScope.Provider value="builder">
          <ListBuilderPage id={parts[2]} />
        </PoolScope.Provider>
      ) : (
        <ListPage id={parts[2]} />
      );
    default:
      return <ToolsHome />;
  }
}

// ---------------- ツールの一覧 ----------------

function ToolsHome() {
  const t = useT();
  const tools = [
    {
      path: "/tools/meta",
      icon: "🏆",
      title: t("大会のデッキ", "Tournament decks"),
      desc: t("最近の大会で使われているデッキ。環境上位・急上昇のデッキタイプや、新しい順・成績順のデッキリストを見られます", "Decks from recent tournaments: top and rising archetypes, newest lists and best results"),
    },
    {
      path: "/tools/lists",
      icon: "📋",
      title: t("リスト", "Lists"),
      desc: t("枚数の上限なしでカードをまとめる。トレード用（欲しい・出せる）も。絵柄違いやミラーも指定できます", "Collect any number of cards, or make a trade list (want / have). Pick alternate arts and mirror foils"),
    },
  ];
  return (
    <div>
      <Header title={t("ツール", "Tools")} right={<span className="rounded-full bg-[#ffe9c7] px-2 py-0.5 text-[10px] font-extrabold text-[#8a5c0c]">beta</span>} />
      <div className="mx-auto max-w-3xl space-y-3 px-4 py-3">
        {tools.map((x) => (
          <button key={x.path} type="button" onClick={() => navigate(x.path)} className="neu neu-press flex w-full items-center gap-3 rounded-2xl p-4 text-left">
            <span className="text-3xl leading-none" aria-hidden>
              {x.icon}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-extrabold">{x.title}</span>
              <span className="block text-xs font-medium text-muted">{x.desc}</span>
            </span>
            <span className="text-muted" aria-hidden>
              ›
            </span>
          </button>
        ))}
        <p className="px-1 text-[11px] font-medium text-muted">{t("ツールは開発中のbeta機能です。設定の「beta機能」をオフにすると、このタブは消えます。", "Tools are beta features. Turn off “Beta features” in Settings to hide this tab.")}</p>
      </div>
    </div>
  );
}

// ---------------- 大会のデッキ ----------------

const DAY = 86400e3;
const WINDOW_DAYS = 14; // 「最近」は最新の大会から2週間。その前の2週間と比べる
const PAGE = 10;

interface ArchStat {
  id: string;
  name: string;
  nameEn: string;
  recent: number; // 直近2週間のデッキ数（同じ構成も数える）
  prev: number; // その前の2週間
  share: number; // 直近の使用率
  prevShare: number;
  top8: number; // 直近の大会で8位以内に入った数
}

/** 大会のデッキから、デッキタイプごとの直近の使用率と、その前の期間からの増減を数える */
function archStats(decks: TournamentDeck[], newest: number): { stats: ArchStat[]; from: number; to: number } {
  const from = newest - WINDOW_DAYS * DAY, prevFrom = newest - 2 * WINDOW_DAYS * DAY;
  const m = new Map<string, ArchStat>();
  let total = 0, prevTotal = 0;
  for (const d of decks) {
    const at = Date.parse(d.date);
    if (at <= prevFrom) continue;
    const s = m.get(d.archId) ?? m.set(d.archId, { id: d.archId, name: d.arch, nameEn: d.archEn, recent: 0, prev: 0, share: 0, prevShare: 0, top8: 0 }).get(d.archId)!;
    if (at > from) {
      s.recent += d.dup;
      total += d.dup;
      if (d.place && d.place <= 8) s.top8++;
    } else {
      s.prev += d.dup;
      prevTotal += d.dup;
    }
  }
  for (const s of m.values()) {
    s.share = total ? s.recent / total : 0;
    s.prevShare = prevTotal ? s.prev / prevTotal : 0;
  }
  return { stats: [...m.values()].filter((s) => s.recent > 0), from, to: newest };
}

/** 順位の良さ（上位何%か。小さいほど良い）。順位が分からなければ勝ち越し数で */
const strength = (d: TournamentDeck) => (d.place ? d.place / Math.max(d.players, 1) : 1) - (d.wins - d.losses) * 0.001;

type MetaView = "hot" | "rising" | "new" | "recommended" | "best";

function MetaPage() {
  const index = useTournamentDecks();
  const { data, byId } = useData();
  const t = useT();
  const lang = useLang();
  const [view, setView] = useState<MetaView>("hot");
  const [arch, setArch] = useState<string>();
  const [shown, setShown] = useState(PAGE);
  const { stats, from, to } = useMemo(() => (index ? archStats(index.decks, index.newest) : { stats: [], from: 0, to: 0 }), [index]);
  const ranked = useMemo(
    () => [...stats].sort((a, b) => (view === "rising" ? b.share - b.prevShare - (a.share - a.prevShare) : b.share - a.share) || b.recent - a.recent).slice(0, 20),
    [stats, view],
  );
  // デッキタイプの主なカード（大会データの集計で、そのデッキタイプを決めているカード）
  const keysOf = useMemo(() => new Map((data.meta?.archetypes ?? []).map((a) => [a.id, a.keys])), [data]);
  const list = useMemo(() => {
    if (!index || view === "hot" || view === "rising") return [];
    const all = arch ? index.decks.filter((d) => d.archId === arch) : [...index.decks];
    if (view === "new") return all.sort((a, b) => b.date.localeCompare(a.date) || strength(a) - strength(b));
    if (view === "best") return all.sort((a, b) => strength(a) - strength(b) || b.date.localeCompare(a.date));
    const score = new Map(all.map((d) => [d, recommendScore(d, index.newest)]));
    return all.sort((a, b) => score.get(b)! - score.get(a)! || b.date.localeCompare(a.date));
  }, [index, view, arch]);
  const archName = (s: Pick<ArchStat, "name" | "nameEn">) => (lang === "en" ? s.nameEn : s.name);
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  const day = (ms: number) => new Date(ms).toLocaleDateString(lang === "en" ? "en-US" : "ja-JP", { month: "numeric", day: "numeric" });
  const VIEWS: [MetaView, string, string][] = [
    ["hot", "環境上位", "Top decks"],
    ["rising", "急上昇", "Rising"],
    ["recommended", "おすすめ", "Recommended"],
    ["new", "新しい順", "Newest"],
    ["best", "成績順", "Best results"],
  ];
  const pick = (v: MetaView) => {
    setView(v);
    setShown(PAGE);
  };

  return (
    <div>
      <Header title={t("大会のデッキ", "Tournament decks")} back={() => navigate("/tools")} />
      <div className="mx-auto max-w-3xl space-y-3 px-4 pb-6">
        <div className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 py-1">
          {VIEWS.map(([v, ja, en]) => (
            <Chip key={v} active={view === v} onClick={() => pick(v)}>
              {lang === "en" ? en : ja}
            </Chip>
          ))}
        </div>
        {!index ? (
          <p className="neu rounded-2xl p-4 text-center text-xs font-bold text-muted">{t("大会のデッキを読み込み中…", "Loading tournament decks…")}</p>
        ) : view === "hot" || view === "rising" ? (
          <>
            <p className="text-[11px] font-bold text-muted">
              {t(
                `直近2週間（${day(from + DAY)}〜${day(to)}）の大会で使われたデッキタイプ。矢印はその前の2週間との差です。`,
                `Archetypes played in the last 2 weeks (${day(from + DAY)}–${day(to)}). Arrows compare with the 2 weeks before.`,
              )}
            </p>
            {ranked.map((s, i) => {
              const diff = s.share - s.prevShare;
              const isNew = s.prev === 0 && s.recent >= 3;
              const keys = (keysOf.get(s.id) ?? []).map((id) => byId.get(id)).filter((c): c is AppCard => !!c).slice(0, 3);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    setArch(s.id);
                    pick("recommended");
                  }}
                  className="neu neu-press flex w-full items-center gap-3 rounded-2xl p-3 text-left"
                >
                  <span className={`w-6 shrink-0 text-center text-lg font-extrabold ${i < 3 ? "text-accent-deep" : "text-muted"}`}>{i + 1}</span>
                  <span className="flex w-24 shrink-0 gap-0.5">
                    {keys.map((c) => (
                      <span key={c.id} className="w-8">
                        <Thumb card={c} className="rounded-[3px]" />
                      </span>
                    ))}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 text-sm leading-snug font-extrabold">{archName(s)}</span>
                    <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-line">
                      <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.min(100, (s.share / Math.max(ranked[0]?.share ?? 1, 0.0001)) * 100)}%` }} />
                    </span>
                    <span className="mt-1 flex flex-wrap gap-x-2 text-[10px] font-bold text-muted">
                      <span>{t(`使用率 ${pct(s.share)}`, `${pct(s.share)} of decks`)}</span>
                      {s.top8 > 0 && <span>{t(`8位以内 ${s.top8}回`, `Top 8 ×${s.top8}`)}</span>}
                    </span>
                  </span>
                  <span className={`shrink-0 text-right text-xs font-extrabold ${isNew ? "text-[#c2410c]" : diff > 0.002 ? "text-accent-deep" : diff < -0.002 ? "text-[#b8394c]" : "text-muted"}`}>
                    {isNew ? "NEW" : `${diff > 0.002 ? "↑" : diff < -0.002 ? "↓" : "→"} ${Math.abs(diff * 100).toFixed(1)}`}
                  </span>
                </button>
              );
            })}
            <p className="text-[10px] font-medium text-muted">{t(`Limitless TCG の大会結果（勝ち越し・五分のデッキ。${index.fetchedAt.slice(0, 10)} 取得）`, `Tournament results from Limitless TCG (even or winning records, fetched ${index.fetchedAt.slice(0, 10)})`)}</p>
          </>
        ) : (
          <>
            <div className="scrollbar-none -mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
              <Chip active={!arch} onClick={() => { setArch(undefined); setShown(PAGE); }}>
                {t("すべて", "All")}
              </Chip>
              {[...stats].sort((a, b) => b.recent - a.recent).slice(0, 10).map((s) => (
                <Chip key={s.id} active={arch === s.id} onClick={() => { setArch(arch === s.id ? undefined : s.id); setShown(PAGE); }}>
                  {archName(s)}
                </Chip>
              ))}
              {arch && !stats.slice(0, 10).some((s) => s.id === arch) && <Chip active>{archName(stats.find((s) => s.id === arch) ?? { name: arch, nameEn: arch })}</Chip>}
            </div>
            <p className="text-[11px] font-bold text-muted">{t(`${list.length} 種類のデッキ`, `${list.length} unique lists`)}</p>
            {list.slice(0, shown).map((d, i) => (
              <DeckRow key={`${d.archId}-${d.date}-${i}`} d={d} />
            ))}
            {list.length > shown && (
              <button type="button" onClick={() => setShown((n) => n + PAGE)} className="neu-sm neu-press w-full rounded-full py-2 text-xs font-extrabold text-muted">
                {t(`もっと見る（あと ${list.length - shown} 種類）`, `Show more (${list.length - shown} left)`)}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ---------------- リスト ----------------

const SIDE_LABEL: Record<ListSide, [string, string]> = { main: ["カード", "Cards"], want: ["欲しいカード", "Want"], give: ["出せるカード", "Have"] };
const KIND_LABEL: Record<ListKind, [string, string]> = { list: ["リスト", "List"], trade: ["トレード用", "Trade"] };
const total = (items: ListItem[]) => items.reduce((n, it) => n + it.n, 0);

function usePrintIndex() {
  const { data } = useData();
  return useMemo(() => printIndex(data.cards), [data]);
}

/** リストの共有URL。サイトでは /l/<コード>（英語なら /en/l/…）にして、リンクのプレビューにリスト名を出す（server/list-page.ts）。
 *  1ファイル版では、そのファイルの #/list/<コード> */
function listUrlOf(l: Pick<CardList, "name" | "kind" | "items">, lang: Lang): string {
  const code = encodeList(l);
  if (isSingleFile || !/^https?:$/.test(location.protocol)) return `${location.href.split("#")[0]}#/list/${code}`;
  return `${location.origin}${lang === "en" ? "/en" : ""}/l/${code}`;
}

/** 絵柄（収録）ごとのサムネイル。ふつうの絵柄はカードのサムネイル、絵柄違いはその絵柄の画像。ミラーならタグを付ける */
function PrintThumb({ card, print, mirror, n, className = "", compact }: { card: AppCard; print: string; mirror?: boolean; n?: number; className?: string; compact?: boolean }) {
  const lang = useSettings((s) => s.imageLang);
  const uiLang = useLang();
  const t = useT();
  const p = card.prints.find((x) => x.id === print);
  return (
    <span className={`relative block ${className}`}>
      {!p || print === card.id ? (
        <Thumb card={card} className="rounded-[4px]" />
      ) : (
        <img
          key={`${print}-${lang}`}
          src={printImageUrl(p, lang)}
          alt={cardName(card, uiLang)}
          loading="lazy"
          draggable={false}
          className="aspect-[367/512] w-full rounded-[4px] bg-line object-cover"
          onError={(e) => {
            const img = e.currentTarget;
            const step = Number(img.dataset.try ?? 0);
            img.dataset.try = String(step + 1);
            if (step === 0) img.src = printImageUrl(p, "en");
            else if (step === 1) img.src = thumbUrl(card, lang);
          }}
        />
      )}
      {mirror && <MirrorTag label={t("ミラー", "Mirror")} compact={compact} />}
      {n !== undefined && n > 1 && <span className="absolute right-0 bottom-0 rounded-tl-[5px] rounded-br-[4px] bg-badge px-1 text-[10px] leading-tight font-extrabold text-white">×{n}</span>}
    </span>
  );
}

/** ミラー仕様のしるし（ミラーの画像は無く、見た目でも分かりにくいので、カードの上に文字で出す）。小さいサムネイルでは虹色の帯だけ */
const MIRROR_BG = "linear-gradient(120deg,#7dd3fc,#c084fc 45%,#f9a8d4 70%,#fde68a)";
function MirrorTag({ label, compact }: { label: string; compact?: boolean }) {
  if (compact) return <span role="img" aria-label={label} title={label} className="absolute inset-x-0 top-0 h-1 rounded-t-[4px]" style={{ background: MIRROR_BG }} />;
  return (
    <span
      className="absolute top-[6%] left-1/2 -translate-x-1/2 rounded-full px-1.5 py-px text-[9px] leading-tight font-extrabold whitespace-nowrap text-white shadow"
      style={{ background: MIRROR_BG }}
    >
      {label}
    </span>
  );
}

/** 絵柄の名前（弾・番号・レアリティ） */
function PrintLabel({ p, lang }: { p: AppPrint; lang: Lang }) {
  return (
    <span className="inline-flex items-center gap-1">
      <SetBadge set={p.set} />
      <span className="text-[11px] font-bold text-muted">#{Number(p.id.split("-").pop())}</span>
      <Rarity r={p.rarity} lang={lang} />
    </span>
  );
}

function ListsPage() {
  const { byId } = useData();
  const idx = usePrintIndex();
  const lists = useLists((s) => s.lists);
  const create = useLists((s) => s.create);
  const t = useT();
  const lang = useLang();
  const [newOpen, setNewOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  return (
    <div>
      <Header
        title={t("リスト", "Lists")}
        back={() => navigate("/tools")}
        right={
          <button type="button" onClick={() => setImportOpen(true)} className="neu-sm neu-press rounded-full px-3 py-1.5 text-xs font-bold text-muted">
            {t("読み込み", "Import")}
          </button>
        }
      />
      <div className="mx-auto grid max-w-3xl grid-cols-1 gap-4 px-4 py-3 sm:grid-cols-2">
        {lists.map((l) => {
          const items = l.items.slice(0, 10);
          return (
            <button key={l.id} type="button" onClick={() => navigate(`/tools/list/${l.id}`)} className="neu neu-press rounded-2xl p-3 text-left">
              <div className="mb-2 flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate font-extrabold">{l.name}</span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-extrabold ${l.kind === "trade" ? "bg-[#ffe9c7] text-[#8a5c0c]" : "neu-in text-muted"}`}>{lang === "en" ? KIND_LABEL[l.kind][1] : KIND_LABEL[l.kind][0]}</span>
                <span className="shrink-0 text-xs font-extrabold text-muted">{t(`${total(l.items)}枚`, `${total(l.items)}`)}</span>
              </div>
              <div className="grid grid-cols-10 gap-1">
                {Array.from({ length: 10 }, (_, i) => items[i]).map((it, i) => {
                  const owner = it && cardOfPrint(it.print, byId, idx);
                  return owner ? <PrintThumb key={i} card={owner} print={it.print} mirror={it.mirror} compact /> : <div key={i} className="neu-in aspect-[367/512] rounded-sm" />;
                })}
              </div>
            </button>
          );
        })}
        <button type="button" onClick={() => setNewOpen(true)} className="neu-in flex min-h-28 flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-line font-extrabold text-muted">
          <span className="text-3xl leading-none">＋</span>
          {t("新しいリストを作る", "New list")}
        </button>
      </div>
      <Sheet open={newOpen} onClose={() => setNewOpen(false)} title={t("リストの種類", "List type")}>
        <div className="space-y-3 pb-2">
          {(
            [
              ["list", t("リスト", "List"), t("カードを好きなだけまとめる、ふつうのリスト", "A plain list of any number of cards")],
              ["trade", t("トレード用リスト", "Trade list"), t("「欲しいカード」と「出せるカード」に分けてまとめる", "Split into cards you want and cards you can give")],
            ] as [ListKind, string, string][]
          ).map(([kind, title, desc]) => (
            <button
              key={kind}
              type="button"
              onClick={() => {
                setNewOpen(false);
                navigate(`/tools/list/${create(kind)}`);
              }}
              className="neu neu-press flex w-full flex-col rounded-2xl p-4 text-left"
            >
              <span className="font-extrabold">{title}</span>
              <span className="text-xs font-medium text-muted">{desc}</span>
            </button>
          ))}
        </div>
      </Sheet>
      <ImportListSheet open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  );
}

/** 収録ID → そのカード（ふつうの絵柄ならカードIDと同じ） */
function cardOfPrint(print: string, byId: Map<string, AppCard>, idx: Map<string, [AppCard, AppPrint]>): AppCard | undefined {
  return byId.get(print) ?? idx.get(print)?.[0];
}

function ImportListSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const idx = usePrintIndex();
  const create = useLists((s) => s.create);
  const show = useToast((s) => s.show);
  const t = useT();
  const [text, setText] = useState("");
  const run = () => {
    try {
      const l = decodeList(listCodeOf(text), idx);
      const id = create(l.kind, l.name, l.items);
      show(t(`「${l.name}」を読み込みました`, `Imported “${l.name}”`));
      setText("");
      onClose();
      navigate(`/tools/list/${id}`);
    } catch {
      show(t("リストの共有コード・URLを読めませんでした", "Couldn't read the list code or URL"), "error");
    }
  };
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t("リストを読み込む", "Import a list")}
      footer={
        <button type="button" disabled={!text.trim()} onClick={run} className="btn-ok w-full rounded-full py-3 disabled:opacity-50">
          {t("読み込む", "Import")}
        </button>
      }
    >
      <p className="mb-2 text-xs font-medium text-muted">{t("共有されたリストのURLか共有コードを貼り付けてください", "Paste a shared list URL or share code")}</p>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} className="neu-in w-full rounded-2xl p-3 text-xs" placeholder="https://pokepokeindex.com/#/list/L1~…" />
    </Sheet>
  );
}

function ListPage({ id }: { id: string }) {
  const list = useLists((s) => s.lists.find((l) => l.id === id));
  const { rename, remove } = useLists();
  const t = useT();
  const exp = useListExport(list);
  const edit = (side?: ListSide) => navigate(`/tools/list/${id}/edit${side ? `?side=${side}` : ""}`);
  if (!list) return <Header title={t("リストが見つかりません", "List not found")} back={() => navigate("/tools/lists")} />;
  return (
    <div>
      <Header title={list.kind === "trade" ? t("トレード用リスト", "Trade list") : t("リスト", "List")} back={() => navigate("/tools/lists")} />
      <div className="mx-auto max-w-3xl space-y-4 px-4 pb-8">
        <input
          value={list.name}
          onChange={(e) => rename(list.id, e.target.value)}
          aria-label={t("リストの名前", "List name")}
          className="neu-in w-full rounded-2xl px-4 py-3 text-base font-extrabold"
        />
        <button type="button" onClick={() => edit()} className="btn-ok w-full rounded-full py-3 text-sm">
          {t("カードを追加・編集", "Add & edit cards")}
        </button>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={exp.share} className="neu-sm neu-press rounded-full px-3 py-1.5 text-xs font-extrabold text-accent-deep">
            {t("共有URL", "Share URL")}
          </button>
          <button type="button" onClick={exp.copyCode} className="neu-sm neu-press rounded-full px-3 py-1.5 text-xs font-extrabold text-muted">
            {t("共有コードをコピー", "Copy share code")}
          </button>
          <button type="button" onClick={exp.savePng} disabled={exp.exporting || !list.items.length} className="neu-sm neu-press rounded-full px-3 py-1.5 text-xs font-extrabold text-muted disabled:opacity-50">
            {exp.exporting ? t("画像を作成中…", "Creating…") : t("画像で保存", "Save as image")}
          </button>
          <button
            type="button"
            onClick={() => {
              if (!confirm(t(`「${list.name}」を削除しますか？`, `Delete “${list.name}”?`))) return;
              remove(list.id);
              navigate("/tools/lists");
            }}
            className="neu-sm neu-press ml-auto rounded-full px-3 py-1.5 text-xs font-extrabold text-[#b8394c]"
          >
            {t("削除", "Delete")}
          </button>
        </div>
        {SIDES[list.kind].map((side) => (
          <ListSection key={side} list={list} side={side} onAdd={() => edit(side)} />
        ))}
        <p className="text-center text-[11px] font-bold text-muted">{t("カードをタップで絵柄・ミラー・枚数を変更", "Tap a card to change its art, mirror or count")}</p>
      </div>
      {exp.image}
    </div>
  );
}

function ListSection({ list, side, onAdd, readOnly, narrow }: { list: Pick<CardList, "id" | "kind" | "items">; side: ListSide; onAdd?: () => void; readOnly?: boolean; narrow?: boolean }) {
  const { byId } = useData();
  const idx = usePrintIndex();
  const t = useT();
  const lang = useLang();
  const [editing, setEditing] = useState<Pick<ListItem, "print" | "mirror" | "side">>();
  const rows = list.items.map((it, i) => ({ it, i, card: cardOfPrint(it.print, byId, idx) })).filter((r) => r.it.side === side && r.card);
  return (
    <section className="neu rounded-3xl p-3">
      <div className="mb-2 flex items-center gap-2">
        <h2 className="min-w-0 flex-1 text-sm font-extrabold">{lang === "en" ? SIDE_LABEL[side][1] : SIDE_LABEL[side][0]}</h2>
        <span className="text-xs font-extrabold text-muted">{t(`${total(rows.map((r) => r.it))}枚`, `${total(rows.map((r) => r.it))}`)}</span>
      </div>
      <div className={`grid grid-cols-5 gap-2 ${narrow ? "" : "sm:grid-cols-8"}`}>
        {rows.map(({ it, card }) => (
          <Pressable
            key={`${it.print}-${it.mirror ? 1 : 0}`}
            onTap={() => (readOnly ? openCard(card!.id, rows.map((r) => r.card!.id)) : setEditing({ print: it.print, mirror: it.mirror, side: it.side }))}
            label={`${cardName(card!, lang)} ×${it.n}`}
            className="rounded-[4px]"
          >
            <PrintThumb card={card!} print={it.print} mirror={it.mirror} n={it.n} />
          </Pressable>
        ))}
        {onAdd && (
          <button type="button" onClick={onAdd} aria-label={t("カードを追加", "Add cards")} className="neu-in flex aspect-[367/512] items-center justify-center rounded-[4px] text-2xl font-light text-[#9fadbf]">
            ＋
          </button>
        )}
      </div>
      {!rows.length && readOnly && <p className="py-3 text-center text-xs font-bold text-muted">{t("カードがありません", "No cards")}</p>}
      {editing && !readOnly && <ItemSheet listId={list.id} kind={list.kind} target={editing} onChange={setEditing} onClose={() => setEditing(undefined)} />}
    </section>
  );
}

/** 1枚の設定: 絵柄・ミラー・枚数・（トレード用）欲しい／出せる */
function ItemSheet({ listId, kind, target, onChange, onClose }: { listId: string; kind: ListKind; target: Pick<ListItem, "print" | "mirror" | "side">; onChange: (t: Pick<ListItem, "print" | "mirror" | "side">) => void; onClose: () => void }) {
  const { byId } = useData();
  const idx = usePrintIndex();
  const list = useLists((s) => s.lists.find((l) => l.id === listId));
  const setItem = useLists((s) => s.setItem);
  const t = useT();
  const lang = useLang();
  const index = list?.items.findIndex((x) => x.print === target.print && !!x.mirror === !!target.mirror && x.side === target.side) ?? -1;
  const it = index >= 0 ? list!.items[index] : undefined;
  const card = it && cardOfPrint(it.print, byId, idx);
  if (!it || !card) return null;
  const update = (patch: Partial<ListItem>) => {
    const next = { ...it, ...patch };
    // ミラーにできない絵柄に変えたら、ミラーは外す
    if (next.mirror && !canMirror(card, card.prints.find((p) => p.id === next.print))) delete next.mirror;
    setItem(listId, index, next);
    if (next.n <= 0) onClose();
    else onChange({ print: next.print, mirror: next.mirror, side: next.side });
  };
  const print = card.prints.find((p) => p.id === it.print);
  const mirrorOk = canMirror(card, print);
  return (
    <Sheet
      open
      onClose={onClose}
      title={cardName(card, lang)}
      footer={
        <div className="flex gap-2">
          <button type="button" onClick={() => openCard(card.id, [card.id])} className="neu-sm neu-press flex-1 rounded-full py-2.5 text-xs font-extrabold text-muted">
            {t("カードの詳細", "Card details")}
          </button>
          <button type="button" onClick={() => update({ n: 0 })} className="neu-sm neu-press flex-1 rounded-full py-2.5 text-xs font-extrabold text-[#b8394c]">
            {t("リストから外す", "Remove")}
          </button>
        </div>
      }
    >
      <div className="flex gap-4">
        <div className="w-28 shrink-0">
          <PrintThumb card={card} print={it.print} mirror={it.mirror} />
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <div className="mb-1 text-xs font-extrabold text-muted">{t("枚数", "Count")}</div>
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => update({ n: it.n - 1 })} className="neu-sm neu-press h-9 w-9 rounded-full text-lg font-extrabold" aria-label={t("1枚減らす", "One less")}>
                −
              </button>
              <span className="w-8 text-center text-lg font-extrabold">{it.n}</span>
              <button type="button" onClick={() => update({ n: it.n + 1 })} className="neu-sm neu-press h-9 w-9 rounded-full text-lg font-extrabold" aria-label={t("1枚増やす", "One more")}>
                ＋
              </button>
            </div>
          </div>
          {mirrorOk && (
            <div>
              <div className="mb-1 text-xs font-extrabold text-muted">{t("ミラー仕様", "Mirror foil")}</div>
              <div className="flex gap-2">
                <Chip active={!it.mirror} onClick={() => update({ mirror: false })}>
                  {t("ふつう", "Normal")}
                </Chip>
                <Chip active={!!it.mirror} onClick={() => update({ mirror: true })}>
                  {t("ミラー", "Mirror")}
                </Chip>
              </div>
            </div>
          )}
          {kind === "trade" && (
            <div>
              <div className="mb-1 text-xs font-extrabold text-muted">{t("区分", "Section")}</div>
              <div className="flex gap-2">
                {(["want", "give"] as const).map((s) => (
                  <Chip key={s} active={it.side === s} onClick={() => update({ side: s })}>
                    {lang === "en" ? SIDE_LABEL[s][1] : SIDE_LABEL[s][0]}
                  </Chip>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      {card.prints.length > 1 && (
        <div className="mt-4">
          <div className="mb-2 text-xs font-extrabold text-muted">{t("絵柄", "Art")}</div>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
            {card.prints.map((p) => (
              <button key={p.id} type="button" onClick={() => update({ print: p.id })} className={`flex flex-col items-center gap-1 rounded-lg p-1 ${p.id === it.print ? "bg-accent/15 ring-2 ring-accent" : ""}`}>
                <PrintThumb card={card} print={p.id} />
                <PrintLabel p={p} lang={lang} />
              </button>
            ))}
          </div>
        </div>
      )}
    </Sheet>
  );
}

// リストの中身を変える画面（デッキ編集と同じ形）: 上の枠にリストのカード、下にカード一覧。
// 一覧のカードは長押しで1枚追加（カード詳細の ＋／− もこのリストに向く）。上の枠はタップで絵柄・ミラー・枚数、長押しで1枚減らす
const SLOT_VISIBLE = { s: 10, m: 7, l: 5 } as const;

function ListBuilderPage({ id }: { id: string }) {
  const list = useLists((s) => s.lists.find((l) => l.id === id));
  const setItem = useLists((s) => s.setItem);
  const { byId } = useData();
  const idx = usePrintIndex();
  const { params } = useRoute();
  const { slotSize, setSlotSize } = useSettings();
  const show = useToast((s) => s.show);
  const t = useT();
  const lang = useLang();
  const sides = SIDES[list?.kind ?? "list"];
  const [side, setSide] = useState<ListSide>(() => (sides.includes(params.get("side") as ListSide) ? (params.get("side") as ListSide) : sides[0]));
  const [editing, setEditing] = useState<Pick<ListItem, "print" | "mirror" | "side">>();
  const [searchOpen, setSearchOpen] = useState(false);
  const [input, setInput] = useState("");
  const [q, setQ] = useState("");
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const { parsed, conds } = useQueryConds(q, excluded);
  const { hits } = usePoolResults(conds);
  // この画面を開いている間だけ、カード一覧の長押し・詳細の ＋／− をこのリストに向ける（タブを離れたら戻す）
  const active = useNav((s) => s.active === "tools");
  useEffect(() => {
    if (!active) return;
    useEditTarget.setState({ list: { id, side } });
    return () => useEditTarget.setState({ list: undefined });
  }, [id, side, active]);

  const rows = useMemo(
    () => (list?.items ?? []).map((it, i) => ({ it, i, card: cardOfPrint(it.print, byId, idx) })).filter((r): r is { it: ListItem; i: number; card: AppCard } => r.it.side === side && !!r.card),
    [list, side, byId, idx],
  );
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.card.id, (m.get(r.card.id) ?? 0) + r.it.n);
    return m;
  }, [rows]);
  if (!list) return <Header title={t("リストが見つかりません", "List not found")} back={() => navigate("/tools/lists")} />;
  const v = SLOT_VISIBLE[slotSize];
  const cols = Math.max(v, Math.ceil((rows.length + 1) / 2)); // 2段。足りないところは空き枠
  const totalOf = (sd: ListSide) => total(list.items.filter((x) => x.side === sd));

  return (
    <div className="pb-28">
      <div className="sticky top-0 z-30 bg-canvas/95 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 backdrop-blur">
        <div className="neu rounded-3xl p-3">
          <div className="mb-2 flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-sm font-extrabold">{list.name}</span>
            {sides.length > 1 && (
              <div className="neu-in flex shrink-0 rounded-full p-0.5 text-[11px] font-bold">
                {sides.map((sd) => (
                  <button key={sd} type="button" onClick={() => setSide(sd)} aria-pressed={side === sd} className={`rounded-full px-2.5 py-1 ${side === sd ? "bg-white text-accent shadow" : "text-muted"}`}>
                    {lang === "en" ? SIDE_LABEL[sd][1] : SIDE_LABEL[sd][0]} {totalOf(sd)}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="scrollbar-none -mx-1 overflow-x-auto px-1 pb-1">
            <div className="grid gap-1.5" style={{ width: `${((cols / v) * 100).toFixed(2)}%`, gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
              {Array.from({ length: cols * 2 }, (_, i) => rows[i]).map((r, i) =>
                r ? (
                  <Pressable
                    key={`${r.it.print}-${r.it.mirror ? 1 : 0}`}
                    onTap={() => setEditing({ print: r.it.print, mirror: r.it.mirror, side: r.it.side })}
                    onLongPress={() => {
                      setItem(list.id, r.i, { ...r.it, n: r.it.n - 1 });
                      show(t(`「${r.card.nameJa}」を1枚減らしました`, `Removed one ${r.card.nameEn}`));
                    }}
                    label={t(`${r.card.nameJa} ${r.it.n}枚（タップで設定・長押しで1枚減らす）`, `${cardName(r.card, lang)} ×${r.it.n} (tap to edit, long-press to remove one)`)}
                    className="pop-in rounded-[4px] shadow-[1px_2px_3px_rgb(150_165_185/0.5)]"
                  >
                    <PrintThumb card={r.card} print={r.it.print} mirror={r.it.mirror} n={r.it.n} compact={slotSize === "s"} />
                  </Pressable>
                ) : (
                  <div key={i} className="neu-in flex aspect-[367/512] items-center justify-center rounded-[4px] text-lg font-light text-[#b8c3d1]">
                    ＋
                  </div>
                ),
              )}
            </div>
          </div>
          <div className="mt-2 flex items-center justify-end gap-1 text-[11px] font-bold text-muted">
            {cols > v && <span className="mr-auto">{t("← 横にスクロール →", "← scroll →")}</span>}
            <span className="mr-1">{t("枠の大きさ", "Slot size")}</span>
            {(["s", "m", "l"] as const).map((x) => (
              <button key={x} type="button" aria-pressed={slotSize === x} onClick={() => setSlotSize(x)} className={`h-6 w-7 rounded-full ${slotSize === x ? "bg-accent text-white" : "neu-in"}`}>
                {lang === "en" ? { s: "S", m: "M", l: "L" }[x] : { s: "小", m: "中", l: "大" }[x]}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-3">
          <PoolToolbar
            left={
              <>
                <IconList />
                <span>{t(`${totalOf(side)}枚`, `${totalOf(side)}`)}</span>
              </>
            }
            searchOpen={searchOpen}
            onSearch={() => setSearchOpen((x) => !x)}
          />
        </div>
        {searchOpen && (
          <div className="mt-3">
            <QueryBox
              autoFocus
              value={input}
              onChange={(x) => {
                setInput(x);
                clearTimeout(timer.current);
                timer.current = setTimeout(() => {
                  setQ(x.trim());
                  setExcluded(new Set());
                }, 350);
              }}
              onSubmit={(x) => {
                clearTimeout(timer.current);
                setQ(x.trim());
                setExcluded(new Set());
              }}
              conds={parsed}
              excluded={excluded}
              onToggle={(cid) => setExcluded((st) => (st.has(cid) ? new Set([...st].filter((x) => x !== cid)) : new Set([...st, cid])))}
            />
          </div>
        )}
      </div>

      <div className="px-4">
        <p className="mb-2 text-center text-[11px] font-bold text-muted">
          {t("タップで詳細 ・ 長押しで追加 ・ 上の枠はタップで絵柄・ミラー、長押しで1枚減らす", "Tap for details ・ long-press to add ・ tap a slot above for art/mirror, long-press to remove one")}
        </p>
        <PoolGrid hits={hits} counts={counts} onTap={(c) => openCard(c.id, hits.map((h) => h.card.id))} />
      </div>

      <button
        type="button"
        onClick={() => navigate(`/tools/list/${list.id}`, { replace: true })}
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
      {editing && <ItemSheet listId={list.id} kind={list.kind} target={editing} onChange={setEditing} onClose={() => setEditing(undefined)} />}
    </div>
  );
}

const IconList = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current stroke-[2.2]" aria-hidden>
    <path d="M9 6h11M9 12h11M9 18h11" strokeLinecap="round" />
    <circle cx="4.5" cy="6" r="1.2" />
    <circle cx="4.5" cy="12" r="1.2" />
    <circle cx="4.5" cy="18" r="1.2" />
  </svg>
);

/** リストを共有URL・共有コード・画像で書き出す */
function useListExport(list: Pick<CardList, "name" | "kind" | "items"> | undefined) {
  const show = useToast((s) => s.show);
  const t = useT();
  const lang = useLang();
  const ref = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);
  const [preview, setPreview] = useState<string>();
  const share = async () => {
    if (!list) return;
    const url = listUrlOf(list, lang);
    try {
      if (navigator.share) await navigator.share({ title: list.name, url });
      else {
        await navigator.clipboard.writeText(url);
        show(t("共有URLをコピーしました", "Share URL copied"));
      }
    } catch {
      prompt(t("このURLをコピーしてください", "Copy this URL"), url);
    }
  };
  const copyCode = async () => {
    if (!list) return;
    const code = encodeList(list);
    try {
      await navigator.clipboard.writeText(code);
      show(t("共有コードをコピーしました。相手はリストの「読み込み」に貼り付けると取り込めます", "Share code copied. Paste it into “Import” on the Lists screen."));
    } catch {
      prompt(t("この共有コードをコピーしてください", "Copy this share code"), code);
    }
  };
  const savePng = async () => {
    if (!list || !ref.current) return;
    setExporting(true);
    try {
      const imgs = [...ref.current.querySelectorAll("img")];
      await Promise.all(imgs.map((img) => (img.complete ? Promise.resolve() : new Promise<void>((res) => { img.onload = () => res(); img.onerror = () => res(); }))));
      const opts = { pixelRatio: 2, backgroundColor: "#e6ecf3", skipFonts: true };
      // iPhone・Mac の Safari は1回目に画像が間に合わないことがあるので、一度空振りで描く（デッキの画像と同じ）
      if (navigator.vendor === "Apple Computer, Inc.") await toPng(ref.current, opts);
      setPreview(await toPng(ref.current, opts));
    } catch {
      show(t("画像を作れませんでした", "Couldn't create the image"), "error");
    } finally {
      setExporting(false);
    }
  };
  const image = list && (
    <>
      <div style={{ position: "fixed", left: -10000, top: 0 }} aria-hidden>
        <ListImage ref={ref} list={list} />
      </div>
      {preview && (
        <ImagePreview
          url={preview}
          label={t("リストの画像", "List image")}
          onClose={() => setPreview(undefined)}
          onDownload={async () => download(`${list.name}.png`, await (await fetch(preview)).blob(), "image/png")}
        />
      )}
    </>
  );
  return { share, copyCode, savePng, exporting, image };
}

/** 画像に書き出すリスト（画面には出さない）。区分ごとにカードを並べ、共有URLの QR コードを入れる */
function ListImage({ list, ref }: { list: Pick<CardList, "name" | "kind" | "items">; ref: React.Ref<HTMLDivElement> }) {
  const { byId } = useData();
  const idx = usePrintIndex();
  const lang = useSettings((s) => s.imageLang);
  const uiLang = useLang();
  const t = useT();
  const url = listUrlOf(list, uiLang);
  // 長すぎるURLは QR コードに入りきらないので入れない
  const qr = url.length <= 1800 ? qrImage(url) : undefined;
  const panel = { borderRadius: 24, background: "#f3f6fa", border: "2px solid #dbe3ee", padding: 16 };
  const src = (card: AppCard, print: string) => {
    const p = card.prints.find((x) => x.id === print);
    if (!p || print === card.id) return thumbUrl(card, lang);
    const u = printImageUrl(p, lang);
    return /^https?:/.test(u) ? thumbUrl(card, lang) : u; // ほかのサイトの画像は画像に取り込めないので、サムネイル
  };
  return (
    <div ref={ref} style={{ width: 1200, padding: 28, background: "#e6ecf3", color: "#3d4757", fontFamily: "'Hiragino Maru Gothic ProN', 'Hiragino Sans', 'Yu Gothic', 'Meiryo', system-ui, sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
        <div style={{ fontSize: 32, fontWeight: 800, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{list.name}</div>
        <div style={{ fontSize: 18, fontWeight: 800, color: "#8794a7", whiteSpace: "nowrap" }}>{list.kind === "trade" ? t("トレード用リスト", "Trade list") : t(`${total(list.items)}枚`, `${total(list.items)} cards`)}</div>
      </div>
      {SIDES[list.kind].map((side) => {
        const rows = list.items.filter((it) => it.side === side).map((it) => ({ it, card: cardOfPrint(it.print, byId, idx) })).filter((r) => r.card);
        return (
          <div key={side} style={{ ...panel, marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 18, fontWeight: 800, color: "#5b6779", marginBottom: 10 }}>
              <span>{uiLang === "en" ? SIDE_LABEL[side][1] : SIDE_LABEL[side][0]}</span>
              <span style={{ color: "#8794a7" }}>{t(`${total(rows.map((r) => r.it))}枚`, `${total(rows.map((r) => r.it))}`)}</span>
            </div>
            {rows.length ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 10 }}>
                {rows.map(({ it, card }, i) => (
                  <div key={i} style={{ position: "relative" }}>
                    <img src={src(card!, it.print)} alt={cardName(card!, uiLang)} style={{ width: "100%", aspectRatio: "367/512", borderRadius: 6, objectFit: "cover", display: "block" }} />
                    {it.mirror && (
                      <span style={{ position: "absolute", top: "6%", left: "50%", transform: "translateX(-50%)", borderRadius: 999, padding: "2px 8px", fontSize: 12, fontWeight: 800, color: "#fff", whiteSpace: "nowrap", background: "linear-gradient(120deg,#7dd3fc,#c084fc 45%,#f9a8d4 70%,#fde68a)" }}>
                        {t("ミラー", "Mirror")}
                      </span>
                    )}
                    {it.n > 1 && <span style={{ position: "absolute", right: 0, bottom: 0, borderRadius: "8px 0 6px 0", background: "#3d4757", color: "#fff", fontSize: 15, fontWeight: 800, padding: "1px 7px" }}>×{it.n}</span>}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 15, fontWeight: 700, color: "#8794a7" }}>{t("なし", "None")}</div>
            )}
          </div>
        );
      })}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 14 }}>
        {qr && <img src={qr.url} alt="" width={qr.size} height={qr.size} style={{ width: qr.size, height: qr.size, imageRendering: "pixelated", flexShrink: 0 }} />}
        <div style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, color: "#7a8796" }}>{qr ? t("カメラで読み取ると、POKÉPOKE INDECKS でこのリストを開けます", "Scan to open this list in POKÉPOKE INDECKS") : ""}</div>
        <div style={{ fontSize: 13, color: "#8794a7", fontWeight: 700, whiteSpace: "nowrap" }}>
          POKÉPOKE IN<span style={{ color: "#22998b" }}>DECKS</span>
        </div>
      </div>
    </div>
  );
}

// ---------------- 共有されたリスト ----------------

function SharedListPage({ code }: { code: string }) {
  const idx = usePrintIndex();
  const create = useLists((s) => s.create);
  const show = useToast((s) => s.show);
  const t = useT();
  const shared = useMemo(() => {
    try {
      return decodeList(decodeURIComponentSafe(code), idx);
    } catch {
      return undefined;
    }
  }, [code, idx]);
  const exp = useListExport(shared);
  if (!shared) return <Header title={t("共有されたリストを読めませんでした", "Couldn't read the shared list")} back={() => navigate("/tools")} />;
  return (
    <div>
      <Header title={t(`共有リスト: ${shared.name}`, `Shared list: ${shared.name}`)} back={() => navigate("/tools")} />
      <div className="mx-auto max-w-3xl space-y-4 px-4 pb-8">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-[#ffe9c7] px-2 py-0.5 text-[10px] font-extrabold text-[#8a5c0c]">{shared.kind === "trade" ? t("トレード用", "Trade") : t("リスト", "List")}</span>
          <span className="text-xs font-bold text-muted">{t(`${total(shared.items)}枚`, `${total(shared.items)} cards`)}</span>
          <button type="button" onClick={exp.savePng} disabled={exp.exporting} className="neu-sm neu-press ml-auto rounded-full px-3 py-1.5 text-xs font-extrabold text-muted disabled:opacity-50">
            {exp.exporting ? t("画像を作成中…", "Creating…") : t("画像で保存", "Save as image")}
          </button>
        </div>
        {SIDES[shared.kind].map((side) => (
          <ListSection key={side} list={{ id: "", kind: shared.kind, items: shared.items }} side={side} readOnly />
        ))}
        <button
          type="button"
          className="btn-ok w-full rounded-full py-4 text-lg"
          onClick={() => {
            const id = create(shared.kind, shared.name, shared.items);
            show(t("マイリストに保存しました", "Saved to your lists"));
            navigate(`/tools/list/${id}`);
          }}
        >
          {t("マイリストに保存", "Save to my lists")}
        </button>
      </div>
      {exp.image}
    </div>
  );
}

// ---------------- PC: 右の列（デッキの代わりにリストを出す） ----------------
// PCでは、リストを開くと右の列がそのリストになる。左のカード一覧・真ん中のカード詳細はそのまま使え、
// 一覧の長押し・詳細の「＋ リストに追加」でこのリストに足す（デッキ編集と同じ）

/** 右の列のリストの、カードごとの枚数（左のカード一覧の枚数表示に使う。今の追加先の区分だけ） */
export function useListCounts(id: string | undefined): Map<string, number> | undefined {
  const { byId } = useData();
  const idx = usePrintIndex();
  const list = useLists((s) => s.lists.find((l) => l.id === id));
  const side = useEditTarget((s) => (s.list && s.list.id === id ? s.list.side : undefined));
  return useMemo(() => {
    if (!list || !side) return undefined;
    const m = new Map<string, number>();
    for (const it of list.items) {
      const c = it.side === side && cardOfPrint(it.print, byId, idx);
      if (c) m.set(c.id, (m.get(c.id) ?? 0) + it.n);
    }
    return m;
  }, [list, side, byId, idx]);
}

const colBtn = "neu-sm neu-press rounded-2xl py-2 text-xs font-extrabold disabled:opacity-40";

export function ListColumn({ id, onClose }: { id: string; onClose: () => void }) {
  const list = useLists((s) => s.lists.find((l) => l.id === id));
  const { rename, remove, setItem } = useLists();
  const { byId } = useData();
  const idx = usePrintIndex();
  const show = useToast((s) => s.show);
  const t = useT();
  const lang = useLang();
  const exp = useListExport(list);
  const sides = SIDES[list?.kind ?? "list"];
  const [side, setSide] = useState<ListSide>(sides[0]);
  const [editing, setEditing] = useState<Pick<ListItem, "print" | "mirror" | "side">>();
  useEffect(() => {
    if (!list) return;
    useEditTarget.setState({ list: { id, side } });
    return () => useEditTarget.setState({ list: undefined });
  }, [id, side, !!list]);
  if (!list)
    return (
      <div className="space-y-3 p-4 text-sm font-bold text-muted">
        <p>{t("リストが見つかりません", "List not found")}</p>
        <button type="button" onClick={onClose} className="neu-sm neu-press rounded-full px-3 py-1.5 text-xs font-extrabold">
          {t("← デッキに戻る", "← Back to deck")}
        </button>
      </div>
    );
  const rows = list.items.map((it, i) => ({ it, i, card: cardOfPrint(it.print, byId, idx) })).filter((r): r is { it: ListItem; i: number; card: AppCard } => r.it.side === side && !!r.card);
  return (
    <div className="space-y-3 p-4">
      <div className="flex items-center gap-2">
        <button type="button" onClick={onClose} className="neu-sm neu-press rounded-full px-3 py-1.5 text-xs font-extrabold text-muted">
          {t("← デッキ", "← Deck")}
        </button>
        <div className="flex-1" />
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${list.kind === "trade" ? "bg-[#ffe9c7] text-[#8a5c0c]" : "neu-in text-muted"}`}>{lang === "en" ? KIND_LABEL[list.kind][1] : KIND_LABEL[list.kind][0]}</span>
        <button type="button" onClick={() => navigate("/tools/lists")} className="neu-sm neu-press rounded-full px-3 py-1.5 text-xs font-extrabold text-muted">
          {t("リスト一覧", "All lists")}
        </button>
      </div>
      <input value={list.name} onChange={(e) => rename(list.id, e.target.value)} aria-label={t("リストの名前", "List name")} className="neu-in w-full rounded-full px-4 py-2 text-sm font-extrabold outline-none" />
      <div className="flex items-center gap-2">
        <span className="text-sm font-extrabold text-muted">{t(`${total(list.items.filter((x) => x.side === side))} 枚`, `${total(list.items.filter((x) => x.side === side))} cards`)}</span>
        <div className="flex-1" />
        {sides.length > 1 && (
          <div className="neu-in flex rounded-full p-0.5 text-xs font-bold">
            {sides.map((sd) => (
              <button key={sd} type="button" aria-pressed={side === sd} onClick={() => setSide(sd)} className={`rounded-full px-3 py-1 ${side === sd ? "bg-white text-accent shadow" : "text-muted"}`}>
                {lang === "en" ? SIDE_LABEL[sd][1] : SIDE_LABEL[sd][0]} {total(list.items.filter((x) => x.side === sd))}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="neu-in grid grid-cols-5 gap-1.5 rounded-2xl p-2.5">
        {rows.map((r) => (
          <Pressable
            key={`${r.it.print}-${r.it.mirror ? 1 : 0}`}
            onTap={() => setEditing({ print: r.it.print, mirror: r.it.mirror, side: r.it.side })}
            onLongPress={() => {
              setItem(list.id, r.i, { ...r.it, n: r.it.n - 1 });
              show(t(`「${r.card.nameJa}」を1枚減らしました`, `Removed one ${r.card.nameEn}`));
            }}
            label={t(`${r.card.nameJa} ${r.it.n}枚（タップで設定・長押しで1枚減らす）`, `${cardName(r.card, lang)} ×${r.it.n} (tap to edit, long-press to remove one)`)}
            className="pop-in rounded-[4px] shadow-[1px_2px_3px_rgb(150_165_185/0.5)]"
          >
            <PrintThumb card={r.card} print={r.it.print} mirror={r.it.mirror} n={r.it.n} />
          </Pressable>
        ))}
        {Array.from({ length: Math.max(5 - (rows.length % 5 || 5), rows.length ? 0 : 5) }, (_, i) => (
          <div key={`e${i}`} className="flex aspect-[367/512] items-center justify-center rounded-[4px] border border-dashed border-[#c5cfdb] text-sm text-[#b8c3d1]">
            ＋
          </div>
        ))}
      </div>
      <p className="text-[11px] font-bold text-muted">
        {t(
          "左の一覧で長押し、またはカード詳細の「＋ リストに追加」で追加。ここのカードはタップで絵柄・ミラー・枚数、長押しで1枚減らす",
          "Long-press a card on the left, or use “＋ Add to list” in the card details. Tap a card here for art/mirror/count, long-press to remove one",
        )}
      </p>
      <div className="grid grid-cols-3 gap-2">
        <button type="button" disabled={!list.items.length || exp.exporting} onClick={exp.savePng} className={colBtn}>
          {exp.exporting ? t("作成中…", "Creating…") : t("画像で保存", "Save image")}
        </button>
        <button type="button" disabled={!list.items.length} onClick={exp.share} className={colBtn}>
          {t("共有URL", "Share URL")}
        </button>
        <button type="button" disabled={!list.items.length} onClick={exp.copyCode} className={colBtn}>
          {t("コードをコピー", "Copy code")}
        </button>
        <button
          type="button"
          onClick={() => {
            if (!confirm(t(`「${list.name}」を削除しますか？`, `Delete “${list.name}”?`))) return;
            remove(list.id);
            onClose();
          }}
          className={`${colBtn} col-start-3 text-danger`}
        >
          {t("削除", "Delete")}
        </button>
      </div>
      {editing && <ItemSheet listId={list.id} kind={list.kind} target={editing} onChange={setEditing} onClose={() => setEditing(undefined)} />}
      {exp.image}
    </div>
  );
}

/** PCの右の列: 共有されたリスト（カードをタップすると真ん中に詳細が出る） */
export function SharedListColumn({ code, onClose }: { code: string; onClose: () => void }) {
  const idx = usePrintIndex();
  const create = useLists((s) => s.create);
  const show = useToast((s) => s.show);
  const t = useT();
  const shared = useMemo(() => {
    try {
      return decodeList(decodeURIComponentSafe(code), idx);
    } catch {
      return undefined;
    }
  }, [code, idx]);
  const exp = useListExport(shared);
  return (
    <div className="space-y-3 p-4">
      <div className="flex items-center gap-2">
        <button type="button" onClick={onClose} className="neu-sm neu-press rounded-full px-3 py-1.5 text-xs font-extrabold text-muted">
          {t("← デッキ", "← Deck")}
        </button>
        <span className="min-w-0 flex-1 truncate text-sm font-extrabold">{shared ? t(`共有リスト: ${shared.name}`, `Shared list: ${shared.name}`) : t("共有されたリストを読めませんでした", "Couldn't read the shared list")}</span>
      </div>
      {shared && (
        <>
          {SIDES[shared.kind].map((side) => (
            <ListSection key={side} list={{ id: "", kind: shared.kind, items: shared.items }} side={side} readOnly narrow />
          ))}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" disabled={exp.exporting} onClick={exp.savePng} className={colBtn}>
              {exp.exporting ? t("作成中…", "Creating…") : t("画像で保存", "Save image")}
            </button>
            <button
              type="button"
              className="btn-ok rounded-2xl py-2 text-xs"
              onClick={() => {
                const id = create(shared.kind, shared.name, shared.items);
                show(t("マイリストに保存しました", "Saved to your lists"));
                navigate(`/tools/list/${id}`);
              }}
            >
              {t("マイリストに保存", "Save to my lists")}
            </button>
          </div>
        </>
      )}
      {exp.image}
    </div>
  );
}

function decodeURIComponentSafe(s: string) {
  // ブラウザによっては # 以降を %7E のように書き換えるので戻す（名前の部分はリストのコードの中でもう一度戻す）
  return s.replace(/%7E/gi, "~");
}

