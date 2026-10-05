import { Header } from "../components/ui.tsx";
import { useData } from "../context.tsx";
import { isSingleFile } from "../data/load.ts";
import { navigate } from "../router.ts";
import { useSettings } from "../store.ts";
import { Chip } from "../components/ui.tsx";
import { dateStr, useT } from "../i18n.ts";

// データの出典（設定画面の「データの出典」に並べる）
const SOURCES: { name: string; url: string; ja: string; en: string }[] = [
  {
    name: "PocketDecks / pokemon-tcg-pocket-cards",
    url: "https://github.com/PocketDecks/pokemon-tcg-pocket-cards",
    ja: "カードの基本データ（英語のカード名・効果文・HP・ワザのコスト・収録パックなど）と、英語のカード画像。ライセンスは AGPL-3.0 です。",
    en: "Core card data (English names, card text, HP, attack costs, expansions, etc.) and English card images. Licensed under AGPL-3.0.",
  },
  {
    name: "Game8（ポケポケ攻略）",
    url: "https://game8.jp/pokemon-tcg-pocket",
    ja: "日本語のカード名・効果文・カード画像・収録パック名。定番の組み合わせは、デッキ解説記事を参考に、内容を自分の言葉でまとめ直したものです（各組み合わせに記事へのリンクがあります）。",
    en: "Japanese card names, card text, card images and pack names. Known combos are summarized in our own words from their Japanese deck guides (each combo links to its article).",
  },
  {
    name: "Game8 (Pokémon TCG Pocket Wiki)",
    url: "https://game8.co/games/Pokemon-TCG-Pocket",
    ja: "英語版のデッキ解説記事。定番の組み合わせの一部は、これを参考に自分の言葉でまとめ直したものです（各組み合わせに記事へのリンクがあります）。",
    en: "English deck guides. Some known combos are summarized in our own words from these guides (each combo links to its article).",
  },
  {
    name: "Limitless TCG",
    url: "https://play.limitlesstcg.com/",
    ja: "大会の結果とデッキリスト。カードの採用率・一緒に使われるカード・「このカードを使ったデッキ」は、ここの大会結果を集計したものです。",
    en: "Tournament results and decklists. Card usage rates, cards played together and “tournament decks with this card” are aggregated from these results.",
  },
  {
    name: "PokéAPI",
    url: "https://pokeapi.co/",
    ja: "ポケモンの日本語名（日本語のカード名が見つからないときの補い）。",
    en: "Japanese Pokémon names (used where no Japanese card name was found).",
  },
];

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
        </section>

        <section className="neu space-y-3 rounded-3xl p-4 text-xs text-muted">
          <h2 className="text-sm font-extrabold text-ink">{t("データの出典", "Data sources")}</h2>
          <p>{t("このサイトは、次のサイト・データを参照・引用して作っています。各サイトに感謝します。", "This site is built on data from the following sources. Many thanks to each of them.")}</p>
          <ul className="space-y-2.5">
            {SOURCES.map((src) => (
              <li key={src.url}>
                <a className="font-extrabold text-accent-deep underline" href={src.url} target="_blank" rel="noreferrer">
                  {src.name}
                </a>
                <div className="mt-0.5 leading-relaxed">{t(src.ja, src.en)}</div>
              </li>
            ))}
          </ul>
          <p className="leading-relaxed">
            {t(
              "日本語表示で「仮訳」の付いた文は、日本語の公式テキストが見つからなかったため英語から機械翻訳したものです。カードの画像・名称・テキストの権利は、それぞれの権利者に帰属します。",
              "In Japanese mode, text marked “仮訳” is a machine translation from English where no official Japanese text was found. Card images, names and text belong to their respective rights holders.",
            )}
          </p>
        </section>
      </div>
    </div>
  );
}
