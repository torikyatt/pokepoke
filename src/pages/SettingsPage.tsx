import { Header } from "../components/ui.tsx";
import { useData } from "../context.tsx";
import { isSingleFile } from "../data/load.ts";
import { navigate } from "../router.ts";
import { useSettings } from "../store.ts";
import { Chip } from "../components/ui.tsx";
import { dateStr, useT } from "../i18n.ts";

export function SettingsPage({ embedded }: { embedded?: boolean }) {
  const { data } = useData();
  const { lang, setLang, imageLang, setImageLang } = useSettings();
  const t = useT();
  return (
    <div>
      {!embedded && <Header title={t("設定", "Settings")} />}
      <div className="mx-auto max-w-3xl space-y-4 px-4 pb-6 text-sm">
        <section className="neu space-y-2 rounded-3xl p-4">
          {/* どちらの言語で表示していても見つけられるよう、見出しは両方で書く */}
          <h2 className="font-extrabold">表示言語 / Language</h2>
          <div className="flex gap-2">
            <Chip active={lang === "ja"} onClick={() => setLang("ja")}>
              日本語
            </Chip>
            <Chip active={lang === "en"} onClick={() => setLang("en")}>
              English
            </Chip>
          </div>
          <p className="text-xs text-muted">
            {t(
              "画面の文字・カード名・効果文・検索の言葉が切り替わります。英語の検索文（例: fire energy acceleration）は、どちらの言語でも使えます。",
              "Switches the interface, card names, card text and search. Japanese search phrases keep working in English mode too.",
            )}
          </p>
        </section>

        <section className="neu space-y-2 rounded-3xl p-4">
          <h2 className="font-extrabold">{t("カード画像", "Card images")}</h2>
          <div className="flex gap-2">
            <Chip active={imageLang === "ja"} onClick={() => setImageLang("ja")}>
              {t("日本語", "Japanese")}
            </Chip>
            <Chip active={imageLang === "en"} onClick={() => setImageLang("en")}>
              {t("英語", "English")}
            </Chip>
          </div>
          <p className="text-xs text-muted">
            {t("表示言語を変えると、画像も同じ言語になります（ここで別にもできます）。日本語の画像が無いカードは英語で表示します。", "Changing the language also switches images (you can override it here). Cards without a Japanese image are shown in English.")}
            {isSingleFile && t("オフライン版で英語を選ぶと、ネットにつながっているときだけ英語の画像を読み込みます。", " In the offline version, English images load only when you're online.")}
          </p>
        </section>

        <section className="neu space-y-1 rounded-3xl p-4">
          <h2 className="font-extrabold">{t("データ", "Data")}</h2>
          <p className="text-xs text-muted">
            {t(
              `カード ${data.cards.length} 種 ・ タグ ${data.tags.length} 種 ・ 表現辞書 ${data.lexicon.length} 件 ・ ${new Date(data.builtAt).toLocaleString("ja-JP")} 作成`,
              `${data.cards.length} cards ・ ${data.tags.length} tags ・ ${data.lexicon.length + (data.lexiconEn?.length ?? 0)} search phrases ・ built ${new Date(data.builtAt).toLocaleString("en-US")}`,
            )}
            {data.meta &&
              t(
                ` ・ 大会データ ${data.meta.tournaments}大会・${data.meta.decks}デッキ（${dateStr(data.meta.fetchedAt, "ja")} 取得）`,
                ` ・ tournament data: ${data.meta.tournaments} tournaments, ${data.meta.decks} decks (fetched ${dateStr(data.meta.fetchedAt, "en")})`,
              )}
            {data.combos && t(` ・ 定番の組み合わせ ${data.combos.length} 件`, ` ・ ${data.combos.length} known combos`)}
          </p>
          {import.meta.env.DEV && (
            <button type="button" className="font-bold text-accent-deep underline" onClick={() => navigate("/review")}>
              レビューページ（開発用）
            </button>
          )}
        </section>

        <section className="neu space-y-1 rounded-3xl p-4 text-xs text-muted">
          <h2 className="text-sm font-extrabold text-ink">{t("POKÉPOKE LAB について", "About POKÉPOKE LAB")}</h2>
          <p>
            {t(
              "個人用の非公式ツールです。ポケモン・ポケモンカードゲーム Pocket は任天堂・クリーチャーズ・ゲームフリーク・株式会社ポケモンの商標です。",
              "An unofficial personal tool. Pokémon and Pokémon TCG Pocket are trademarks of Nintendo, Creatures, GAME FREAK and The Pokémon Company.",
            )}
          </p>
          <p>
            {t("カードデータ: ", "Card data: ")}
            <a className="underline" href="https://github.com/PocketDecks/pokemon-tcg-pocket-cards">
              PocketDecks/pokemon-tcg-pocket-cards
            </a>
            {t(
              "（AGPL-3.0）。日本語のカード文と日本語のカード画像は Game8 掲載のもの、ポケモン名は PokéAPI を参照。「仮訳」の付いた文は機械翻訳です。大会での使われ方は ",
              " (AGPL-3.0). Japanese card text and images are from Game8; Pokémon names from PokéAPI. Text marked “MT” in Japanese mode is machine-translated. Tournament usage is aggregated from ",
            )}
            <a className="underline" href="https://play.limitlesstcg.com/">
              Limitless TCG
            </a>
            {t(
              " の大会結果を集計したもの、定番の組み合わせは Game8 のデッキ解説記事をもとにまとめたものです。",
              " results; known combos are summarized from Game8's (Japanese) deck guides.",
            )}
          </p>
          <p>
            {t("ソースコード: ", "Source code: ")}
            <a className="underline" href="https://github.com/torikyatt/pokepoke">
              github.com/torikyatt/pokepoke
            </a>
            （AGPL-3.0）
          </p>
        </section>
      </div>
    </div>
  );
}
