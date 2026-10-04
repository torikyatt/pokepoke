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

/** 順位の良さ（上位何%か）。順位が分からなければ勝ち越し数で */
const strength = (d: TournamentDeck) => (d.place ? d.place / Math.max(d.players, 1) : 1) - (d.wins - d.losses) * 0.001;

export function CardDecks({ card, keepOpen }: { card: AppCard; keepOpen?: boolean }) {
  const index = useTournamentDecks();
  const [arch, setArch] = useState<string>();
  const [shown, setShown] = useState(PAGE);
  // 2年分あるので、既定は新しい大会から（同じ日なら成績の良い順）
  const [order, setOrder] = useState<"new" | "best">("new");
  const all = useMemo(() => {
    if (!index) return [];
    const list = (index.byCard.get(card.id) ?? []).map((i) => index.decks[i]);
    return order === "new"
      ? list.sort((a, b) => b.date.localeCompare(a.date) || strength(a) - strength(b))
      : list.sort((a, b) => strength(a) - strength(b) || b.date.localeCompare(a.date));
  }, [index, card.id, order]);
  // よく使われているデッキタイプ（絞り込み用）
  const archs = useMemo(() => {
    const m = new Map<string, { name: string; n: number }>();
    for (const d of all) {
      const x = m.get(d.archId) ?? m.set(d.archId, { name: d.arch, n: 0 }).get(d.archId)!;
      x.n += d.dup;
    }
    return [...m].sort((a, b) => b[1].n - a[1].n).slice(0, 8);
  }, [all]);
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
              {(["new", "best"] as const).map((o) => (
                <button key={o} type="button" onClick={() => { setOrder(o); setShown(PAGE); }} className={`rounded-full px-2.5 py-1 ${order === o ? "bg-white text-accent shadow" : "text-muted"}`}>
                  {o === "new" ? "新しい順" : "成績順"}
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
