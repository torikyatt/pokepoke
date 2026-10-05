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

let ready: Promise<unknown> | undefined;
/** 表がなければ作る（最初の1回だけ） */
export function ensure(db: D1Like) {
  ready ??= db
    .exec(
      "CREATE TABLE IF NOT EXISTS searches (day TEXT NOT NULL, q TEXT NOT NULL, lang TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, hits INTEGER, opened INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, q, lang))",
    )
    .catch((e) => {
      ready = undefined;
      throw e;
    });
  return ready;
}
