# bridgey-site

**bridgey の公式サイト（[bridgey.org](https://bridgey.org)）のソース。**

## 何のサイトか

bridgey は「**jQuery のまま、モダンに。**」を掲げた、**依存ゼロ・ビルド不要**の DOM ライブラリです。
このサイトは、その入口となる4ページを配信します。

| ルート | 内容 |
| --- | --- |
| `#/` | 何が解決できるのか（事故の話）と、動くライブデモ |
| `#/tutorial` | `<script>` 1行から始める手順 |
| `#/docs` | API（まず4語: `state` / `computed` / `when` / `repeat`） |
| `#/examples` | カート / フォーム / ToDo などの実例と、jQuery との書き比べ |

**サイト自身も bridgey v2 で動いています（ドッグフーディング）。**
ルーティングもテーマ切替もコードのタブ切替も、`$$.state` / `$$.computed` / `$$.resource` /
`$$.component` だけで書いてあります。ここが壊れていたら「作った本人も使えていない」ということなので、
`test/` は `index.html` と `dist/` を jsdom でそのまま動かして確かめます。

---

## 動かす

```bash
npm install
npm run build     # dist/ を作る（sync-bridgey.mjs → build.mjs）
npm test          # index.html + dist を jsdom で実際に動かす smoke テスト
```

あとは `index.html` を**ブラウザで開くだけ**。サーバーは要りません。
ビューは build 時に `dist/views.js` へ埋め込むので `file://` でも動きます
（「ビルド不要」を看板にしているサイトが、閲覧にサーバーを要求しないように）。
サーバー越しに見たいときは `npx serve .` など。

---

## デプロイ（Vercel）

`vercel.json` は `buildCommand: ""` / `outputDirectory: "."`。
**Vercel 側ではビルドせず、リポジトリの中身をそのまま静的配信します。**
したがって `dist/` は**ローカルでビルドしてから**デプロイします（忘れると古い内容が公開される）。

```bash
# 0) 初回のみ。以降の vercel は npx vercel でも可
npm i -g vercel
vercel login          # 対話（メール/ブラウザ認証）。手元のターミナルで一度だけ

# 1) 配信物をローカルでビルド（← これを忘れると古い内容が出る）
npm run build

# 2) デプロイ
vercel                # プレビュー（一時 URL が出る。まず目視で確認）
vercel --prod         # 本番へ反映（bridgey.org）
```

プロジェクトは `.vercel/` でリンク済みです。
`.vercelignore` により `node_modules / build.mjs / sync-bridgey.mjs / package*.json / test /
*.md / LICENSE / .claude` は配信対象外（公開されるのは
`index.html / dist / views / vendor / styles.css / site.js / logo.svg`）。

**出す前に**

1. `npm run build` を通した（`dist/` が最新）
2. `npm test` が緑
3. `dist/` と `vendor/bridgey/` の変更をコミットした

---

## 構成

```
index.html          永続ヘッダー/フッター。dist/bridgey.js → views.js → samples.js → site.js の順に読む
site.js             サイトのルーター＋各デモ。$$.state / $$.resource / $$.component だけで書く
views/*.html        各ビュー（innerHTML で差し込まれる断片）
styles.css          サイトのスタイル
logo.svg            ファビコン
vendor/bridgey/     隣のリポジトリの配布物を取り込んだもの（コミットする）
vendor/fontawesome/ アイコン（外部 CDN を踏まないよう同梱）
sync-bridgey.mjs    ../brigde-js-core/dist → vendor/bridgey/ へ取り込む
build.mjs           dist/{bridgey,views,samples,site}.js と dist/styles.css を出す
test/               index.html + dist を jsdom で実際に動かす smoke テスト
```

