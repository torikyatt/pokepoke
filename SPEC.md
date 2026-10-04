# ポケポケ デッキビルダー＆口語検索 仕様書

Claude Code に渡す実装仕様。判断に迷ったらこの文書の「方針」を優先する。

## 0. 方針

- **実行時にLLMを使わない。** 検索はすべてクライアント側の辞書マッチとスコアリングで完結させる
- LLMは**ビルド前のオフライン工程**（翻訳・タグ付与・表現辞書生成）にだけ使う。成果物はJSONとしてリポジトリにコミットする
- **自分用のツールだが、GitHub Pages で公開する。** リポジトリはパブリック（PocketDecks v5 が AGPL-3.0 のため）。Game8 由来の日本語も含めて公開すると決めた（2026-10-04）
- **成果物は単一のHTMLファイル1つ。** サーバーなしで、ダブルクリックで開けば動く。データ・JS・CSS・カードのサムネイルはすべてHTMLに埋め込む
- スマホ優先のUI。HTMLファイルをスマホにコピーして開いても動くようにする
- 日本語は**Game8の公式表記を優先**し、取れなかったものだけLLM翻訳で補う

## 1. 技術スタック

| 用途 | 採用 |
| --- | --- |
| フロント | Vite + React + TypeScript |
| スタイル | Tailwind CSS |
| 状態管理 | Zustand（デッキはlocalStorageとURLハッシュに保存） |
| 画像書き出し | html-to-image |
| データ工程スクリプト | Node.js + TypeScript（tsx で実行） |
| 単一HTML化 | vite-plugin-singlefile（JS・CSS・データをすべてインライン化） |
| サムネイル生成 | sharp（WebP、幅160px程度に縮小してbase64埋め込み） |
| スクレイピング | Playwright（ページがJS描画の場合）＋ cheerio |
| テスト | Vitest |

## 2. ディレクトリ構成

```
/
├─ data/
│  ├─ raw/                 # 取得した元データ（取得元コミットSHAも記録）
│  ├─ game8/               # Game8の取得キャッシュ（cache/、コミットしない）と抽出・照合結果
│  ├─ glossary.json        # 翻訳用の固定用語集
│  ├─ taxonomy.yaml        # タグ階層の定義（人が編集する正本）
│  ├─ lexicon/             # 表現辞書（タグ・タイプ・種別ごとに分割）
│  ├─ translations.json    # 英文ハッシュ → 日本語訳のキャッシュ
│  ├─ tags.json            # カードID → ワザ/特性ごとのタグ
│  └─ overrides.json       # 手動修正（翻訳・タグの上書き）
├─ scripts/
│  ├─ fetch.ts             # 元データ取得
│  ├─ normalize.ts         # 内部スキーマへ変換
│  ├─ names-ja.ts          # ポケモン名の日本語化
│  ├─ scrape-game8.ts      # Game8から日本語カード情報を取得
│  ├─ match-ja.ts          # 日本語カードと英語カードIDの照合
│  ├─ translate.ts         # 照合できなかった分だけLLM翻訳（オフライン）
│  ├─ tag.ts               # タグ付与（オフライン）
│  ├─ lexicon-gen.ts       # 表現辞書の生成（オフライン）
│  ├─ validate.ts          # 整合性チェック
│  ├─ thumbs.ts            # カード画像を縮小してサムネイル化
│  └─ build-index.ts       # 埋め込み用の cards / search-index を生成
├─ src/
│  ├─ search/              # 正規化・トークナイズ・スコアリング
│  ├─ deck/                # デッキ編集・検証・画像書き出し
│  ├─ components/
│  └─ pages/               # 検索 / カード詳細 / デッキ / レビュー（開発用）
└─ dist/pokepoke.html     # 最終成果物（この1ファイルだけ使う）
```

## 3. データ工程

### 3.1 取得（fetch.ts）

- 主データ：`PocketDecks/pokemon-tcg-pocket-cards` の `data/v5/cards.gameplay.json` と `cards.json`、`expansions.json`
- 補完：`flibustier/pokemon-tcg-pocket-database` の `dist/cards.extra.json` と `sets.json`。主データに無い弾（現時点でB4b）の基本情報だけ取り込む
- どちらも取得時のコミットSHAを `data/raw/SOURCE.json` に残す

### 3.2 内部スキーマ（normalize.ts）

ゲーム上の同一カード（同名・同効果）を1レコードにまとめ、収録違いは `prints` に入れる。

