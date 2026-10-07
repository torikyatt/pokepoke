// 検索ワードの記録（検索の改善用）。どの言葉で探され、何件当たり、結果のカードが開かれたかと、
// 辞書で読めなかった言葉（「コインでエネ付与」の「えね付与」。ほかの言葉で当たっていても）だけを送る。
// 誰が探したか（IPアドレス・端末など）は送らないし、サーバーでも残さない（functions/api/q.ts）。
//   ・入力の途中（「リ」「リザ」…）は送らず、2秒止まった言葉だけ。同じ言葉はページを開いている間1回だけ
//   ・メールアドレス・長い数字・URL のような、個人の情報かもしれない言葉は送らない
//   ・開発中・1ファイル版（file://）では送らない
//   ・1つの端末から送るのは1日 DAILY_MAX 回まで（サーバーの無料枠を使い切らないように。開いた記録も1回に数える）
import { isSingleFile } from "./data/load.ts";

const enabled = typeof window !== "undefined" && !import.meta.env.DEV && !isSingleFile && location.protocol === "https:";
const SETTLE = 2000;
const DAILY_MAX = 20;
const COUNT_KEY = "pokepoke.qlog";

/** 今日まだ送ってよければ、回数を1つ数えて true（数えられない端末では、ページを開いている間だけ数える） */
let memCount = { day: "", n: 0 };
function allow(): boolean {
  const day = new Date().toISOString().slice(0, 10);
  let c = memCount;
  try {
    c = JSON.parse(localStorage.getItem(COUNT_KEY) ?? "null") ?? c;
  } catch {
    // そのまま
  }
  if (c.day !== day) c = { day, n: 0 };
  if (c.n >= DAILY_MAX) return false;
  c = { day, n: c.n + 1 };
  memCount = c;
  try {
    localStorage.setItem(COUNT_KEY, JSON.stringify(c));
  } catch {
    // 保存できなくても、ページを開いている間は数えている
  }
  return true;
}

const sent = new Set<string>();
const opened = new Set<string>();
let timer: ReturnType<typeof setTimeout> | undefined;
let pending: { q: string; hits: number; where: string; lang: string; miss?: string[] } | undefined;

const clean = (q: string) => q.replace(/\s+/g, " ").trim();
const ok = (q: string) => q.length > 0 && q.length <= 60 && !/@|https?:|www\.|\d{5,}/i.test(q);

function send(body: object) {
  if (!allow()) return;
  const data = JSON.stringify(body);
  try {
    if (navigator.sendBeacon?.("/api/q", data)) return;
  } catch {
    // 送れなくても検索には関係ない
  }
  fetch("/api/q", { method: "POST", body: data, keepalive: true }).catch(() => {});
}

/** 検索した（言葉が2秒止まったら、当たった件数と一緒に送る） */
export function logSearch(q: string, hits: number, where: "search" | "deck", lang: "ja" | "en", unread: string[] = []) {
  if (!enabled) return;
  clearTimeout(timer);
  pending = undefined;
  const w = clean(q);
  if (!ok(w) || sent.has(w)) return;
  const miss = unread.filter(ok).slice(0, 8);
  pending = { q: w, hits, where, lang, ...(miss.length ? { miss } : {}) };
  timer = setTimeout(flush, SETTLE);
}

function flush() {
  clearTimeout(timer);
  if (!pending) return;
  sent.add(pending.q);
  send(pending);
  pending = undefined;
}

/** その言葉の検索結果からカードを開いた（言葉ごとに1回だけ） */
export function logOpen(q: string, lang: "ja" | "en") {
  if (!enabled) return;
  const w = clean(q);
  if (!ok(w) || opened.has(w)) return;
  // 2秒たつ前に開いたときは、検索のほうも先に送る
  if (pending?.q === w) flush();
  if (!sent.has(w)) return;
  opened.add(w);
  send({ q: w, open: 1, lang });
}
