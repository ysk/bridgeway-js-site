// global.vue.js — <script> 一本で使う「CDN版(Vueエンジン同梱)」のエントリ。
//
// Vueフルビルド(実行時テンプレコンパイラ同梱)を内包するので、ビルド不要で
//   ・$$ / state / computed … jQueryの書き味＋リアクティブ
//   ・mount … template文字列のVueコンポーネントをその場でマウント
// がすべて動く。Vue公式のCDNフルビルドと同じ発想。
//
//   <script src="bridge.vue.js"></script>
//   <script>
//     const App = { data: () => ({ n: 0 }), template: `<button @click="n++">{{ n }}</button>` };
//     mount(App, { target: "#app" });
//   </script>

import { $$, Bridge, state, computed } from "./bridge.js";
import { mount } from "./mount.js";
import { useEngine, engine } from "./engine.js";
import { vueEngine } from "./engines/vue.js";
import { attachGlobal } from "./attach-global.js";

useEngine(vueEngine); // CDN版はVueを既定で配線

const api = { $$, Bridge, state, computed, mount, useEngine, engine, vueEngine };

// window へ公開(衝突退避 + noConflict/alias 付き)
attachGlobal(api);
