bridgey の公式サイト。**サイト自身も bridgey v2 で動いている（ドッグフーディング）。**

## v2（2026-07-26 の破壊的変更）を反映済み

**Svelte / Vue への依存は廃止した。** bridgey は依存ゼロの自前ライブラリになった。
サイトの文言・コード例も、この前提で書く。

- キャッチコピー: **「jQuery のまま、モダンに。」**
- 一行目に置く定義: **「保守する人のためのライブラリです。書き直す予算はなくても、事故だけは止められます。」**
- コンセプト（不変）: **レガシー現場にモダンを。**＝ 学習コストの削減
- 出発点: 作者が実際に苦しめられた事故（数値計算が合わない / 非表示required で CV が落ちる / オートフィルで未入力扱い / next() で静かに壊れる / 1つの undefined で全機能が死ぬ / 日本語入力で壊れる）

**書いてはいけないこと（v1 の残骸）**
- `useEngine` / `mount(Component)` / エンジン差し替え / `.svelte` / `.vue` / Vue フルビルド
- 「本物のフレームワークに委譲」「複雑になったら Svelte へ mount」
- `$$.ajax` / `$$.get` / `$$.post` / `bindText` / `state(0).value`

**書くこと**
- ビルド不要 / 依存ゼロ / gzip 16kB / **eval 不使用（CSPセーフ）** / TypeScript 製
- まず4語: `state` / `computed` / `when` / `repeat`
- 段階移行の4段（`.addClass` → JS API → ディレクティブ → Svelte/Vue）と**1対1の対応表**
- 「持たないもの」と代わりの書き方（削除リストがモダン化の教科書になる）

## 構成

```
index.html          永続ヘッダー/フッター。dist/bridgey.js → dist/site.js の順で読む
site.js             サイトのルーター。$$.state / $$.resource / $$.component だけで書く
views/*.html        各ビュー（innerHTML で差し込まれる断片）
styles.css          サイトのスタイル
vendor/bridgey/     隣のリポジトリの配布物を取り込んだもの（コミットする）
sync-bridgey.mjs    ../brigde-js-core/dist から vendor/ へ取り込む
build.mjs           dist/{bridgey.js,site.js,styles.css} を出す
test/               index.html + dist を jsdom で実際に動かす smoke テスト
```

**本体はここでビルドしない。** 隣の `../brigde-js-core` で `npm run build` してから
`npm run build`（= sync + build）すると取り込まれる。Vercel には隣のリポジトリが無いので、
`vendor/bridgey/` は**コミットしておく必要がある**。npm に bridgey@2 が公開されたら CDN 参照に置き換える。

## ビューに inline `<script>` を書かないこと

ビューは `innerHTML` で差し込むので、中の `<script>` は実行されない。
動くデモを置きたいときは **`data-component="…"` を書き、site.js で `$$.component()` を登録する**。
差し込まれた HTML にも自動でマウントされる（＝「Ajax で追加した要素にも効く」の実例になる）。

## コード例は「実物」を表示する

手で書いた抜粋を貼ると、いつか実装とズレて嘘になる。
- HTML は DOM から読む（`innerHTML`）
- JS は関数から読む（`Function.prototype.toString`）

ホームのライブデモはこの方式。Before/After を並べるときも同じにする。

## 残っている作業

- `views/docs.html` / `views/tutorial.html` / `views/examples.html` は**まだ v1 の内容**（要全面改稿）
- 複雑なフォームで新旧（jQuery / bridgey）を併記するデモ
- サイト上でコードを編集して即実行できるプレイグラウンド
  （`new Function` は使わず iframe + srcdoc か Blob URL で。CSPセーフの看板と両立させる）
