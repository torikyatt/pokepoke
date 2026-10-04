import { useMemo, useState } from "react";
import { Chip, Cost, EnergyIcon, PoolCard, Thumb } from "../components/ui.tsx";
import { useData } from "../context.tsx";
import { closeDetail, openCard } from "../detail.ts";
import { PrintLine } from "../components/prints.tsx";
import { PrintGallery } from "../components/print-gallery.tsx";
import { CardDecks } from "../components/tournament-decks.tsx";
import { navigate, searchPath } from "../router.ts";
import type { AppAttack, AppCard, AppEffect } from "../types.ts";
import { GROUP_JA, KIND_JA, RULE_JA, STAGE_JA, TYPE_JA } from "../types.ts";

/** カード詳細の中身（スマホは下からのシート、PCは真ん中の列に入れる） */
export function CardDetail({ id, keepOpen, actions, fav }: { id: string; keepOpen?: boolean; actions?: React.ReactNode; fav?: React.ReactNode }) {
  const { byId, synergy, engine } = useData();
  const card = byId.get(id);
  const partners = useMemo(() => (card ? synergy.partners(card) : []), [card, synergy]);
  const combos = card ? synergy.combos(card) : [];
  const usage = card ? synergy.usage(card) : undefined;
  const { data } = useData();
  const line = useMemo(() => (card && card.kind === "pokemon" ? synergy.evolutionLine(card) : []), [card, synergy]);
  const [printIndex, setPrintIndex] = useState(0); // 表示中の絵柄
  if (!card) return <p className="p-6 text-center text-sm font-bold text-muted">カードが見つかりません</p>;

  // 効果のタグを押すと、そのタグで検索する（スマホは詳細を閉じてから）
  const searchQ = (q: string) => (keepOpen ? navigate(searchPath({ q })) : closeDetail(() => navigate(searchPath({ q }))));
  const searchTag = (t: string) => (keepOpen ? navigate(searchPath({ tag: t })) : closeDetail(() => navigate(searchPath({ tag: t }))));
  const tagChip = (t: string) => (
    <Chip key={t} tone="match" onClick={() => searchTag(t)}>
      {engine.tagJa.get(t) ?? t}
    </Chip>
  );

  return (
    <div className="@container">
      <div className="mx-auto max-w-3xl space-y-4 px-3 pt-3 pb-4">
        {/* 画像の横に、名前・タイプ・お気に入り・デッキの −／＋ をまとめる（スクロールせずに押せるように） */}
        <div className="flex gap-3">
          <div className="w-32 shrink-0 @sm:w-40 @lg:w-56">
            <PrintGallery card={card} index={printIndex} onIndex={setPrintIndex} />
          </div>
          <div className="min-w-0 flex-1 space-y-2 text-sm">
            <div className="flex items-start gap-1">
              <div className="min-w-0 flex-1">
                <div className="text-lg leading-tight font-extrabold">
                  {card.nameJa}
                  {card.nameMachine && <MachineBadge />}
                </div>
                <div className="truncate text-[11px] font-bold text-muted">{card.nameEn}</div>
              </div>
              {fav}
            </div>
            <div className="flex flex-wrap items-center gap-1">
              {card.type && <EnergyIcon type={card.type} />}
              <Chip active>{card.kind === "pokemon" ? (card.stage ? STAGE_JA[card.stage] : "ポケモン") : KIND_JA[card.kind]}</Chip>
              {card.rule !== "normal" && <Chip tone="text">{RULE_JA[card.rule]}</Chip>}
              {card.groups.map((g) => (
                <Chip key={g}>{GROUP_JA[g]}</Chip>
              ))}
            </div>
            {actions}
            {card.kind === "pokemon" && (
              <dl className="neu-in grid grid-cols-[auto_1fr] gap-x-2.5 gap-y-1 rounded-2xl px-3 py-2 text-xs font-bold [&_dt]:whitespace-nowrap">
                <dt className="text-muted">HP</dt>
                <dd className="font-bold">{card.hp}</dd>
                <dt className="text-muted">弱点</dt>
                <dd>{card.weakness ? <span className="inline-flex items-center gap-1"><EnergyIcon type={card.weakness} size="sm" />+20</span> : "なし"}</dd>
                <dt className="text-muted">にげる</dt>
                <dd>{card.retreat ? <Cost cost={{ colorless: card.retreat }} /> : "0"}</dd>
                {card.points !== undefined && (
                  <>
                    <dt className="text-muted">きぜつ時</dt>
                    <dd>相手が {card.points} ポイント</dd>
                  </>
                )}
              </dl>
            )}
          </div>
        </div>

        <section className="space-y-3">
          {card.ability && <EffectBlock e={card.ability} label="特性" tagChip={tagChip} />}
          {card.attacks.map((a, i) => (
            <EffectBlock key={i} e={a} label="ワザ" tagChip={tagChip} />
          ))}
          {card.text && <EffectBlock e={card.text} label={KIND_JA[card.kind]} tagChip={tagChip} />}
        </section>

        {line.reduce((n, l) => n + l.cards.length, 0) > 1 && (
          <section>
            <h2 className="mb-2 text-sm font-extrabold text-muted">進化ライン</h2>
            {/* 段ごとに、進化できるカードを全部（別のパックのものも）並べる */}
            <div className="neu space-y-1 rounded-2xl p-3">
              {line.map((level, i) => (
                <div key={i}>
                  {i > 0 && <div className="pl-3 text-xs leading-none font-extrabold text-muted">↓</div>}
                  <div className="flex items-start gap-2">
                    <span className="w-10 shrink-0 pt-1 text-[10px] font-extrabold text-muted">{level.label}</span>
                    <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
                      {level.cards.map((c) => (
                        <button key={c.id} type="button" onClick={() => openCard(c.id)} title={c.nameJa} className={`w-12 shrink-0 rounded-md ${c.id === card.id ? "ring-[3px] ring-accent" : ""}`}>
                          <Thumb card={c} />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {partners.length > 0 && (
          <section>
            <h2 className="mb-2 text-sm font-extrabold text-muted">相性のいいカード</h2>
            {/* スマホは横にスクロール、PCはマウスで横に動かしにくいので折り返して全部並べる */}
            <div className={keepOpen ? "grid grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-x-2 gap-y-3" : "scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 pb-2"}>
              {partners.map((p) => (
                <div key={p.card.id} className={keepOpen ? "min-w-0" : "w-24 shrink-0"}>
                  <PoolCard card={p.card} onTap={() => openCard(p.card.id)} />
                  <div className="mt-1 text-[10px] leading-tight font-bold text-accent-deep">
                    {p.reasons.slice(0, 2).map((r) => (
                      <div key={r}>{r}</div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {combos.length > 0 && (
          <section>
            <h2 className="mb-2 text-sm font-extrabold text-muted">定番の組み合わせ（攻略記事より）</h2>
            <ul className="space-y-2">
              {combos.map((cb, i) => (
                <li key={i} className="neu flex gap-3 rounded-2xl p-3">
                  <div className="flex shrink-0 gap-1">
                    {cb.cards
                      .filter((id) => id !== card.id)
                      .map((id) => byId.get(id))
                      .filter((c): c is AppCard => !!c)
                      .map((c) => (
                        <button key={c.id} type="button" onClick={() => openCard(c.id)} className="w-12 shrink-0" aria-label={c.nameJa}>
                          <Thumb card={c} className="rounded-[4px]" />
                        </button>
                      ))}
                  </div>
                  <div className="min-w-0 flex-1 text-xs leading-relaxed">
                    <div className="font-extrabold">
                      {cb.cards
                        .filter((id) => id !== card.id)
                        .map((id) => byId.get(id)?.nameJa)
                        .join("・")}
                    </div>
                    <p className="mt-0.5 font-medium">{cb.reason}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[10px] font-bold text-muted">
                      <span>{cb.deck}</span>
                      <a href={cb.source} target="_blank" rel="noreferrer" className="underline">
                        出典
                      </a>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {usage && data.meta && (
          <section>
            <h2 className="mb-2 text-sm font-extrabold text-muted">大会での使われ方</h2>
            <div className="neu space-y-2 rounded-2xl p-3 text-xs font-bold">
              <div>
                {usage.rate > 0 ? (
                  <>
                    勝ち越したデッキの <span className="text-base text-accent-deep tabular-nums">{(usage.rate * 100).toFixed(usage.rate < 0.1 ? 1 : 0)}%</span> に採用
                  </>
                ) : (
                  <span className="text-muted">最近の大会では、勝ち越したデッキでの採用はほぼありません</span>
                )}
              </div>
              {usage.archetypes.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {usage.archetypes.slice(0, 6).map(({ arch, rate }) => (
                    <Chip key={arch.id} onClick={() => searchQ(`${arch.nameJa}デッキ`)} title="このデッキでよく使われるカードを見る">
                      {arch.nameJa}デッキ <span className="text-accent-deep">{Math.round(rate * 100)}%</span>
                    </Chip>
                  ))}
                </div>
              )}
              <p className="text-[10px] font-medium text-muted">
                直近{data.meta.days}日・{data.meta.tournaments}大会・勝ち越した{data.meta.decks}デッキ（Limitless TCG の大会結果）。デッキ名の横の%は、そのデッキでの採用率
              </p>
            </div>
          </section>
        )}

        <section>
          <h2 className="mb-1 text-sm font-extrabold text-muted">収録</h2>
          <ul className="neu space-y-1.5 rounded-2xl p-3">
            {card.prints.map((p, i) => (
              <li key={p.id} onClick={() => setPrintIndex(i)} className={`-mx-1.5 flex cursor-pointer items-center gap-2 rounded-lg px-1.5 ${card.prints.length > 1 && i === printIndex ? "bg-[#dff4f1]" : ""}`}>
                <div className="min-w-0 flex-1">
                  <PrintLine p={p} />
                  {p.how && p.how.includes("|") && <div className="mt-0.5 truncate text-[10px] font-bold text-muted">{p.how.split(/[|｜]/).slice(1).join(" / ")}</div>}
                </div>
                <span className="shrink-0 text-[10px] font-bold text-muted">{p.id.toUpperCase()}</span>
              </li>
            ))}
          </ul>
        </section>

        <CardDecks card={card} keepOpen={keepOpen} />
      </div>
    </div>
  );
}

function MachineBadge() {
  return <span className="ml-1 rounded-full bg-[#fdf1d8] px-1.5 align-middle text-[10px] font-bold text-[#9a6b12]">仮訳</span>;
}

function EffectBlock({ e, label, tagChip }: { e: AppEffect; label: string; tagChip: (t: string) => React.ReactNode }) {
  const atk = e.slot === "attack" ? (e as AppAttack) : undefined;
  const dmg = atk?.damage !== undefined ? `${atk.damage}${atk.damageVariable ? (/for each/i.test(atk.textEn ?? "") ? "×" : "+") : ""}` : atk?.damageVariable ? "?" : "";
  return (
    <div className="neu rounded-2xl p-3.5">
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-badge px-2 py-0.5 text-[10px] font-bold text-white">{label}</span>
        {atk && <Cost cost={atk.cost} />}
        <span className="min-w-0 flex-1 truncate font-extrabold">
          {e.nameJa ?? (label === "ワザ" || label === "特性" ? e.nameEn : "")}
          {e.machine && <MachineBadge />}
        </span>
        {dmg && <span className="text-xl font-extrabold tabular-nums">{dmg}</span>}
      </div>
      {e.textJa && <p className="mt-2 text-sm leading-relaxed font-medium">{e.textJa}</p>}
      {(e.textEn || e.nameEn) && (
        <details className="mt-1.5 text-xs text-muted">
          <summary className="cursor-pointer font-bold select-none">英語原文</summary>
          <p className="mt-1">
            {e.nameEn && <b>{e.nameEn}</b>} {e.textEn}
          </p>
        </details>
      )}
      {e.tags.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{e.tags.map(tagChip)}</div>}
    </div>
  );
}

export function CardTypeLabel({ card }: { card: AppCard }) {
  return <span>{card.type ? TYPE_JA[card.type] : KIND_JA[card.kind]}</span>;
}
