# POKÉPOKE LAB

ポケポケ（Pokémon TCG Pocket）のカードを**ふだんの言葉で検索**して、**デッキを組める**個人用ツールです。

**サイト: https://torikyatt.github.io/pokepoke/**

- 「エネ加速できる炎のカード」「水1個であとは無色のワザ」「相手の手札を減らすサポート」のように検索できます
- 検索はブラウザの中だけで完結します（実行時にAIやサーバーは使いません）
- デッキは20枚・同名2枚まで・たね1枚以上をチェック。複数保存、JSONの書き出し・読み込み、共有URL、画像（PNG）保存ができます
- 設定画面から、全データとサムネイルを1つに詰めた `pokepoke.html`（約23MB）をダウンロードでき、オフラインでも使えます

## 使い方

| 操作 | やり方 |
| --- | --- |
| 検索 | 検索バーに入力。一致した条件がチップで出るので、タップで外せる |
| 並べ替え・絞り込み | 右下の丸いボタン。図鑑順（アプリと同じ）・HP・最大ダメージなどで並べ替え、タイプ・種別・進化・HP・にげる・弱点・効果・収録パック・レアリティなどで絞り込み |
| 列数 | 「5列」のスイッチで5列／3列を切り替え |
| カード詳細 | どの画面でもカードをタップ。下からせり上がり、下へスワイプで閉じる（途中で離すと半分の高さで止まり、後ろを見ながら使える）。左上で1つ前のカード、✕でまとめて閉じる。閉じても下の「最近見たカード」から履歴ごと開き直せる |
| デッキを組む | デッキ → 新しいデッキ。ポケポケ本体と同じく、上に20枠、下がカード一覧。カードをタップして詳細の「＋ デッキに追加」「−」で出し入れ、左下の ✓ で終える |
| PC表示 | 横幅1024px以上では、カード一覧・カード詳細・デッキを横に並べて表示（「/」で検索欄へ） |
| デッキの移動 | デッキ画面の「書き出し」→ 別の端末で「読み込み」、または共有URL |
| タブ | 下のタブを切り替えても、検索文・絞り込み・スクロール位置・開いていたカード詳細はそのまま。同じタブをもう一度押すと最初の画面へ |
| カード画像 | 設定で日本語／英語を切り替え（既定は日本語） |

## 開発

```sh
npm ci
npm run dev        # 開発サーバー（レビューページ #/review も使える）
npm test           # 検索の受け入れテスト（Vitest）
npm run build      # dist/（Web版）と dist/pokepoke.html（単一HTML版）を作る
```

### データ工程

| コマンド | 内容 |
| --- | --- |
| `npm run fetch` | PocketDecks・flibustier・PokéAPI から元データを取得（`data/raw/`、取得元のSHAを記録） |
| `npm run scrape-game8 [-- --refresh]` | Game8 から日本語カード情報を取得（robots.txt 確認・2秒間隔・キャッシュ） |
| `npm run data` | 正規化 → ポケモン名日本語化 → Game8照合 → 翻訳補完 → タグ付与 → 表現辞書 → 検査 → アプリ用データ |
| `npm run thumbs` | 英語のカード画像を幅160pxのWebPに縮小（`public/thumbs/`） |
| `npm run thumbs -- --ja` | 日本語のカード画像（Game8）を幅200pxのWebPに縮小（`public/thumbs-ja/`、2秒に1枚） |

人が編集する正本は次のファイルです。

- `data/taxonomy.yaml` … タグの階層と付与ルール（英文の正規表現）、シナジーの供給・要求
- `data/lexicon-seed.yaml` … 表現辞書の中心表現（`npm run lexicon-gen` で語尾違いを足して30表現以上にする）
- `data/overrides.json` … 照合・タグの手動修正
- `data/translations.json` / `data/glossary.json` … 公式訳が無い文の仮訳と用語集

新弾が出たら `npm run fetch` → `npm run scrape-game8 -- --refresh` → `npm run data` → `npm run thumbs` の順に回し、`data/game8/unmatched.json` と `data/translate-todo.json` を確認します。

仕様は [SPEC.md](SPEC.md) を参照してください。

## データの出典とライセンス

- カードデータ: [PocketDecks/pokemon-tcg-pocket-cards](https://github.com/PocketDecks/pokemon-tcg-pocket-cards)（AGPL-3.0）。このリポジトリも AGPL-3.0 です
- 日本語のカード文とカード画像: Game8 の掲載のもの。ポケモン名: [PokéAPI](https://pokeapi.co/)
- 「仮訳」と表示される文は機械翻訳です

個人用の非公式ツールです。ポケモン・ポケモンカードゲーム Pocket は任天堂・クリーチャーズ・ゲームフリーク・株式会社ポケモンの商標です。
