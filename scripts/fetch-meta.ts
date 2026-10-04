// 大会で実際に使われたデッキ（Limitless の公開API）から、カードの使われ方を集める。
//   ・どのデッキタイプ（アーキタイプ）で、どのカードが何割入っているか
//   ・どのカードとどのカードが一緒に入っていることが多いか（相性のいいカードに使う）
//
//   npm run fetch-meta                 キャッシュにある大会だけで集計し直す
//   npm run fetch-meta -- --refresh    直近の大会一覧を取り直し、まだ取っていない大会の結果を取る
//   npm run fetch-meta -- --offline    ネットに出ず、キャッシュにある結果だけで集計する
//
// API: https://docs.limitlesstcg.com/developer.html （キー不要。5分に50回までなので、7秒に1回にする）
// キャッシュ: data/meta/cache/（コミットしない）
// 出力:       data/meta/meta.json（集計結果。コミットする）
//             data/meta/decks.json（勝ち越し・五分のデッキリスト。同じ構成はまとめる。カード詳細の「このカードを使ったデッキ」に使う）
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DIR = join(import.meta.dirname, "../data/meta");
const CACHE = join(DIR, "cache");
mkdirSync(CACHE, { recursive: true });

const API = "https://play.limitlesstcg.com/api";
const UA = "pokepoke-personal/0.1 (personal, non-commercial deck builder)";
const INTERVAL_MS = 7000;
// 直近の大会（デッキタイプ・採用率に使う）と、それより前の大きな大会（「一緒に使われる組」だけに使う。昔の定番コンボも拾うため）
const DAYS = 60;
const MIN_PLAYERS = 32;
const OLD_DAYS = 800; // ポケポケのサービス開始（2024年10月末）まで
const OLD_MIN_PLAYERS = 64;
const CHECKPOINT = 100; // この件数を取るごとに集計を書き出す（長い取得の途中経過）
const refresh = process.argv.includes("--refresh");
const offline = process.argv.includes("--offline");

let last = 0;
async function getJson<T>(url: string): Promise<T> {
  const wait = last + INTERVAL_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  last = Date.now();
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  console.log(`  GET ${res.status} ${url.replace(API, "")}`);
  if (res.status === 429) {
    // 回数制限に当たったら、言われた時間だけ待ってやり直す
    const t = Number(res.headers.get("retry-after") ?? 120);
    await new Promise((r) => setTimeout(r, t * 1000));
    return getJson(url);
  }
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return (await res.json()) as T;
}

interface Tournament {
  id: string;
  name: string;
  date: string;
  format: string | null;
  players: number;
}
interface Entry {
  placing: number | null;
  player?: string;
  record?: { wins: number; losses: number; ties: number };
  deck?: { id: string; name: string };
  decklist?: { pokemon?: Line[]; trainer?: Line[]; energy?: string[] };
}
interface Line {
  count: number;
  set: string;
  number: string;
  name: string;
}

// ---- 取得 ----

const listFile = join(CACHE, "tournaments.json");
let fetchedAt = existsSync(listFile) ? statSync(listFile).mtime.toISOString() : new Date().toISOString();
let tournaments: Tournament[] = existsSync(listFile) ? JSON.parse(readFileSync(listFile, "utf8")) : [];
if (!offline && (refresh || !tournaments.length)) {
  const since = Date.now() - OLD_DAYS * 86400e3;
  const recent = Date.now() - DAYS * 86400e3;
  const got: Tournament[] = [];
  for (let page = 1; page < 200; page++) {
    const t = await getJson<Tournament[]>(`${API}/tournaments?game=POCKET&limit=200&page=${page}`);
    got.push(...t);
    if (!t.length || Date.parse(t[t.length - 1].date) < since) break;
  }
  // 通常ルール（format なし）で、ある程度の人数がいた大会だけ
  tournaments = got.filter((t) => t.format === null && Date.parse(t.date) >= since && t.players >= (Date.parse(t.date) >= recent ? MIN_PLAYERS : OLD_MIN_PLAYERS));
  writeFileSync(listFile, JSON.stringify(tournaments, null, 1));
  fetchedAt = new Date().toISOString();
}
const isRecent = (t: Tournament) => Date.parse(t.date) >= Date.parse(fetchedAt) - DAYS * 86400e3;
console.log(`対象の大会 ${tournaments.length} 件（直近${DAYS}日 ${tournaments.filter(isRecent).length} 件）`);
let fetched = 0;
const todo = (offline ? [] : tournaments).filter((t) => !existsSync(join(CACHE, `${t.id}.json`)));
for (const t of todo) {
  const f = join(CACHE, `${t.id}.json`);
  const standings = await getJson<Entry[]>(`${API}/tournaments/${t.id}/standings`);
  // 途中で止めても壊れたファイルが残らないよう、書き終えてから名前を変える
  writeFileSync(`${f}.tmp`, JSON.stringify(standings));
  renameSync(`${f}.tmp`, f);
  if (++fetched % CHECKPOINT === 0 && fetched < todo.length) {
    aggregate();
    console.log(`CHECKPOINT ${fetched}/${todo.length}`);
  }
}
aggregate();
console.log(`DONE ${fetched}/${todo.length}`);

