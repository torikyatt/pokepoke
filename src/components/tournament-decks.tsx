// カード詳細の「このカードを使ったデッキ」: 大会で使われたデッキリストを並べ、そのまま自分のデッキとしてコピーできる
import { useMemo, useState } from "react";
import { useData } from "../context.tsx";
import { useTournamentDecks, type TournamentDeck } from "../data/decks.ts";
import { closeDetail, openCard } from "../detail.ts";
import { navigate } from "../router.ts";
import { guessEnergy } from "../deck.ts";
import { useDecks, useToast } from "../store.ts";
import type { AppCard } from "../types.ts";
import { Chip, EnergyIcon, Thumb } from "./ui.tsx";

const PAGE = 8;

/** 順位の良さ（上位何%か。小さいほど良い）。順位が分からなければ勝ち越し数で */
const strength = (d: TournamentDeck) => (d.place ? d.place / Math.max(d.players, 1) : 1) - (d.wins - d.losses) * 0.001;

type Order = "recommended" | "new" | "best";
const ORDERS: [Order, string][] = [["recommended", "おすすめ"], ["new", "新しい順"], ["best", "成績順"]];
const DAY = 86400e3;
const HALF_LIFE_DAYS = 21; // 3週間ごとに重みが半分になる

/**
 * おすすめ度: 最近の大会で好成績なものほど高い。
 *   成績 = 上位何%か（1位なら1に近い）＋ 上位8位以内なら加点 ＋ 大きな大会なら少し加点 ＋ 同じ構成が多ければ少し加点
 *   新しさ = 最新の大会から3週間ごとに半分
 */
function recommendScore(d: TournamentDeck, newest: number): number {
  const top = d.place ? 1 - (d.place - 1) / Math.max(d.players, 1) : Math.max(0, 0.5 + (d.wins - d.losses) * 0.05);
  const quality = top + (d.place && d.place <= 8 ? 0.3 : 0) + 0.1 * Math.log10(Math.max(d.players, 32) / 32) + 0.05 * Math.log2(d.dup);
  const age = Math.max(0, (newest - Date.parse(d.date)) / DAY);
  return quality * 0.5 ** (age / HALF_LIFE_DAYS);
}

