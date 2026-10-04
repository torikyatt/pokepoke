import { useMemo, useState } from "react";
import { Chip, Cost, EnergyIcon, Header, PoolCard, Thumb } from "../components/ui.tsx";
import { useAddToDeck, useData } from "../context.tsx";
import { largeUrl, thumbUrl } from "../data/load.ts";
import { useSettings } from "../store.ts";
import { useNav } from "../nav.ts";

/** 詳細を閉じて、今のタブの元の画面に戻る（ブラウザの「戻る」だとタブをまたいでしまう） */
function closeCard() {
  const s = useNav.getState();
  location.hash = s.base[s.active];
}
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
  const lang = useSettings((s) => s.imageLang);
  if (!card) return <Header title="カードが見つかりません" back={closeCard} />;

  const tagChip = (t: string) => (
    <Chip key={t} tone="match" onClick={() => navigate(searchPath({ tag: t }))}>
      {engine.tagJa.get(t) ?? t}
    </Chip>
  );

  return (
    <div>
      <Header title={card.nameJa} back={closeCard} />
      <div className="mx-auto max-w-3xl space-y-5 px-4 py-4">
        <div className="flex gap-4">
          <div className="w-40 shrink-0 sm:w-56">
            <img
              key={`${card.id}-${lang}`}
              src={hires ? largeUrl(card, lang) : thumbUrl(card, lang)}
              onError={() => setHires(false)}
              alt={card.nameJa}
              className="aspect-[367/512] w-full rounded-xl bg-line object-cover shadow-[3px_5px_12px_rgb(150_165_185/0.55)]"
            />
          </div>
          <div className="min-w-0 flex-1 space-y-2 text-sm">
            <div>
              <div className="text-xl leading-tight font-extrabold">
                {card.nameJa}
                {card.nameMachine && <MachineBadge />}
              </div>
              <div className="text-xs font-bold text-muted">{card.nameEn}</div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {card.type && <EnergyIcon type={card.type} />}
              <Chip active>{card.kind === "pokemon" ? (card.stage ? STAGE_JA[card.stage] : "ポケモン") : KIND_JA[card.kind]}</Chip>
              {card.rule !== "normal" && <Chip tone="text">{RULE_JA[card.rule]}</Chip>}
              {card.groups.map((g) => (
                <Chip key={g}>{GROUP_JA[g]}</Chip>
              ))}
            </div>
            {card.kind === "pokemon" && (
              <dl className="neu-in grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 rounded-2xl p-3 text-xs font-bold">
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
            <button type="button" onClick={() => addToDeck(card)} className="btn-ok w-full rounded-full py-2.5 text-sm">
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
            <h2 className="mb-2 text-sm font-extrabold text-muted">進化ライン</h2>
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {line.map((group, i) => (
                <div key={i} className="flex items-center gap-2">
                  {i > 0 && <span className="font-extrabold text-muted">→</span>}
                  {group.map((c) => (
                    <button key={c.id} type="button" onClick={() => navigate(`/card/${c.id}`)} className={`w-16 shrink-0 rounded-md ${c.id === card.id ? "ring-[3px] ring-accent" : ""}`}>
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
            <h2 className="mb-2 text-sm font-extrabold text-muted">相性のいいカード</h2>
            <div className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 pb-2">
              {partners.map((p) => (
                <div key={p.card.id} className="w-24 shrink-0">
                  <PoolCard card={p.card} onTap={() => navigate(`/card/${p.card.id}`)} onLongPress={() => addToDeck(p.card)} />
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

        <section>
          <h2 className="mb-1 text-sm font-extrabold text-muted">収録</h2>
          <ul className="neu space-y-0.5 rounded-2xl p-3 text-xs font-bold text-muted">
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
