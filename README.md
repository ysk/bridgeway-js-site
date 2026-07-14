# bridgey

## jQueryの手に、リアクティビティを。

覚えるのは `$` を `$$` にするだけ。使い慣れたjQueryの書き味に、**自動で反映される状態（`state` / `computed`）**が加わります。「数量を変えたら合計も勝手に直る」——**ビルドもコンポーネントも要らず**、`<script>` 一本から。

複雑になった画面は、そのまま**Svelte(またはVue)**へ引き上げ（`mount`）。DOMの差分更新・後片付けは実績あるエンジンに委ね、フォーカスも入力途中も飛ばしません。

**もう新しいフロントエンドフレームワークに翻弄されない** 
エンジンは差し替え式。利用者が書く `$$ / state / mount` は、下がSvelteでもVueでも変わりません。

---

## 何を提供して、何を提供しないか

**bridgeyが担うのは2つだけ（薄い皮）:**
1. `$$` … jQueryの書き味の命令的グルー（イベント・クラス・テキスト。既存の手がそのまま動く入口）
2. `state` / `computed` / `mount` … リアクティブ状態とコンポーネントのライフサイクル（下のエンジンに委譲）

**提供しないもの（意図的。“薄いヘルパー”に留める）:**
- ルーティング / スコープCSS / 独自コンポーネント境界 → それは下のフレームワーク（Svelte）の仕事
- **jQueryとの共存機構**（領域自動判定・再適用フック等）

> **共存について:** 「サポートしない」＝機能として売らない、という意味で、**不可能ではありません**。Svelteは `mount` した要素のサブツリーだけを管理し、外には触れません。だから「カルーセル＝jQueryの領域 / フォーム＝Svelteの領域」と**ノードを分ければ、コーダーの工夫で共存できます**（自己責任）。禁止は「同一ノードを両者に相乗りさせる」ことだけです。

---

## 使い方

```
your-app/
├─ App.svelte     ← 構造・制御構文・DOM更新（本物のSvelte）
├─ main.js        ← bridgeyの書き味で載せる
└─ index.html     ← <div id="app"></div> と <script src="app.js">
```

```svelte
<!-- App.svelte -->
<script>
  export let name = "world";
  let count = 0;
  $: doubled = count * 2;         // 式はビルド時コンパイル（evalではない）
</script>
<button on:click={() => count++}>＋</button>
<span class:big={count >= 10}>{count}</span> / 2倍 {doubled}
{#if count > 10}<p>10超え</p>{/if}
```

```js
// main.js
import { $$, state, mount } from "bridgey";   // ← 開発中は "../../src/index.js"
import App from "./App.svelte";

const app = mount(App, { target: "#app", props: { name: "bridgey" } });

// jQueryの書き味の命令的グルーはそのまま使える
$$("#reset").on("click", () => app.set({ name: "world" }));
$$("#destroy").on("click", () => app.destroy()); // 購読もDOMもSvelteが片付ける
```

利用者が触るのは `$$ / state / mount` の3つだけ。学習コストは「jQuery＋α」。

---

## デモを見る

まず一度ビルドし、静的サーバーで開きます。

```bash
npm install          # 依存を取得（svelte / rollup / rollup-plugin-svelte）
node build.demo.mjs  # サンプルの .svelte をバンドル
python3 -m http.server 8000   # または npx serve .
```

| URL | 内容 |
| --- | --- |
| http://localhost:8000/sample/deep/ | Svelte移行の最小デモ（カウンタ／`{#if}`／破棄。CSP有効・入力フォーカス保持） |
| http://localhost:8000/sample/todoapp/ | ToDo（keyed `{#each}` の差分更新。`$$` グルーで外のバッジ更新） |
| http://localhost:8000/sample/vue/ | 同じ画面をVueエンジンでも。利用者コードは `sample/deep` とほぼ同一（`useEngine(vueEngine)` を足すだけ） |
| http://localhost:8000/sample/form/ | フォームバリデーション（純粋 `$$` ＋ `state`/`computed`） |
| http://localhost:8000/sample/jquery/ | タブ・合計・命令的→宣言的（純粋 `$$`） |

## このサイトを公開する（Vercel）

`vercel.json` は `outputDirectory: "."` / `buildCommand: ""`。**Vercel側ではビルドせず、リポジトリの中身をそのまま静的配信**します。したがって `dist/` とデモの `sample/*/app.js` は**ローカルでビルドしてからデプロイ**します（プロジェクトは `.vercel/` で既にリンク済み）。

