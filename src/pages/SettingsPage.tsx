import { Header } from "../components/ui.tsx";
import { useData } from "../context.tsx";
import { isSingleFile } from "../data/load.ts";
import { navigate } from "../router.ts";
import { useSettings } from "../store.ts";
import { Chip } from "../components/ui.tsx";

export function SettingsPage({ embedded }: { embedded?: boolean }) {
  const { data } = useData();
  const { imageLang, setImageLang } = useSettings();
  return (
    <div>
      {!embedded && <Header title="設定" />}
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
          <h2 className="text-sm font-extrabold text-ink">POKÉPOKE LAB について</h2>
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