function aggregate() {

// ---- 集計 ----

// 同じカードの別イラスト（収録違い）は、このアプリでは1枚のカードにまとめている
const cardOfPrint = new Map<string, string>();
for (const c of JSON.parse(readFileSync(join(import.meta.dirname, "../data/cards.json"), "utf8")) as { id: string; prints: { id: string }[] }[]) {
  cardOfPrint.set(c.id, c.id);
  for (const p of c.prints) cardOfPrint.set(p.id, c.id);
}
const unknown = new Map<string, number>();
// Limitless の表記（B1 / 196, P-A / 7）→ このアプリのID（b1-196, pa-007）
const idOf = (l: Line) => `${l.set.toLowerCase().replace("-", "")}-${l.number.padStart(3, "0")}`;

interface Deck {
  arch: string;
  name: string;
  cards: Map<string, number>;
  good: boolean;
  recent: boolean;
  tid: string;
  placing: number | null;
  record?: { wins: number; losses: number; ties: number };
  energy: string[];
}
const decks: Deck[] = [];
const byTournament = new Map(tournaments.map((t) => [t.id, t]));
for (const file of readdirSync(CACHE)) {
  const tid = file.replace(/\.json$/, "");
  if (!byTournament.has(tid)) continue;
  const entries: Entry[] = JSON.parse(readFileSync(join(CACHE, file), "utf8"));
  for (const e of entries) {
    if (!e.decklist || !e.deck) continue;
    const cards = new Map<string, number>();
    for (const l of [...(e.decklist.pokemon ?? []), ...(e.decklist.trainer ?? [])]) {
      const id = cardOfPrint.get(idOf(l));
      if (!id) {
        unknown.set(`${l.set}-${l.number} ${l.name}`, (unknown.get(`${l.set}-${l.number} ${l.name}`) ?? 0) + 1);
        continue;
      }
      cards.set(id, (cards.get(id) ?? 0) + l.count);
    }
    if (cards.size < 4) continue;
    const r = e.record;
    decks.push({
      arch: e.deck.id,
      name: e.deck.name,
      cards,
      good: !!r && r.wins > r.losses,
      recent: isRecent(byTournament.get(tid)!),
      tid,
      placing: e.placing,
      record: r,
      energy: (e.decklist.energy ?? []).map((x) => x.toLowerCase()),
    });
  }
}
// 勝ち越したデッキだけを数える。デッキタイプと採用率は直近の大会、一緒に使われる組は前の大会も含める
const allGood = decks.filter((d) => d.good);
const pool = allGood.filter((d) => d.recent);
console.log(`デッキ ${decks.length} 件（勝ち越し ${allGood.length} 件、うち直近 ${pool.length} 件）`);
if (unknown.size) console.log(`  △ このアプリに無いカード: ${[...unknown].slice(0, 5).map(([k, n]) => `${k}×${n}`).join(", ")}`);

// アーキタイプごとの採用率
const archs = new Map<string, { name: string; decks: Deck[] }>();
for (const d of pool) (archs.get(d.arch) ?? archs.set(d.arch, { name: d.name, decks: [] }).get(d.arch)!).decks.push(d);
const archOut = [...archs]
  .filter(([, a]) => a.decks.length >= 8)
  .sort((a, b) => b[1].decks.length - a[1].decks.length)
  .map(([id, a]) => {
    const use = new Map<string, { n: number; copies: number }>();
    for (const d of a.decks) for (const [c, k] of d.cards) {
      const u = use.get(c) ?? use.set(c, { n: 0, copies: 0 }).get(c)!;
      u.n++;
      u.copies += k;
    }
    const cards = [...use]
      .map(([c, u]) => ({ id: c, rate: +(u.n / a.decks.length).toFixed(3), avg: +(u.copies / u.n).toFixed(2) }))
      .filter((c) => c.rate >= 0.1)
      .sort((x, y) => y.rate - x.rate);
    return { id, name: a.name, decks: a.decks.length, share: +(a.decks.length / pool.length).toFixed(4), cards };
  });

// カードどうしの共起: 一緒に入っている割合と、偶然より何倍多いか（リフト）
const N = allGood.length;
const single = new Map<string, number>();
for (const d of allGood) for (const c of d.cards.keys()) single.set(c, (single.get(c) ?? 0) + 1);
const pair = new Map<string, number>();
for (const d of allGood) {
  const ids = [...d.cards.keys()].sort();
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const k = `${ids[i]}|${ids[j]}`;
    pair.set(k, (pair.get(k) ?? 0) + 1);
  }
}
const MIN_TOGETHER = 6;
const pairsOut: [string, string, number, number, number][] = []; // a, b, 一緒に入っていた数, a が入っているデッキのうち b も入っている割合, b 側の割合
for (const [k, n] of pair) {
  if (n < MIN_TOGETHER) continue;
  const [a, b] = k.split("|");
  const pa = single.get(a)!, pb = single.get(b)!;
  const lift = (n * N) / (pa * pb);
  if (lift < 1.5) continue; // どのデッキにも入る定番どうしは除く
  pairsOut.push([a, b, n, +(n / pa).toFixed(3), +(n / pb).toFixed(3)]);
}
pairsOut.sort((x, y) => y[2] - x[2]);

