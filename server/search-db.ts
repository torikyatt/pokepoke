// 検索ワードの記録を置く D1 データベース（Cloudflare Pages の設定で、変数名 DB として結びつける）。
// 1行 = 1日・1つの言葉・言語ごとの集計（誰が探したかは残さない）
//   n: 探された回数 / hits: 最後に探されたときの件数 / opened: 結果からカードが開かれた回数

/** Cloudflare D1 のうち、ここで使う分だけ */
export interface D1Like {
  prepare(sql: string): { bind(...values: unknown[]): { run(): Promise<unknown>; all<T>(): Promise<{ results: T[] }> } };
  exec(sql: string): Promise<unknown>;
}
export interface Env {
  DB?: D1Like;
  REPORT_KEY?: string; // 集計ページを見るための合言葉（Pages の設定の「変数とシークレット」）
}
export interface Ctx {
  request: Request;
  env: Env;
}

// misses: 辞書で読めなかった言葉（「コインでエネ付与」の「えね付与」）。1行 = 1日・1つの言葉・言語
//   n: 回数 / q: その言葉が入っていた検索文（最後のもの・例として）

// last: 最後に探された日時（ISO・UTC）。日時順に並べるのに使う（あとから足した列なので、古い行には無い）

let ready: Promise<unknown> | undefined;
/** 表がなければ作る（最初の1回だけ）。あとから足した列（last）も足す */
export function ensure(db: D1Like) {
  ready ??= db
    .exec(
      "CREATE TABLE IF NOT EXISTS searches (day TEXT NOT NULL, q TEXT NOT NULL, lang TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, hits INTEGER, opened INTEGER NOT NULL DEFAULT 0, last TEXT, PRIMARY KEY (day, q, lang))\n" +
        "CREATE TABLE IF NOT EXISTS misses (day TEXT NOT NULL, term TEXT NOT NULL, lang TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, q TEXT, last TEXT, PRIMARY KEY (day, term, lang))",
    )
    .then(async () => {
      // 前からある表に last 列を足す（もうあれば失敗するので、そのままにする）
      for (const t of ["searches", "misses"]) await db.exec(`ALTER TABLE ${t} ADD COLUMN last TEXT`).catch(() => {});
    })
    .catch((e) => {
      ready = undefined;
      throw e;
    });
  return ready;
}