```bash
# 0) Vercel CLI（未導入なら）。以降の vercel を npx vercel で代用しても可
npm i -g vercel
vercel login          # 対話（メール/ブラウザ認証）。手元ターミナルで一度だけ

# 1) 配信物をローカルでビルド（← これを忘れると古い内容が公開される）
node build.mjs        # dist/（このサイト自身が読み込む bridgey 本体）
node build.demo.mjs   # sample/*/app.js（各デモの本物ビルド）

# 2) デプロイ
vercel          # プレビュー（確認用の一時URLが出る。まずこれで目視）
vercel --prod   # 本番へ反映（bridgey.org）
```

> 初回や未ログイン時は `vercel login` を先に。`.vercelignore` により `node_modules / src / bin / *.md / build*.mjs` は配信対象外です（`dist / sample / views / index.html / site.js / styles.css` が公開されます）。

## 2つの入り方

**① npm（本格運用）— `brg init` が入口**

```bash
npx brg init my-app        # svelte / vue を選択
cd my-app && npm install   # bridgey と svelte(or vue) をまとめて導入
```

生成される `package.json` に svelte(or vue) まで書き込まれるので、**手でライブラリを入れ足す必要はありません**。既存のビルドに組み込む場合だけ `npm install bridgey svelte`（or `vue`）と直接入れます。詳細は下の「新規プロジェクトを作る（CLI）」。

**② `<script>`で読み込む（簡易運用）**

```html
<!-- Vueフルビルド同梱。mount まで全部動く -->
<script src="dist/bridgey.vue.js"></script>
<script>
  const App = { data: () => ({ n: 0 }), template: `<button @click="n++">{{ n }}</button>` };
  mount(App, { target: "#app" });   // $$ / state / mount は window に
</script>
```

- `dist/bridgey.vue.js` … Vueフルビルド同梱。ビルド不要で template 文字列の部品を `mount` まで。
- `dist/bridgey.js` … Svelte(軽量)同梱。`$$ / state / computed` 中心。
- グローバル版は `npm run build`（`build.mjs`）で `dist/` に生成。npm公開後は `https://cdn.jsdelivr.net/npm/bridgey/dist/bridgey.vue.js` で読めます。

## 新規プロジェクトを作る（CLI）

`brg init` が、選んだフレームワークに**配線済みのスタータ**を生成します。

```bash
npx brg init my-app
#  フレームワークを選択:  1) svelte  2) vue
#  → my-app/ に App.(svelte|js) / main.js / build.mjs / index.html を生成

# 非対話でも指定可
npx brg init my-app --framework vue
```

生成される `main.js` は `$$ / state / mount` で共通。**違いはエンジン選択（Vueなら `useEngine(vueEngine)` の1行）と部品の書式だけ**。あとで別ディレクトリに逆のフレームワークで作り直せば、利用者コードはほぼそのまま移せます。

---

## アーキテクチャ（エンジン差し替え）

```
利用者コード（$$ / state / mount）  ← ここは常に不変
        │
   src/engine.js（レジストリ / useEngine）
        │
   ┌────┴─────┐
svelteEngine   vueEngine（将来）
 state=writable  state=ref/reactive
 computed=derived computed=computed
 mount=new Component  mount=createApp
```

- `src/engines/svelte.js` … 既定エンジン。`state`/`computed`/`mount` を本物のSvelteで実装
- `src/mount.js` … `mount()` は現在のエンジンの `mount` へ委譲（Svelte決め打ちにしない）
- 将来ビジョン: `npm install bridgey` → `select framework: ◯ svelte ◯ vue` でエンジンを自動配線

配布用グローバルビルド（`<script>`向け）は `npm run build`（`build.mjs`）で `bridgey` を再生成します。ただし `mount` はコンパイル済みコンポーネントを渡す前提なので、実運用では利用者側のビルドと併用します。

---

## コンセプト

- **ターゲット:** レガシー環境でjQuery保守が続く人／WordPress等でモダンFWを入れる機会がない人／jQueryならわかる人
- **必須要件:** 書き味はjQueryのまま／裏で本物のモダンFWが動く／学習コストを限りなく下げる
- **将来:** Svelteに加えVue等へエンジンを差し替え可能に（対話的に選べるように）
- **背景:** 作者自身がjQuery→Vueの移行でとん挫した。あの頃の自分を救うために、モダンを“楽に”始められる薄い橋を架ける

---

## ライセンス

bridgey は [MIT License](./LICENSE)。

配布ビルド（`dist/`）には Svelte / Vue（いずれもMIT）が同梱されます。各ライセンス表記は [THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md) を参照してください。

> bridgey は独立した**非公式**プロジェクトで、jQuery / Svelte / Vue の各プロジェクト・団体とは提携・後援・承認の関係にありません。jQuery の**書き味に着想**を得ていますが、jQuery のコードは含まず、APIを独自に再実装したものです。各名称は権利者の商標です。