// 採用率は直近の大会だけで
const recentCount = new Map<string, number>();
for (const d of pool) for (const c of d.cards.keys()) recentCount.set(c, (recentCount.get(c) ?? 0) + 1);
const usage = Object.fromEntries([...recentCount].sort((a, b) => b[1] - a[1]).map(([c, n]) => [c, +(n / pool.length).toFixed(4)]));

writeFileSync(
  join(DIR, "meta.json"),
  JSON.stringify(
    {
      source: "Limitless TCG (play.limitlesstcg.com) tournament API",
      fetchedAt,
      days: DAYS,
      tournaments: tournaments.filter((t) => isRecent(t) && existsSync(join(CACHE, `${t.id}.json`))).length,
      decks: pool.length,
      pairDecks: N, // 一緒に使われる組を数えたデッキ（前の大きな大会も含む）
      usage,
      archetypes: archOut,
      pairs: pairsOut,
    },
    null,
    0,
  ).replace(/\],\[/g, "],\n["),
);
// ---- デッキリスト（勝ち越し・五分）。同じ構成はまとめ、いちばん良い成績のものを残す ----
const ENERGY = new Set(["grass", "fire", "water", "lightning", "psychic", "fighting", "darkness", "metal"]);
const listed = new Map<string, { d: Deck; dup: number }>();
const scoreOf = (d: Deck) => (d.record ? d.record.wins - d.record.losses : -99) * 1000 - (d.placing ?? 999);
for (const d of decks) {
  const r = d.record;
  if (!r || r.wins < r.losses) continue;
  const total = [...d.cards.values()].reduce((a, b) => a + b, 0);
  if (total !== 20) continue; // 20枚そろっていないリストは使えない
  const key = `${d.arch}|${[...d.cards].sort().map(([c, n]) => `${c}*${n}`).join(",")}|${[...d.energy].sort().join(",")}`;
  const cur = listed.get(key);
  if (!cur) listed.set(key, { d, dup: 1 });
  else {
    cur.dup++;
    const t0 = byTournament.get(cur.d.tid)!, t1 = byTournament.get(d.tid)!;
    // 成績が良いほう、同じなら新しい大会のほうを残す
    if (scoreOf(d) > scoreOf(cur.d) || (scoreOf(d) === scoreOf(cur.d) && t1.date > t0.date)) cur.d = d;
  }
}
const usedT = [...new Set([...listed.values()].map((x) => x.d.tid))];
const tIndex = new Map(usedT.map((t, i) => [t, i]));
const deckOut = {
  source: "Limitless TCG (play.limitlesstcg.com) tournament API",
  fetchedAt,
  // [大会名, 日付, 参加人数]
  tournaments: usedT.map((t) => {
    const x = byTournament.get(t)!;
    return [x.name, x.date.slice(0, 10), x.players];
  }),
  // [大会, デッキタイプID, デッキタイプ名, 順位, 勝, 負, 分, エネ, カード（ID*枚数）, 同じ構成の数]
  decks: [...listed.values()]
    .sort((a, b) => byTournament.get(b.d.tid)!.date.localeCompare(byTournament.get(a.d.tid)!.date) || scoreOf(b.d) - scoreOf(a.d))
    .map(({ d, dup }) => [
      tIndex.get(d.tid),
      d.arch,
      d.name,
      d.placing ?? 0,
      d.record!.wins,
      d.record!.losses,
      d.record!.ties,
      d.energy.filter((e) => ENERGY.has(e)).join(","),
      [...d.cards].sort((a, b) => a[0].localeCompare(b[0], "en", { numeric: true })).map(([c, n]) => (n > 1 ? `${c}*${n}` : c)).join(" "),
      dup,
    ]),
};
writeFileSync(join(DIR, "decks.json"), JSON.stringify(deckOut).replace(/\],\[/g, "],\n["));
console.log(`デッキリスト ${deckOut.decks.length} 件（勝ち越し・五分、同じ構成をまとめたあと）・ ${usedT.length} 大会`);

console.log(`アーキタイプ ${archOut.length} 件 ・ 組み合わせ ${pairsOut.length} 件 ・ 使われたカード ${single.size} 種（直近 ${recentCount.size} 種）`);
}
