// 外部サイトからの取得マナー: robots.txt を守り、2秒に1リクエストまで、個人用と分かる UA を名乗る。取ったものはキャッシュする
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const UA_TOKEN = "pokepoke-personal";
const UA = `${UA_TOKEN}/0.1 (personal, non-commercial deck builder; max 1 req / 2s)`;
const INTERVAL_MS = 2000;


let lastRequest = 0;
export async function get(url: string, referer?: string): Promise<Response> {
  const wait = lastRequest + INTERVAL_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequest = Date.now();
  const res = await fetch(url, { headers: { "User-Agent": UA, ...(referer ? { Referer: referer } : {}) } });
  console.log(`  GET ${res.status} ${url}`);
  return res;
}

const robotsCache = new Map<string, (path: string) => boolean>();
export async function allowed(url: string): Promise<boolean> {
  const u = new URL(url);
  if (!robotsCache.has(u.origin)) {
    const res = await get(`${u.origin}/robots.txt`);
    // 4xx は「制限なし」として扱う（robots.txt の慣例）。5xx は安全側に倒して止める
    if (res.status >= 500) throw new Error(`robots.txt を取得できない: ${res.status} ${u.origin}`);
    robotsCache.set(u.origin, res.ok ? parseRobots(await res.text()) : () => true);
  }
  return robotsCache.get(u.origin)!(u.pathname + u.search);
}

// 自分のUAに当たるグループ（無ければ * のグループ）の Allow/Disallow を最長一致で判定する
function parseRobots(txt: string): (path: string) => boolean {
  const groups: { agents: string[]; rules: { allow: boolean; re: RegExp; len: number }[] }[] = [];
  let cur: (typeof groups)[number] | undefined;
  let inAgents = false;
  for (const line of txt.split(/\r?\n/)) {
    const m = line.replace(/#.*/, "").trim().match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const [, key, value] = m;
    const k = key.toLowerCase();
    if (k === "user-agent") {
      if (!inAgents) groups.push((cur = { agents: [], rules: [] }));
      cur!.agents.push(value.toLowerCase());
      inAgents = true;
    } else if ((k === "allow" || k === "disallow") && cur) {
      inAgents = false;
      if (!value) continue;
      const re = new RegExp("^" + value.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$"));
      cur.rules.push({ allow: k === "allow", re, len: value.length });
    } else {
      inAgents = false;
    }
  }
  const mine = groups.filter((g) => g.agents.some((a) => a !== "*" && UA_TOKEN.toLowerCase().includes(a)));
  const rules = (mine.length ? mine : groups.filter((g) => g.agents.includes("*"))).flatMap((g) => g.rules);
  return (path) => {
    const hit = rules.filter((r) => r.re.test(path)).sort((a, b) => b.len - a.len || Number(b.allow) - Number(a.allow))[0];
    return hit ? hit.allow : true;
  };
}

/** キャッシュがあればそれを返し、無ければ robots.txt を確かめてから取りに行く */
export async function fetchCached(url: string, path: string, force = false, referer?: string): Promise<string> {
  if (!force && existsSync(path)) return readFileSync(path, "utf8");
  if (!(await allowed(url))) throw new Error(`robots.txt で禁止されている: ${url}`);
  const res = await get(url, referer);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const text = await res.text();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
  return text;
}