export function CardDecks({ card, keepOpen }: { card: AppCard; keepOpen?: boolean }) {
  const index = useTournamentDecks();
  const [arch, setArch] = useState<string>();
  const [shown, setShown] = useState(PAGE);
  // 既定は「おすすめ」（最近の大会で好成績なもの）
  const [order, setOrder] = useState<Order>("recommended");
  const all = useMemo(() => {
    if (!index) return [];
    const list = (index.byCard.get(card.id) ?? []).map((i) => index.decks[i]);
    if (order === "new") return list.sort((a, b) => b.date.localeCompare(a.date) || strength(a) - strength(b));
    if (order === "best") return list.sort((a, b) => strength(a) - strength(b) || b.date.localeCompare(a.date));
    const score = new Map(list.map((d) => [d, recommendScore(d, index.newest)]));
    return list.sort((a, b) => score.get(b)! - score.get(a)! || b.date.localeCompare(a.date));
  }, [index, card.id, order]);
  // よく使われているデッキタイプ（絞り込み用）。おすすめ順では、最近の大会で強いデッキタイプから
  const archs = useMemo(() => {
    const m = new Map<string, { name: string; n: number; rec: number }>();
    for (const d of all) {
      const x = m.get(d.archId) ?? m.set(d.archId, { name: d.arch, n: 0, rec: 0 }).get(d.archId)!;
      x.n += d.dup;
      if (order === "recommended" && index) x.rec += recommendScore(d, index.newest);
    }
    return [...m].sort((a, b) => (order === "recommended" ? b[1].rec - a[1].rec : 0) || b[1].n - a[1].n).slice(0, 8);
  }, [all, order, index]);
  const list = arch ? all.filter((d) => d.archId === arch) : all;
  const total = all.reduce((n, d) => n + d.dup, 0);

  return (
    <section>
      <h2 className="mb-2 text-sm font-extrabold text-muted">このカードを使ったデッキ（大会）</h2>
      {!index ? (
        <p className="neu rounded-2xl p-4 text-center text-xs font-bold text-muted">大会のデッキを読み込み中…</p>
      ) : !all.length ? (
        <p className="neu rounded-2xl p-4 text-center text-xs font-bold text-muted">勝ち越したデッキでの使用はまだ見つかっていません</p>
      ) : (
        <div className="space-y-2.5">
          <div className="flex items-center gap-2">
            <p className="min-w-0 flex-1 text-[11px] font-bold text-muted">
              勝ち越し・五分のデッキ {total} 件（同じ構成をまとめて {all.length} 種類）
            </p>
            <div className="neu-in flex shrink-0 rounded-full p-0.5 text-[11px] font-bold">
              {ORDERS.map(([o, label]) => (
                <button key={o} type="button" onClick={() => { setOrder(o); setShown(PAGE); }} className={`rounded-full px-2 py-1 ${order === o ? "bg-white text-accent shadow" : "text-muted"}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          {archs.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              <Chip active={!arch} onClick={() => { setArch(undefined); setShown(PAGE); }}>
                すべて
              </Chip>
              {archs.map(([id, a]) => (
                <Chip key={id} active={arch === id} onClick={() => { setArch(arch === id ? undefined : id); setShown(PAGE); }}>
                  {a.name} <span className="opacity-70">{a.n}</span>
                </Chip>
              ))}
            </div>
          )}
          {list.slice(0, shown).map((d, i) => (
            <DeckRow key={`${d.archId}-${i}-${d.date}`} d={d} highlight={card.id} keepOpen={keepOpen} />
          ))}
          {list.length > shown && (
            <button type="button" onClick={() => setShown((n) => n + PAGE)} className="neu-sm neu-press w-full rounded-full py-2 text-xs font-extrabold text-muted">
              もっと見る（あと {list.length - shown} 種類）
            </button>
          )}
          <p className="text-[10px] font-medium text-muted">Limitless TCG の大会結果（{index.fetchedAt.slice(0, 10)} 取得）</p>
        </div>
      )}
    </section>
  );
}

function DeckRow({ d, highlight, keepOpen }: { d: TournamentDeck; highlight: string; keepOpen?: boolean }) {
  const { byId } = useData();
  const importDecks = useDecks((s) => s.importDecks);
  const show = useToast((s) => s.show);
  // ポケモン → トレーナーズの順、図鑑順に
  const cards = d.cards
    .map(([id, n]) => ({ card: byId.get(id)!, n }))
    .filter((x) => x.card)
    .sort((a, b) => Number(a.card.kind !== "pokemon") - Number(b.card.kind !== "pokemon") || a.card.order - b.card.order);

  const copy = () => {
    const name = `${d.arch} ${d.date.slice(5).replace("-", "/")}${d.place ? ` ${d.place}位` : ""}`;
    const ids = cards.flatMap(({ card, n }) => Array(n).fill(card.id) as string[]);
    // 大会のリストにエネルギーが無いときは、カードから決める
    importDecks([{ name, energy: d.energy.length ? d.energy.slice(0, 3) : guessEnergy({ cards: ids }, byId), cards: ids }]);
    const id = useDecks.getState().currentId!;
    show(`「${name}」をマイデッキにコピーしました`);
    // スマホはそのまま編集画面へ。PCは右の列が新しいデッキになる
    if (!keepOpen) closeDetail(() => navigate(`/deck/${id}/edit`));
  };

  return (
    <div className="neu rounded-2xl p-3">
      <div className="flex items-center gap-1.5">
        <span className="min-w-0 flex-1 truncate text-sm font-extrabold">{d.arch}</span>
        {d.energy.map((t) => (
          <EnergyIcon key={t} type={t} size="sm" />
        ))}
      </div>
      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[10px] font-bold text-muted">
        <span className="max-w-full truncate">{d.tournament}</span>
        <span>{d.date}</span>
        {d.place > 0 && (
          <span className="text-accent-deep">
            {d.place}位／{d.players}人
          </span>
        )}
        <span>
          {d.wins}勝{d.losses}敗{d.ties ? `${d.ties}分` : ""}
        </span>
        {d.dup > 1 && <span>同じ構成 ×{d.dup}</span>}
      </div>
      <div className="mt-2 grid grid-cols-8 gap-1">
        {cards.map(({ card, n }) => (
          <button key={card.id} type="button" onClick={() => openCard(card.id)} aria-label={`${card.nameJa} ${n}枚`} className={`relative rounded-[3px] ${card.id === highlight ? "ring-2 ring-accent" : ""}`}>
            <Thumb card={card} className="rounded-[3px]" />
            {n > 1 && <span className="absolute right-0 bottom-0 rounded-tl-[4px] bg-badge px-1 text-[9px] leading-tight font-extrabold text-white">×{n}</span>}
          </button>
        ))}
      </div>
      <button type="button" onClick={copy} className="btn-ok mt-2.5 w-full rounded-full py-2 text-xs tracking-normal">
        このデッキをコピーして編集
      </button>
    </div>
  );
}
