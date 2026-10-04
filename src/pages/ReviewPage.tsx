// レビューページ（開発用。npm run dev のときだけ使える。本番ビルドには入らない）
// タグと翻訳を目視で確認し、overrides.json の tags と translations.json に貼る差分を作る（SPEC 5.4）
import { useMemo, useState } from "react";
import { Chip, Header, Thumb } from "../components/ui.tsx";
import { useData } from "../context.tsx";
import type { AppCard, AppEffect } from "../types.ts";

type TagEdits = Record<string, Record<string, { add?: string[]; remove?: string[] }>>;

async function hashOf(en: string) {
  const s = en.normalize("NFKC").replace(/\s+/g, " ").trim();
  const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 12);
}

const slotsOf = (c: AppCard): [string, AppEffect][] => [
  ...(c.ability ? ([["ability", c.ability]] as [string, AppEffect][]) : []),
  ...c.attacks.map((a, i) => [`attack${i}`, a] as [string, AppEffect]),
  ...(c.text ? ([["text", c.text]] as [string, AppEffect][]) : []),
];

export default function ReviewPage() {
  const { data, engine } = useData();
  const [filter, setFilter] = useState<"machine" | "all" | "tag">("machine");
  const [tag, setTag] = useState("");
  const [word, setWord] = useState("");
  const [edits, setEdits] = useState<TagEdits>({});
  const [trans, setTrans] = useState<Record<string, { en: string; ja: string }>>({});
  const [limit, setLimit] = useState(40);

  const cards = useMemo(
    () =>
      data.cards.filter((c) => {
        if (word && !`${c.id} ${c.nameJa} ${c.nameEn}`.includes(word)) return false;
        if (filter === "machine") return c.nameMachine || slotsOf(c).some(([, e]) => e.machine);
        if (filter === "tag") return !!tag && c.tags.some((t) => t === tag || t.startsWith(tag + "."));
        return true;
      }),
    [data, filter, tag, word],
  );

  const effective = (c: AppCard, slot: string, e: AppEffect) => {
    const ed = edits[c.id]?.[slot];
    return [...e.tags.filter((t) => !ed?.remove?.includes(t)), ...(ed?.add ?? [])];
  };
  const edit = (cardId: string, slot: string, t: string, on: boolean, original: string[]) =>
    setEdits((prev) => {
      const cur = { add: [...(prev[cardId]?.[slot]?.add ?? [])], remove: [...(prev[cardId]?.[slot]?.remove ?? [])] };
      if (on) {
        cur.remove = cur.remove.filter((x) => x !== t);
        if (!original.includes(t) && !cur.add.includes(t)) cur.add.push(t);
      } else {
        cur.add = cur.add.filter((x) => x !== t);
        if (original.includes(t) && !cur.remove.includes(t)) cur.remove.push(t);
      }
      return { ...prev, [cardId]: { ...prev[cardId], [slot]: cur } };
    });

  const tagsOut = JSON.stringify(
    Object.fromEntries(
      Object.entries(edits)
        .map(([id, s]) => [id, Object.fromEntries(Object.entries(s).filter(([, v]) => v.add?.length || v.remove?.length))])
        .filter(([, s]) => Object.keys(s).length),
    ),
    null,
    1,
  );

  return (
    <div>
      <Header title="レビュー（開発用）" back />
      <div className="space-y-3 px-4 py-3 text-sm">
        <div className="flex flex-wrap gap-2">
          <Chip active={filter === "machine"} onClick={() => setFilter("machine")}>仮訳のあるカード</Chip>
          <Chip active={filter === "tag"} onClick={() => setFilter("tag")}>タグで絞る</Chip>
          <Chip active={filter === "all"} onClick={() => setFilter("all")}>全部</Chip>
          {filter === "tag" && (
            <select value={tag} onChange={(e) => setTag(e.target.value)} className="rounded border px-2 dark:bg-slate-900">
              <option value="">タグを選ぶ</option>
              {data.tags.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.id}（{t.ja}）
                </option>
              ))}
            </select>
          )}
          <input value={word} onChange={(e) => setWord(e.target.value)} placeholder="ID・名前" className="rounded border px-2 dark:bg-slate-900" />
          <span className="text-slate-500">{cards.length} 種</span>
        </div>
        <datalist id="tag-ids">
          {data.tags.map((t) => (
            <option key={t.id} value={t.id}>
              {t.ja}
            </option>
          ))}
        </datalist>

        {cards.slice(0, limit).map((c) => (
          <div key={c.id} className="flex gap-3 rounded-lg bg-white p-3 dark:bg-slate-900">
            <div className="w-16 shrink-0">
              <Thumb card={c} />
              <div className="mt-1 text-[10px] text-slate-500">{c.id}</div>
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <div className="font-bold">
                {c.nameJa} <span className="font-normal text-slate-500">{c.nameEn}</span>
              </div>
              {slotsOf(c).map(([slot, e]) => {
                const cur = effective(c, slot, e);
                return (
                  <div key={slot} className="border-t border-slate-100 pt-2 dark:border-slate-800">
                    <div className="text-xs text-slate-500">
                      {slot} {e.nameJa} / {e.nameEn}
                    </div>
                    <div>{e.textJa}</div>
                    <div className="text-xs text-slate-500">{e.textEn}</div>
                    {e.machine && e.textEn && (
                      <textarea
                        defaultValue={e.textJa}
                        className="mt-1 w-full rounded border p-1 text-xs dark:bg-slate-950"
                        onBlur={async (ev) => {
                          const ja = ev.target.value.trim();
                          const h = await hashOf(e.textEn!);
                          setTrans((p) => ({ ...p, [h]: { en: e.textEn!, ja } }));
                        }}
                      />
                    )}
                    <div className="mt-1 flex flex-wrap gap-1">
                      {cur.map((t) => (
                        <Chip key={t} tone="blue" onClick={() => edit(c.id, slot, t, false, e.tags)}>
                          {engine.tagJa.get(t) ?? t} ×
                        </Chip>
                      ))}
                      <input
                        list="tag-ids"
                        placeholder="＋タグ"
                        className="w-28 rounded border px-1 text-xs dark:bg-slate-950"
                        onKeyDown={(ev) => {
                          if (ev.key !== "Enter") return;
                          const v = (ev.target as HTMLInputElement).value.trim();
                          if (engine.tagJa.has(v)) edit(c.id, slot, v, true, e.tags);
                          (ev.target as HTMLInputElement).value = "";
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        {cards.length > limit && (
          <button type="button" className="w-full rounded bg-slate-200 py-2 dark:bg-slate-800" onClick={() => setLimit((n) => n + 40)}>
            もっと見る
          </button>
        )}

        <div className="sticky bottom-16 space-y-2 rounded-lg bg-slate-900 p-3 text-xs text-white">
          <div>overrides.json の "tags" に追記:</div>
          <textarea readOnly value={tagsOut} className="h-24 w-full rounded bg-slate-800 p-1 font-mono" />
          <div>translations.json に追記:</div>
          <textarea readOnly value={JSON.stringify(trans, null, 1)} className="h-20 w-full rounded bg-slate-800 p-1 font-mono" />
        </div>
      </div>
    </div>
  );
}
