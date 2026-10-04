import { Header } from "../components/ui.tsx";
import { useData } from "../context.tsx";
import { isSingleFile } from "../data/load.ts";
import { download } from "../deck.ts";
import { navigate } from "../router.ts";
import { useMisses } from "../store.ts";

export function SettingsPage() {
  const { data } = useData();
  const { misses, clear } = useMisses();
  return (
    <div>
      <Header title="設定" />
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-4 text-sm">
        <section className="space-y-2">
          <h2 className="font-bold">ミスログ</h2>
          <p className="text-xs text-slate-500">条件が何も見つからなかった検索文です。書き出したファイルを Claude Code に渡すと、表現辞書に言い回しを追加できます。</p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!misses.length}
              onClick={() => download(`pokepoke-misses-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ format: "pokepoke-misses", misses }, null, 1))}
              className="rounded-lg bg-slate-900 px-3 py-2 font-bold text-white disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900"
            >
              書き出し（{misses.length} 件）
            </button>
            <button
              type="button"
              disabled={!misses.length}
              onClick={() => {
                if (confirm("ミスログを消しますか？")) clear();
              }}
              className="rounded-lg bg-slate-200 px-3 py-2 disabled:opacity-40 dark:bg-slate-800"
            >
              消去
            </button>
          </div>
          {misses.length > 0 && (
            <ul className="max-h-60 space-y-1 overflow-y-auto rounded-lg bg-white p-2 text-xs dark:bg-slate-900">
              {[...misses].reverse().map((m) => (
                <li key={m.at} className="flex gap-2">
                  <span className="shrink-0 text-slate-400">{new Date(m.at).toLocaleDateString("ja-JP")}</span>
                  <span>{m.q}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {!isSingleFile && (
          <section className="space-y-2">
            <h2 className="font-bold">オフライン版</h2>
            <p className="text-xs text-slate-500">
              全データとサムネイルを1つに詰めたHTMLファイルです（約30MB）。保存してブラウザで開けば、ネットが無くても使えます。iPhoneの「ファイル」アプリのプレビューではJavaScriptが動かないので、ブラウザかHTMLビューアで開いてください。
            </p>
            <a href="pokepoke.html" download className="inline-block rounded-lg bg-slate-200 px-3 py-2 dark:bg-slate-800">
              pokepoke.html をダウンロード
            </a>
          </section>
        )}

        <section className="space-y-1">
          <h2 className="font-bold">データ</h2>
          <p className="text-xs text-slate-500">
            カード {data.cards.length} 種 ・ タグ {data.tags.length} 種 ・ 表現辞書 {data.lexicon.length} 件 ・ {new Date(data.builtAt).toLocaleString("ja-JP")} 作成
          </p>
          {import.meta.env.DEV && (
            <button type="button" className="text-red-600 underline" onClick={() => navigate("/review")}>
              レビューページ（開発用）
            </button>
          )}
        </section>

        <section className="space-y-1 text-xs text-slate-500">
          <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">このサイトについて</h2>
          <p>個人用の非公式ツールです。ポケモン・ポケモンカードゲーム Pocket は任天堂・クリーチャーズ・ゲームフリーク・株式会社ポケモンの商標です。</p>
          <p>
            カードデータ: <a className="underline" href="https://github.com/PocketDecks/pokemon-tcg-pocket-cards">PocketDecks/pokemon-tcg-pocket-cards</a>（AGPL-3.0）。日本語のカード文は Game8 掲載の表記、ポケモン名は PokéAPI を参照。「仮訳」の付いた文は機械翻訳です。
          </p>
          <p>
            ソースコード: <a className="underline" href="https://github.com/torikyatt/pokepoke">github.com/torikyatt/pokepoke</a>（AGPL-3.0）
          </p>
        </section>
      </div>
    </div>
  );
}
