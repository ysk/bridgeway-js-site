// build.mjs — <script>/<link> で読む配布物を dist/ に「結合(bundle)＋minify」して出力。
//   実行: node build.mjs   (npm run build)
//
// JS も CSS も esbuild 一本で minify する。
//
//   dist/bridgey.js      … Svelteエンジン同梱(軽量)。$$ / state / computed 中心。
//                         mount はコンパイル済みSvelte部品向け。
//   dist/bridgey.vue.js  … Vueフルビルド(実行時コンパイラ)同梱。ビルド不要で
//                         template文字列のVue部品を mount まで動かせる。
//   dist/site.js         … このサイト自身のSPAルーター(ソースは site.js のまま)。
//   dist/styles.css      … このサイトのスタイル(ソースは styles.css のまま)。
//
// npm版は import "bridgey" (src/index.js)。こちらは <script src>/<link> 用。

import { build } from "esbuild";

// 3rd-party の /*! … */ ライセンスコメントはファイル末尾へ集約して残す(legalComments既定)。
// globalName は使わない: エントリ(src/global.js 等)が attachGlobal() で自前に
// window へ公開するため。esbuild の globalName は exports 無しでも末尾に
// `var bridgey = (...)()`(=undefined) を生成し、window.bridgey を上書きしてしまう。
const common = {
  bundle: true,
  format: "iife",
  minify: true,
  platform: "browser",
  target: "es2019",
};

const builds = [
  // ── <script src="bridgey.js">(Svelteエンジン同梱) ──────────────────────────
  {
    ...common,
    entryPoints: ["src/global.js"],
    outfile: "dist/bridgey.js",
    banner: {
      js:
        "/*! bridgey — jQuery感覚でモダン開発 / グローバル版(Svelteエンジン同梱). bridgey is MIT licensed.\n" +
        " * Bundles Svelte (MIT, Copyright (c) 2016-23 the Svelte contributors). See THIRD-PARTY-NOTICES.md. */",
    },
  },
  // ── <script src="bridgey.vue.js">(Vueフルビルド同梱・ビルド不要) ─────────────
  {
    ...common,
    entryPoints: ["src/global.vue.js"],
    outfile: "dist/bridgey.vue.js",
    // vue → フルビルド(実行時コンパイラ入り・production) に解決。
    alias: { vue: "vue/dist/vue.esm-browser.prod.js" },
    // Vue のフィーチャフラグを解決(未定義だと実行時警告)。
    define: {
      __VUE_OPTIONS_API__: "true",
      __VUE_PROD_DEVTOOLS__: "false",
      __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: "false",
    },
    banner: {
      js:
        "/*! bridgey.vue.js — jQuery感覚でモダン開発 / グローバル版(Vueフルビルド同梱・ビルド不要). bridgey is MIT licensed.\n" +
        " * Bundles Vue (MIT, Copyright (c) 2018-present Yuxi (Evan) You). See THIRD-PARTY-NOTICES.md. */",
    },
  },
  // ── このサイト自身のSPAルーター(ソースは site.js) ──────────────────────────
  {
    ...common,
    entryPoints: ["site.js"],
    outfile: "dist/site.js",
    banner: { js: "/*! bridgey.org site script. bridgey is MIT licensed. */" },
  },
  // ── このサイトのスタイル(ソースは styles.css) ──────────────────────────────
  {
    entryPoints: ["styles.css"],
    outfile: "dist/styles.css",
    minify: true,
    // 相対 url()/@import は無い前提なので bundle しない(パスをそのまま維持)。
    bundle: false,
    banner: { css: "/*! bridgey.org styles. bridgey is MIT licensed. */" },
  },
];

for (const b of builds) {
  await build(b);
  console.log("built:", b.outfile);
}