```ts
type EnergyType = "grass"|"fire"|"water"|"lightning"|"psychic"|"fighting"|"darkness"|"metal"|"dragon"|"colorless";

interface Card {
  id: string;                 // 代表プリントのID（例 "b4a-001"）
  nameEn: string;
  nameJa: string;
  kind: "pokemon"|"item"|"supporter"|"tool"|"fossil"|"stadium";
  type?: EnergyType;          // ポケモンのタイプ
  stage?: "basic"|"stage1"|"stage2";
  evolvesFrom?: string;       // カードID
  evolvesTo: string[];        // カードID（逆引きで生成）
  rule: "normal"|"ex"|"mega_ex";
  points?: number;            // 倒されたときの相手の獲得ポイント
  hp?: number;
  weakness?: EnergyType;
  retreat?: number;
  ability?: Effect;
  attacks: Attack[];
  text?: Effect;              // トレーナーズの効果
  prints: { id: string; set: string; rarity: string; image: string }[];
  tags: string[];             // ワザ/特性/効果のタグの和集合（build時に生成）
}

interface Effect { nameEn?: string; nameJa?: string; textEn: string; textJa: string; tags: string[] }

interface Attack extends Effect {
  cost: Partial<Record<EnergyType, number>>;
  costTotal: number;
  costTyped: number;          // 無色以外の個数
  damage?: number;
  damageVariable: boolean;    // ×・＋表記
}
```

コスト文字列の対応：`G草 R炎 W水 L雷 P超 F闘 D悪 M鋼 C無色`。

### 3.3 ポケモン名の日本語化（names-ja.ts）

- 英語名から種名を取り出す。外す接頭辞・接尾辞：`ex` / `Mega` / `Alolan` `Galarian` `Hisuian` `Paldean` / `〇〇's`（トレーナーのポケモン）/ フォルム表記
- PokéAPI の species から日本語名（`ja-Hrkt` ではなく `ja`）を取り、外した部分を日本語で付け直す（例：Alolan Raichu ex → アローラライチュウex）
- 対応表は `data/raw/pokeapi-names.json` にキャッシュ。解決できない名前は一覧出力して `overrides.json` で手動補完

### 3.4 Game8からの日本語取得（scrape-game8.ts）

- 起点：Game8のカード一覧ページ（`https://game8.jp/pokemon-tcg-pocket/639698`）
- 一覧ページは全カード・全ワザ/特性をまとめたJSON（`assets.game8.jp/tools/script_template/pokemon_card.json?version=N`）を読み込んで描画している。個別ページは辿らず、このJSONを1本取る（数リクエストで済む）
- 取る項目：カード名、収録パック、カード番号、タイプ、HP、弱点、にげる、トレーナーズ効果文／ワザ・特性の名前・コスト・ダメージ・効果文（「ポケモン名＋初出パック」でカードと結ばれる）
- 取得マナー：robots.txt に従う、**2秒に1リクエスト以下**、User-Agentに個人用である旨を書く、取得物は `data/game8/cache/` に保存して二度目以降は再取得しない
- 新弾が出たら `--refresh` で一覧ページだけ取り直し、JSONの版（version）が上がっていれば取り直す
- ページやJSONの構造が変わったら抽出が壊れるので、抽出結果の件数と必須項目の欠けを毎回レポートする
- 取得した日本語はサイトに含めて公開する（8章）

### 3.5 日英の照合（match-ja.ts）

Game8のカードを、英語データのカードIDに結びつける。上から順に試す。

1. 収録パック＋カード番号が一致（Game8側の取り違えがあるので、ポケモンは名前で裏を取る）
2. 日本語ポケモン名（3.3の対応表）＋HP＋ワザのコストとダメージの並びが一致
3. トレーナーズは、LLMで英語名を日本語化した候補と、効果文の構造（数値・対象）で照合（現状は1で全部決まるので未実装）

ワザ・特性は英語のワザ1つずつに、自分の収録パックにあるGame8の行から「コスト・ダメージ・ex の有無・初出パック・効果文の数値とタイプ」で点数を付けて選ぶ。Game8・英語データ双方に誤記があるので完全一致は求めない。

照合できなかったものと、複数候補に当たったものは `data/game8/unmatched.json` に出力し、レビューページで手動確定する。確定した結果は `overrides.json` の `matchJa`（プリントID → Game8のID）に書く。

### 3.6 翻訳の補完（translate.ts）

