import { useMemo, useState } from "react";
import { CardImage, Chip, Cost, EnergyIcon, Header, Thumb } from "../components/ui.tsx";
import { useAddToDeck, useData } from "../context.tsx";
import { thumbUrl } from "../data/load.ts";
import { navigate, searchPath } from "../router.ts";
import type { AppAttack, AppCard, AppEffect } from "../types.ts";
import { GROUP_JA, KIND_JA, RULE_JA, STAGE_JA, TYPE_JA } from "../types.ts";

export function CardPage({ id }: { id: string }) {
  const { byId, synergy, engine } = useData();
  const addToDeck = useAddToDeck();
  const card = byId.get(id);
  const partners = useMemo(() => (card ? synergy.partners(card) : []), [card, synergy]);
  const line = useMemo(() => (card && card.kind === "pokemon" ? synergy.evolutionLine(card) : []), [card, synergy]);
  const [hires, setHires] = useState(true);
  if (!card) return <Header title="カードが見つかりません" back />;

  const tagChip = (t: string) => (
    <Chip key={t} tone="blue" onClick={() => navigate(searchPath({ tag: t }))}>
      {engine.tagJa.get(t) ?? t}
    </Chip>
  );

  return (
    <div>
      <Header title={card.nameJa} back />
      <div className="mx-auto max-w-3xl space-y-5 px-4 py-4">
        <div className="flex gap-4">
          <div className="w-40 shrink-0 sm:w-56">
            <img
              src={hires ? card.image : thumbUrl(card)}
              onError={() => setHires(false)}
              alt={card.nameJa}
              className="aspect-[367/512] w-full rounded-lg bg-slate-200 object-cover shadow dark:bg-slate-800"
            />
          </div>
          <div className="min-w-0 flex-1 space-y-2 text-sm">
            <div>
              <div className="text-lg leading-tight font-bold">
                {card.nameJa}
                {card.nameMachine && <MachineBadge />}
              </div>
              <div className="text-xs text-slate-500">{card.nameEn}</div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {card.type && <EnergyIcon type={card.type} />}
              <Chip>{card.kind === "pokemon" ? (card.stage ? STAGE_JA[card.stage] : "ポケモン") : KIND_JA[card.kind]}</Chip>
              {card.rule !== "normal" && <Chip tone="amber">{RULE_JA[card.rule]}</Chip>}
              {card.groups.map((g) => (
                <Chip key={g}>{GROUP_JA[g]}</Chip>
              ))}
            </div>
            {card.kind === "pokemon" && (
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                <dt className="text-slate-500">HP</dt>
                <dd className="font-bold">{card.hp}</dd>
                <dt className="text-slate-500">弱点</dt>
                <dd>{card.weakness ? <span className="inline-flex items-center gap-1"><EnergyIcon type={card.weakness} size="sm" />+20</span> : "なし"}</dd>
                <dt className="text-slate-500">にげる</dt>
                <dd>{card.retreat ? <Cost cost={{ colorless: card.retreat }} /> : "0"}</dd>
                {card.points !== undefined && (
                  <>
                    <dt className="text-slate-500">きぜつ時</dt>
                    <dd>相手が {card.points} ポイント</dd>
                  </>
                )}
              </dl>
            )}
            <button type="button" onClick={() => addToDeck(card)} className="w-full rounded-lg bg-red-600 py-2 text-sm font-bold text-white active:bg-red-700">
              デッキに追加
            </button>
          </div>
        </div>

        <section className="space-y-3">
          {card.ability && <EffectBlock e={card.ability} label="特性" tagChip={tagChip} />}
          {card.attacks.map((a, i) => (
            <EffectBlock key={i} e={a} label="ワザ" tagChip={tagChip} />
          ))}
          {card.text && <EffectBlock e={card.text} label={KIND_JA[card.kind]} tagChip={tagChip} />}
        </section>

        {line.length > 1 && (
          <section>
            <h2 className="mb-2 text-sm font-bold">進化ライン</h2>
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {line.map((group, i) => (
                <div key={i} className="flex items-center gap-2">
                  {i > 0 && <span className="text-slate-400">→</span>}
                  {group.map((c) => (
                    <button key={c.id} type="button" onClick={() => navigate(`/card/${c.id}`)} className={`w-16 shrink-0 ${c.id === card.id ? "ring-2 ring-red-500 rounded-md" : ""}`}>
                      <Thumb card={c} />
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </section>
        )}

        {partners.length > 0 && (
          <section>
            <h2 className="mb-2 text-sm font-bold">相性のいいカード</h2>
            <div className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 pb-2">
              {partners.map((p) => (
                <div key={p.card.id} className="w-24 shrink-0">
                  <CardImage card={p.card} onLongPress={() => addToDeck(p.card)} />
                  <div className="mt-1 text-[10px] leading-tight text-slate-600 dark:text-slate-400">
                    {p.reasons.slice(0, 2).map((r) => (
                      <div key={r}>{r}</div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <section>
          <h2 className="mb-1 text-sm font-bold">収録</h2>
          <ul className="space-y-0.5 text-xs text-slate-600 dark:text-slate-400">
            {card.prints.map((p) => (
              <li key={p.id}>
                {p.setName}（{p.id.toUpperCase()}）{p.rarity}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

function MachineBadge() {
  return <span className="ml-1 rounded bg-amber-100 px-1 align-middle text-[10px] font-normal text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">仮訳</span>;
}

function EffectBlock({ e, label, tagChip }: { e: AppEffect; label: string; tagChip: (t: string) => React.ReactNode }) {
  const atk = e.slot === "attack" ? (e as AppAttack) : undefined;
  const dmg = atk?.damage !== undefined ? `${atk.damage}${atk.damageVariable ? (/for each/i.test(atk.textEn ?? "") ? "×" : "+") : ""}` : atk?.damageVariable ? "?" : "";
  return (
    <div className="rounded-lg bg-white p-3 shadow-sm dark:bg-slate-900">
      <div className="flex items-center gap-2">
        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">{label}</span>
        {atk && <Cost cost={atk.cost} />}
        <span className="min-w-0 flex-1 truncate font-bold">
          {e.nameJa ?? (label === "ワザ" || label === "特性" ? e.nameEn : "")}
          {e.machine && <MachineBadge />}
        </span>
        {dmg && <span className="text-lg font-bold tabular-nums">{dmg}</span>}
      </div>
      {e.textJa && <p className="mt-1.5 text-sm leading-relaxed">{e.textJa}</p>}
      {(e.textEn || e.nameEn) && (
        <details className="mt-1.5 text-xs text-slate-500">
          <summary className="cursor-pointer select-none">英語原文</summary>
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
