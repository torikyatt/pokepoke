import { Header } from "../components/ui.tsx";
import { useData } from "../context.tsx";
import { isSingleFile } from "../data/load.ts";
import { download } from "../deck.ts";
import { navigate } from "../router.ts";
import { useMisses, useSettings } from "../store.ts";
import { Chip } from "../components/ui.tsx";

export function SettingsPage() {
  const { data } = useData();
  const { misses, clear } = useMisses();
  const { imageLang, setImageLang } = useSettings();
  return (
    <div>
      <Header title="設定" />
      <div className="mx-auto max-w-3xl space-y-4 px-4 pb-6 text-sm">
        <section className="neu space-y-2 rounded-3xl p-4">
          <h2 className="font-extrabold">カード画像</h2>
          <div className="flex gap-2">
            <Chip active={imageLang === "ja"} onClick={() => setImageLang("ja")}>
              日本語
            </Chip>
            <Chip active={imageLang === "en"} onClick={() => setImageLang("en")}>
              英語
            </Chip>
          </div>
          <p className="text-xs text-muted">日本語の画像が無いカードは英語で表示します。{isSingleFile && "オフライン版で英語を選ぶと、ネットにつながっているときだけ英語の画像を読み込みます。"}</p>
        </section>

        <section className="neu space-y-2 rounded-3xl p-4">
          <h2 className="font-extrabold">ミスログ</h2>
          <p className="text-xs text-muted">条件が何も見つからなかった検索文です。書き出したファイルを Claude Code に渡すと、表現辞書に言い回しを追加できます。</p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!misses.length}
              onClick={() => download(`pokepoke-misses-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ format: "pokepoke-misses", misses }, null, 1))}
              className="btn-ok rounded-full px-4 py-2 disabled:opacity-40"
            >
              書き出し（{misses.length} 件）
            </button>
            <button
              type="button"
              disabled={!misses.length}
              onClick={() => {
                if (confirm("ミスログを消しますか？")) clear();
              }}
              className="neu neu-press rounded-full px-4 py-2 font-bold disabled:opacity-40"
            >
              消去
            </button>
          </div>
          {misses.length > 0 && (
            <ul className="neu-in max-h-60 space-y-1 overflow-y-auto rounded-2xl p-3 text-xs font-bold">
              {[...misses].reverse().map((m) => (
                <li key={m.at} className="flex gap-2">
                  <span className="shrink-0 text-muted">{new Date(m.at).toLocaleDateString("ja-JP")}</span>
                  <span>{m.q}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {!isSingleFile && (
          <section className="neu space-y-2 rounded-3xl p-4">
            <h2 className="font-extrabold">オフライン版</h2>
            <p className="text-xs text-muted">
              全データとサムネイルを1つに詰めたHTMLファイルです（約30MB）。保存してブラウザで開けば、ネットが無くても使えます。iPhoneの「ファイル」アプリのプレビューではJavaScriptが動かないので、ブラウザかHTMLビューアで開いてください。
            </p>
            <a href="pokepoke.html" download className="neu neu-press inline-block rounded-full px-4 py-2 font-bold">
              pokepoke.html をダウンロード
            </a>
          </section>
        )}

        <section className="neu space-y-1 rounded-3xl p-4">
          <h2 className="font-extrabold">データ</h2>
          <p className="text-xs text-muted">
            カード {data.cards.length} 種 ・ タグ {data.tags.length} 種 ・ 表現辞書 {data.lexicon.length} 件 ・ {new Date(data.builtAt).toLocaleString("ja-JP")} 作成
          </p>
          {import.meta.env.DEV && (
            <button type="button" className="font-bold text-accent-deep underline" onClick={() => navigate("/review")}>
              レビューページ（開発用）
            </button>
          )}
        </section>

        <section className="neu space-y-1 rounded-3xl p-4 text-xs text-muted">
          <h2 className="text-sm font-extrabold text-ink">このサイトについて</h2>
          <p>個人用の非公式ツールです。ポケモン・ポケモンカードゲーム Pocket は任天堂・クリーチャーズ・ゲームフリーク・株式会社ポケモンの商標です。</p>
          <p>
            カードデータ: <a className="underline" href="https://github.com/PocketDecks/pokemon-tcg-pocket-cards">PocketDecks/pokemon-tcg-pocket-cards</a>（AGPL-3.0）。日本語のカード文と日本語のカード画像は Game8 掲載のもの、ポケモン名は PokéAPI を参照。「仮訳」の付いた文は機械翻訳です。
          </p>
          <p>
            ソースコード: <a className="underline" href="https://github.com/torikyatt/pokepoke">github.com/torikyatt/pokepoke</a>（AGPL-3.0）
          </p>
        </section>
      </div>
    </div>
  );
}