- 対象：照合できなかったカードのワザ名、特性名、効果文、トレーナーズ名
- 英文のハッシュをキーに `translations.json` へキャッシュ。同文の再録は再翻訳しない
- `glossary.json` の用語を必ず使う（例：Discard pile→トラッシュ、Active Spot→バトル場、Bench→ベンチ、Energy Zone→エネルギーゾーン、heads→オモテ、Flip a coin→コインを1回投げる、Supporter→サポート、Item→グッズ、Pokémon Tool→ポケモンのどうぐ、damage counter→ダメカン、Special Condition→特殊状態）
- LLM翻訳のものはカード詳細に「仮訳」と小さく出す。次回のGame8取得で照合できたら自動で置き換える
- Claude Code上でバッチ処理する。APIキーをコードに埋め込まない

### 3.7 タグ付与（tag.ts）

- 正本は `taxonomy.yaml`（下記の形式）。タグIDは `energy.accel.trash` のようなドット区切り
- 付与単位はワザ・特性・トレーナーズ効果ごと
- 入力は英語原文（構造が安定していて解釈ブレが少ないため）。出力は `tags.json`
- 付与後に `validate.ts` で、未定義タグや空タグのカードを一覧化する

```yaml
- id: energy
  ja: エネルギー
  children:
    - id: energy.accel
      ja: エネ加速
      children:
        - { id: energy.accel.zone,  ja: エネゾーンから }
        - { id: energy.accel.trash, ja: トラッシュから }
  # synergy: 供給と要求のペアをタグに持たせる
- id: cond.trash.count
  ja: トラッシュ枚数で変動
  requires: [supply.trash.fill]
```

タグ階層の中身は Claude Docs の「ポケポケ検索 タグ階層 叩き台」に従う。シナジー判定は `supplies` / `requires` を taxonomy 上で対にしておき、build時に計算する。名前指定（「〇〇という名前のポケモン」）は効果文から抽出してカードIDで直接結ぶ。

### 3.8 表現辞書（lexicon-gen.ts）

- タグ・タイプ・カード種別・進化段階・ルールごとに、口語の言い回しを**1項目あたり30以上**生成する
- 他TCG由来の言葉も入れる（墓地、ハンデス、ドロソ、サーチ、除去 など）
- 形式：

```json
{ "expr": "エネ加速", "target": { "tag": "energy.accel" }, "weight": 1.0 }
{ "expr": "ほのお",   "target": { "type": "fire" },       "weight": 1.0 }
```

- 生成後に重複・衝突（同じ表現が別タグを指す）を `validate.ts` で検出する。衝突は両方に結びつけてよいが weight を下げる

## 4. 検索エンジン（src/search）

### 4.1 正規化

NFKC → 小文字化 → カタカナをひらがなへ → 長音・小書き文字の揺れを吸収 → 「エネルギー」を「エネ」に統一。辞書側も同じ関数で正規化してから索引化する。

### 4.2 解析

1. **数値パターン**を正規表現で先に抜き出す
   - コスト：「水1」「水エネ1個」「無色2」「あとは無色」「どのエネでも」
   - 数値比較：「HP100以上」「80ダメ以上」「にげる0」「3エネ以下」
2. 残りを表現辞書のトライ木で**最長一致**し、タグ・タイプ・種別に変換
3. どこにも一致しなかった区間は全文検索語として残す（日本語訳・英語原文の両方）

「水1個であとは無色」は `cost.water == 1 && costTyped == 1` に変換される。

### 4.3 スコアリング

- 条件は厳密なANDにしない。一致した条件の重みの合計で並べる
- タイプ・種別・数値条件は「ハード条件」として、満たさないカードを除外する（ユーザーが明示した前提だから）
- タグは「ソフト条件」。親タグ指定で子タグも一致扱い、ただし直接一致より重みを下げる
- 1つのワザ内で複数条件がそろうと加点（ワザ単位タグ付与の利点）
- 全文検索の一致は低い重みで加点
- 上位50件を返す。結果カードには「何に一致したか」のチップを出す

## 5. 画面

### 5.1 検索

- 上部に検索バー。下に一致チップ（タップで外せる）
- タイプ・種別の絞り込みチップも併設
- 結果はカード画像のグリッド。タップで詳細（どの画面でも同じ）。デッキへの出し入れは詳細の −／＋

### 5.2 カード詳細

- 画像、日本語の効果文（英語原文は折りたたみ）、タグ
- 「相性のいいカード」：シナジー判定で結ばれたカードを横スクロールで表示（PCは折り返し）。理由のラベル付き。効果文からの判定に加え、実際の使われ方でも結ぶ:
  - 攻略記事の定番の組み合わせ（`data/combos.yaml`。理由と出典URL付き）。いちばん強く結ぶ
  - トレーナーズが条件で効く相手（`data/trainer-synergy.yaml`。タイプ・進化段階・グループ・ワザ名・にげるエネなど）
  - 山札からポケモンを持ってくる効果は、対象が絞られているもの（ルチア＝HP50以下のたね、セレナ＝メガシンカex など）だけ結ぶ
  - 大会で勝ち越したデッキに一緒に入っていることが多い組（`data/meta/meta.json`。Limitless の大会結果。どのデッキにも入る定番どうしは、偶然より1.5倍以上多いものだけ残すことで除く）
