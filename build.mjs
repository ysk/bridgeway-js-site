// build.mjs — <script> で読む「グローバル版(CDN版)」を dist/ に出力。
//   実行: node build.mjs   (npm run build)
//
// 2種類:
//   dist/bridge.js      … Svelteエンジン同梱(軽量)。$$ / state / computed 中心。
//                         mount はコンパイル済みSvelte部品向け。
//   dist/bridge.vue.js  … Vueフルビルド(実行時コンパイラ)同梱。ビルド不要で
//                         template文字列のVue部品を mount まで動かせる。
//
// npm版は import "bridge" (src/index.js)。こちらは <script src> 用。

import { rollup } from "rollup";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import alias from "@rollup/plugin-alias";

const builds = [
  {
    input: "src/global.js",
    file: "dist/bridge.js",
    name: "bridgeway",
    banner:
      "/*! bridge.js — jQuery感覚でモダン開発 / グローバル版(Svelteエンジン同梱). bridge.js is MIT licensed.\n" +
      " * Bundles Svelte (MIT, Copyright (c) 2016-23 the Svelte contributors). See THIRD-PARTY-NOTICES.md. */",
    plugins: [nodeResolve()],
  },
  {
    input: "src/global.vue.js",
    file: "dist/bridge.vue.js",
    name: "bridgeway",
    banner:
      "/*! bridge.vue.js — jQuery感覚でモダン開発 / グローバル版(Vueフルビルド同梱・ビルド不要). bridge.js is MIT licensed.\n" +
      " * Bundles Vue (MIT, Copyright (c) 2018-present Yuxi (Evan) You). See THIRD-PARTY-NOTICES.md. */",
    plugins: [
      alias({ entries: [{ find: /^vue$/, replacement: "vue/dist/vue.esm-browser.prod.js" }] }),
      nodeResolve({ browser: true, dedupe: ["vue"] }),
    ],
  },
];

for (const b of builds) {
  const bundle = await rollup({
    input: b.input,
    plugins: b.plugins,
    onwarn(w, warn) {
      if (/__VUE|CIRCULAR/.test(w.code + (w.message || ""))) return;
      warn(w);
    },
  });
  await bundle.write({ file: b.file, format: "iife", name: b.name, banner: b.banner });
  await bundle.close();
  console.log("built:", b.file);
}
