// build.demo.mjs — サンプル(本物の.svelte / .vue風)をビルド。
//   実行: node build.demo.mjs
//   各 main.js を rollup でバンドルし、IIFEを出力。
//
// これは将来の「npm install bridgey → フレームワーク選択」で自動化したい部分の原型。

import { rollup } from "rollup";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import svelte from "rollup-plugin-svelte";
import alias from "@rollup/plugin-alias";

// Vue: 実行時テンプレコンパイラ同梱のフルビルドへ寄せる(SFC不要)。
// エンジンとコンポーネントで同一Vueインスタンスを共有するため alias で固定。
const vueFull = alias({
  entries: [{ find: /^vue$/, replacement: "vue/dist/vue.esm-browser.prod.js" }],
});

const demos = [
  {
    input: "sample/deep/main.js",
    file: "sample/deep/app.js",
    name: "DeepDemo",
    plugins: [svelte({ emitCss: false, compilerOptions: { dev: false } })],
  },
  {
    input: "sample/todoapp/main.js",
    file: "sample/todoapp/todo.js",
    name: "TodoDemo",
    plugins: [svelte({ emitCss: false, compilerOptions: { dev: false } })],
  },
  {
    input: "sample/vue/main.js",
    file: "sample/vue/app.js",
    name: "VueDemo",
    plugins: [vueFull],
  },
  {
    // 部品もmountも無い純粋$$デモ(svelteストアだけ使う。svelteプラグイン不要)
    input: "sample/jquery/main.js",
    file: "sample/jquery/app.js",
    name: "JqueryDemo",
    plugins: [],
  },
  {
    // 実務: フォームバリデーション(純粋$$ + state/computed)
    input: "sample/form/main.js",
    file: "sample/form/app.js",
    name: "FormDemo",
    plugins: [],
  },
  {
    // 実務: ライブ検索フィルタ(純粋$$ + state/computed)
    input: "sample/search/main.js",
    file: "sample/search/app.js",
    name: "SearchDemo",
    plugins: [],
  },
  {
    // 実務: ショッピングカート(純粋$$ + state/computed)
    input: "sample/cart/main.js",
    file: "sample/cart/app.js",
    name: "CartDemo",
    plugins: [],
  },
  {
    // 実務: モーダル/画像ギャラリー(純粋$$ + state)
    input: "sample/modal/main.js",
    file: "sample/modal/app.js",
    name: "ModalDemo",
    plugins: [],
  },
  {
    // 実務: 星評価 & レビュー(純粋$$ + state/computed)
    input: "sample/rating/main.js",
    file: "sample/rating/app.js",
    name: "RatingDemo",
    plugins: [],
  },
  {
    // 段階移行の卒業ルート: レガシー($$)×島(Svelte)を共有stateで橋渡し
    input: "sample/migrate/main.js",
    file: "sample/migrate/app.js",
    name: "MigrateDemo",
    plugins: [svelte({ emitCss: false, compilerOptions: { dev: false } })],
  },
];

for (const demo of demos) {
  const bundle = await rollup({
    input: demo.input,
    plugins: [
      ...(demo.plugins || []),
      nodeResolve({ browser: true, dedupe: ["svelte", "vue"] }),
    ],
    // Vueフルビルドの__feature__フラグ未定義の警告は無害。onwarnで静音化。
    onwarn(w, warn) {
      if (w.code === "CIRCULAR_DEPENDENCY" || /__VUE/.test(w.message || "")) return;
      warn(w);
    },
  });
  await bundle.write({ file: demo.file, format: "iife", name: demo.name });
  await bundle.close();
  console.log("built:", demo.file);
}
