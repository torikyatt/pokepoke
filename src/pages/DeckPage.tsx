import { toPng } from "html-to-image";
import { useRef, useState } from "react";
import { CardImage, Chip, EnergyIcon, Header, Thumb } from "../components/ui.tsx";
import { useData } from "../context.tsx";
import { thumbUrl } from "../data/load.ts";
import { checkDeck, decodeShare, download, encodeShare, fromFile, guessEnergy, MAX_ENERGY, sortDeckCards, toFile, canAdd } from "../deck.ts";
import { navigate } from "../router.ts";
import { useDecks, useToast, type Deck } from "../store.ts";
import type { AppCard, EnergyType } from "../types.ts";
import { TYPE_JA } from "../types.ts";

const ZONE_TYPES: EnergyType[] = ["grass", "fire", "water", "lightning", "psychic", "fighting", "darkness", "metal"];

export function DeckPage() {
  const { byId } = useData();
  const { decks, currentId, create, remove, update, select, add, removeCard, importDecks } = useDecks();
  const show = useToast((s) => s.show);
  const deck = decks.find((d) => d.id === currentId) ?? decks[0];
  const fileRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);

  const onImport = async (file: File) => {
    try {
      const n = importDecks(fromFile(JSON.parse(await file.text()), byId));
      show(`${n} 個のデッキを読み込みました`);
    } catch (e) {
      show(e instanceof Error ? e.message : "読み込めませんでした", "error");
    }
  };

  const header = (
    <Header
      title="デッキ"
      right={
        <div className="flex gap-1">
          <button type="button" className="rounded bg-slate-200 px-2 py-1 text-xs dark:bg-slate-800" onClick={() => fileRef.current?.click()}>
            読み込み
          </button>
          <button type="button" className="rounded bg-red-600 px-2 py-1 text-xs font-bold text-white" onClick={() => create()}>
            ＋新規
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onImport(f);
              e.target.value = "";
            }}
          />
        </div>
      }
    />
  );

  if (!deck)
    return (
      <div>
        {header}
        <div className="px-4 py-10 text-center text-sm text-slate-500">
          <p>まだデッキがありません。</p>
          <p className="mt-1">「＋新規」で作るか、検索画面でカードを長押しすると自動で作られます。</p>
        </div>
      </div>
    );

  const cards = sortDeckCards(deck.cards, byId);
  const counts = new Map<string, number>();
  for (const c of cards) counts.set(c.id, (counts.get(c.id) ?? 0) + 1);
  const unique = [...new Map(cards.map((c) => [c.id, c])).values()];
  const check = checkDeck(deck, byId);

  const savePng = async () => {
    if (!imageRef.current) return;
    setExporting(true);
    try {
      // オンラインなら高解像度画像、ダメならサムネイルで書き出す（SPEC 5.3）
      const imgs = [...imageRef.current.querySelectorAll("img")];
      const online = navigator.onLine;
      await Promise.all(
        imgs.map(
          (img) =>
            new Promise<void>((res) => {
              const card = byId.get(img.dataset.id!)!;
              const fallback = () => {
                img.onerror = null;
                img.crossOrigin = "";
                img.removeAttribute("crossorigin");
                img.src = thumbUrl(card);
                img.onload = () => res();
                img.onerror = () => res();
              };
              img.onload = () => res();
              img.onerror = fallback;
              if (online) {
                img.crossOrigin = "anonymous";
                img.src = card.image;
              } else fallback();
            }),
        ),
      );
      const url = await toPng(imageRef.current, { pixelRatio: 2, backgroundColor: "#0f172a", cacheBust: false });
      const blob = await (await fetch(url)).blob();
      download(`${deck.name}.png`, blob, "image/png");
      show("画像を保存しました");
    } catch {
      show("画像を作れませんでした（オフラインならサムネイルで再試行してください）", "error");
    } finally {
      setExporting(false);
    }
  };

  const share = async () => {
    const url = `${location.href.split("#")[0]}#/share/${encodeShare(deck)}`;
    try {
      if (navigator.share) await navigator.share({ title: deck.name, url });
      else {
        await navigator.clipboard.writeText(url);
        show("共有URLをコピーしました");
      }
    } catch {
      prompt("このURLをコピーしてください", url);
    }
  };

  return (
    <div>
      {header}
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-3">
        <div className="scrollbar-none -mx-4 flex gap-1.5 overflow-x-auto px-4">
          {decks.map((d) => (
            <Chip key={d.id} active={d.id === deck.id} onClick={() => select(d.id)}>
              {d.name}（{d.cards.length}）
            </Chip>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <input
            value={deck.name}
            onChange={(e) => update(deck.id, { name: e.target.value })}
            className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-base font-bold dark:border-slate-700 dark:bg-slate-900"
            aria-label="デッキ名"
          />
          <button
            type="button"
            className="rounded px-2 py-1 text-xs text-red-600"
            onClick={() => {
              if (confirm(`「${deck.name}」を削除しますか？`)) remove(deck.id);
            }}
          >
            削除
          </button>
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
            <span>エネルギーゾーン（{MAX_ENERGY}タイプまで）</span>
            <button type="button" className="text-red-600" onClick={() => update(deck.id, { energy: guessEnergy(deck, byId) })}>
              デッキから自動設定
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {ZONE_TYPES.map((t) => {
              const on = deck.energy.includes(t);
              return (
                <button
                  key={t}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    if (on) update(deck.id, { energy: deck.energy.filter((x) => x !== t) });
                    else if (deck.energy.length < MAX_ENERGY) update(deck.id, { energy: [...deck.energy, t] });
                    else show(`エネルギーゾーンは${MAX_ENERGY}タイプまで`, "error");
                  }}
                  className={`rounded-full p-0.5 ${on ? "ring-2 ring-red-500" : "opacity-40"}`}
                >
                  <EnergyIcon type={t} size="lg" />
                </button>
              );
            })}
          </div>
        </div>

        <div className={`rounded-lg p-3 text-sm ${check.ok ? "bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200" : "bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-100"}`}>
          {check.ok ? "✓ 20枚そろったデッキです" : check.problems.map((p) => <div key={p}>・{p}</div>)}
        </div>

        {unique.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">
            カードがありません。
            <button type="button" className="text-red-600 underline" onClick={() => navigate("/")}>
              検索
            </button>
            してカードを長押しで追加。
          </p>
        ) : (
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
            {unique.map((c) => (
              <CardImage
                key={c.id}
                card={c}
                footer={
                  <div className="mt-1 flex items-center justify-between">
                    <button type="button" aria-label="1枚減らす" className="h-7 w-7 rounded-full bg-slate-200 text-sm dark:bg-slate-800" onClick={() => removeCard(deck.id, c.id)}>
                      −
                    </button>
                    <span className="text-sm font-bold tabular-nums">×{counts.get(c.id)}</span>
                    <button
                      type="button"
                      aria-label="1枚増やす"
                      className="h-7 w-7 rounded-full bg-slate-200 text-sm dark:bg-slate-800"
                      onClick={() => {
                        const err = canAdd(deck, c, byId);
                        if (err) show(err, "error");
                        else add(deck.id, c.id);
                      }}
                    >
                      ＋
                    </button>
                  </div>
                }
              />
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 pt-2 text-sm">
          <button type="button" disabled={!cards.length || exporting} onClick={savePng} className="rounded-lg bg-slate-900 py-2 font-bold text-white disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900">
            {exporting ? "画像を作成中…" : "画像として保存"}
          </button>
          <button type="button" disabled={!cards.length} onClick={share} className="rounded-lg bg-slate-200 py-2 disabled:opacity-40 dark:bg-slate-800">
            共有URL
          </button>
          <button type="button" onClick={() => download(`${deck.name}.json`, JSON.stringify(toFile([deck]), null, 1))} className="rounded-lg bg-slate-200 py-2 dark:bg-slate-800">
            このデッキを書き出し
          </button>
          <button type="button" onClick={() => download("pokepoke-decks.json", JSON.stringify(toFile(decks), null, 1))} className="rounded-lg bg-slate-200 py-2 dark:bg-slate-800">
            全デッキを書き出し
          </button>
        </div>
      </div>

      {/* 画像書き出し用（画面外に置く） */}
      <div style={{ position: "fixed", left: -10000, top: 0 }} aria-hidden>
        <DeckImage ref={imageRef} deck={deck} cards={cards} />
      </div>
    </div>
  );
}

function DeckImage({ deck, cards, ref }: { deck: Deck; cards: AppCard[]; ref: React.Ref<HTMLDivElement> }) {
  return (
    <div ref={ref} style={{ width: 1000, padding: 24, background: "#0f172a", color: "white", fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <div style={{ fontSize: 28, fontWeight: 700, flex: 1 }}>{deck.name}</div>
        {deck.energy.map((t) => (
          <span key={t} style={{ fontSize: 18 }}>
            <EnergyIcon type={t} size="lg" /> {TYPE_JA[t]}
          </span>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10 }}>
        {cards.map((c, i) => (
          <img key={i} data-id={c.id} src={thumbUrl(c)} alt={c.nameJa} style={{ width: "100%", aspectRatio: "367/512", borderRadius: 8, objectFit: "cover" }} />
        ))}
      </div>
      <div style={{ marginTop: 12, fontSize: 12, opacity: 0.6, textAlign: "right" }}>ポケポケ検索</div>
    </div>
  );
}

export function SharePage({ code }: { code: string }) {
  const { byId } = useData();
  const importDecks = useDecks((s) => s.importDecks);
  const show = useToast((s) => s.show);
  let shared: ReturnType<typeof decodeShare> | undefined;
  try {
    shared = decodeShare(code);
  } catch {
    shared = undefined;
  }
  if (!shared) return <Header title="共有URLを読めませんでした" back />;
  const cards = sortDeckCards(shared.cards, byId);
  const check = checkDeck(shared, byId);
  return (
    <div>
      <Header title={`共有デッキ: ${shared.name}`} />
      <div className="mx-auto max-w-3xl space-y-3 px-4 py-3">
        <div className="flex items-center gap-2">
          {shared.energy.map((t) => (
            <EnergyIcon key={t} type={t} size="lg" />
          ))}
          <span className="text-sm text-slate-500">{cards.length} 枚</span>
        </div>
        {!check.ok && <div className="text-xs text-amber-700">{check.problems.join(" / ")}</div>}
        <div className="grid grid-cols-5 gap-1.5">
          {cards.map((c, i) => (
            <button key={i} type="button" onClick={() => navigate(`/card/${c.id}`)}>
              <Thumb card={c} />
            </button>
          ))}
        </div>
        <button
          type="button"
          className="w-full rounded-lg bg-red-600 py-2 font-bold text-white"
          onClick={() => {
            importDecks([{ name: shared!.name, energy: shared!.energy, cards: shared!.cards.filter((id) => byId.has(id)) }]);
            show("マイデッキに保存しました");
            navigate("/deck");
          }}
        >
          マイデッキに保存
        </button>
      </div>
    </div>
  );
}
