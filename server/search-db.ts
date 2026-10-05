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
  RESEND_API_KEY?: string; // お問い合わせのメールを送る Resend の API キー（シークレット）。無ければメールは送らず、記録だけ残す
  MAIL_TO?: string; // お問い合わせの届け先（既定 contact@pokepokeindex.com）
  MAIL_FROM?: string; // 送り主（既定 noreply@pokepokeindex.com）
}
export interface Ctx {
  request: Request;
  env: Env;
}

// misses: 辞書で読めなかった言葉（「コインでエネ付与」の「えね付与」）。1行 = 1日・1つの言葉・言語
//   n: 回数 / q: その言葉が入っていた検索文（最後のもの・例として）

// last: 最後に探された日時（ISO・UTC）。日時順に並べるのに使う（あとから足した列なので、古い行には無い）
// contacts: お問い合わせ（設定画面のフォームから）。mailed: 送れたメール（"notify,confirm" など。送れなければ空）
// reports: カードの誤りの報告（カード詳細の左上のボタンから）。report_images: 添付された画像（JPEG・端末で縮めたもの）

/** お問い合わせの種類（キー → 表示名）。画面（src/components/contact.tsx）と同じ並び */
export const CONTACT_CATEGORIES: Record<string, string> = {
  feedback: "ご意見・ご要望",
  bug: "不具合",
  data: "カード・データの誤り",
  other: "その他",
};

/** 誤りの報告の種類（キー → 表示名）。画面（src/components/report-error.tsx）と同じ並び */
export const REPORT_CATEGORIES: Record<string, string> = {
  info: "カード名・効果文などのカード情報",
  image: "カード画像",
  evolution: "進化ライン",
  partners: "相性のいいカード",
  combos: "定番の組み合わせ",
  tournament: "大会での使われ方",
  search: "検索結果",
  other: "その他",
};

let ready: Promise<unknown> | undefined;
/** 表がなければ作る（最初の1回だけ）。あとから足した列（last）も足す */
export function ensure(db: D1Like) {
  ready ??= db
    .exec(
      "CREATE TABLE IF NOT EXISTS searches (day TEXT NOT NULL, q TEXT NOT NULL, lang TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, hits INTEGER, opened INTEGER NOT NULL DEFAULT 0, last TEXT, PRIMARY KEY (day, q, lang))\n" +
        "CREATE TABLE IF NOT EXISTS misses (day TEXT NOT NULL, term TEXT NOT NULL, lang TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, q TEXT, last TEXT, PRIMARY KEY (day, term, lang))",
    )
    .then(() =>
      db.exec(
        "CREATE TABLE IF NOT EXISTS reports (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, card TEXT NOT NULL, category TEXT NOT NULL, body TEXT NOT NULL, lang TEXT NOT NULL, images INTEGER NOT NULL DEFAULT 0)\n" +
          "CREATE TABLE IF NOT EXISTS report_images (report_id INTEGER NOT NULL, idx INTEGER NOT NULL, data BLOB NOT NULL, PRIMARY KEY (report_id, idx))\n" +
          "CREATE TABLE IF NOT EXISTS contacts (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, name TEXT NOT NULL, email TEXT NOT NULL, category TEXT NOT NULL, body TEXT NOT NULL, lang TEXT NOT NULL, mailed TEXT NOT NULL DEFAULT '')",
      ),
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