- 「このカードを使ったデッキ（大会）」: 収録の下。そのカードが入った大会のデッキリスト（勝ち越し・五分。同じ構成はまとめて件数を出す）をおすすめ順（最近の大会で好成績なものから。3週間ごとに重みが半分。新しい順・成績順にも切り替え）に。デッキタイプで絞り込み、「このデッキをコピーして編集」でマイデッキに入れて編集画面へ（PCは右の列のデッキが切り替わる）。データは必要になってから読み込む
- 「定番の組み合わせ（攻略記事より）」「大会での使われ方」（採用率と、よく入っているデッキタイプ。タップでそのデッキで探す）
- 検索: 「〇〇デッキ」（大会のデッキタイプでの採用率順）、「〇〇と相性がいい」（相性のいいカード）、「大会でよく使われる」（採用率1%以上）を条件として読む
- 進化ライン

### 5.3 デッキ

- 20枚固定、同名カード2枚まで、たねポケモン1枚以上を必須にして検証
- エネルギーゾーンのタイプ選択（最大3）
- 作ったデッキは複数保存できる（localStorage）。JSONで書き出し・読み込みもできる（機種変更やPC⇔スマホの移動用）
- **画像として保存**：カードを並べた1枚画像をPNGで書き出す。オンライン時は高解像度画像（PocketDecksのraw.githubusercontent.com、CORS対応）を使い、オフライン時は埋め込みサムネイルで書き出す

### 5.5 単一HTMLの制約

- `file://` で開くので、外部ファイルの `fetch` やService Workerは使わない。データはJSに埋め込む
- 起動を速くするため、データは圧縮して埋め込み、初回に展開する（例：JSON → gzip → base64 → `DecompressionStream`）
- サイズ目安：テキストデータ数MB＋サムネイル約1,400枚×10KB前後で、合計20〜30MB程度
- iPhoneの「ファイル」アプリのプレビューはJSを実行しないので、スマホではJSが動くHTMLビューアアプリかブラウザで開く。Androidは端末とブラウザによって可否が分かれる

### 5.4 レビュー（開発用）

- タグ・翻訳を目視確認して `overrides.json` 用の差分を出せるページ。本番ビルドには含めない

## 6. マイルストーン

| 段階 | 内容 | 完了条件 |
| --- | --- | --- |
| M1 | 取得・正規化・ポケモン名日本語化・Game8取得と照合 | 全カードが内部スキーマで出力され、9割以上に公式日本語が付き、`validate.ts` が通る |
| M2 | 翻訳補完・タグ付与・レビューページ | 全ワザ/特性/効果に日本語とタグが付く |
| M3 | 表現辞書・検索エンジン | 下の受け入れテストが全部通る |
| M4 | 検索・詳細・シナジー画面 | スマホ幅で操作できる |
| M5 | デッキ編集・画像保存・URL共有 | 20枚デッキを作ってPNG保存できる |
| M6 | 単一HTML化 | `dist/pokepoke.html` 1つをオフラインのPCとスマホで開いて全機能が動く |

## 7. 検索の受け入れテスト

Vitestで、各検索文の上位結果に期待カードが含まれることを確認する。期待カードはM2完了後に実データから選んで埋める。

- 「トラッシュの枚数によって効果が変わる系のカード」
- 「攻撃の必要エネが水1個であとは無色でいいカード」
- 「エネ加速できる炎のカード」
- 「ベンチに攻撃できる雷ポケモン」
- 「にげるエネ0のたね」
- 「相手の手札を減らすサポート」
- 「コインで火力が上がるワザ」
- 「ダメージを受けないようにするワザ」

## 8. 公開について

GitHub Pages（https://torikyatt.github.io/pokepoke/）で公開する。PocketDecks v5 の AGPL-3.0 に従ってリポジトリも公開する。Game8 由来の日本語はサイトに含めている（規約上のリスクは承知のうえ）。問題が出たら `data/game8/` を外し、`translate.ts` の仮訳に切り替える。

### 公開の形

- Web版: `dist/`（サムネイルはファイル配信、高解像度画像は PocketDecks の raw.githubusercontent.com）
- 単一HTML版: `dist/pokepoke.html`。Web版の設定画面からダウンロードできる
- `main` への push で GitHub Actions がテスト・ビルドして `gh-pages` ブランチに公開する
