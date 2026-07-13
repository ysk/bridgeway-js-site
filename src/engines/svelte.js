// engines/svelte.js
// Svelteアダプタ ── 既定のリアクティビティ・エンジン。
//
// 中身は正真正銘 Svelte のランタイム(svelte/store)。
// runes($state)はコンパイラ前提で単体では動かないが、store は実行時APIなので
// バンドルして配布版 bridge.js に同梱できる = 利用者は <script> 一本で入る。
//
// このファイルは「engine.js が定める Adapter 契約」を満たす一実装にすぎない。
// 同じ契約を満たせば Vue でも Signals でも差し替えられる。

import { writable, derived, get } from "svelte/store";

// svelte store を Reactive 契約(get/set/update/subscribe)に包む
function wrap(store) {
  return {
    _store: store, // computed(derived)構築用に内部保持
    get: () => get(store),
    set: (v) => {
      if (typeof store.set !== "function") {
        throw new Error("[bridge] computed は読み取り専用です");
      }
      store.set(v);
    },
    update: (fn) => store.update(fn),
    subscribe: (cb) => store.subscribe(cb),
  };
}

export const svelteEngine = {
  name: "svelte",

  state(initial) {
    return wrap(writable(initial));
  },

  // reactives: このエンジンが作った Reactive の配列
  computed(reactives, fn) {
    const stores = reactives.map((r) => r._store);
    return wrap(derived(stores, (values) => fn(...values)));
  },

  // 本物のSvelteコンポーネントを載せる/破棄する。
  //   Component はコンパイル済みSvelteクラス(.svelte を rollup-plugin-svelte でビルドしたもの)。
  //   Svelteがリアクティブ更新・DOM差分・購読解除を全部やる = ②③④が消える。
  mount(Component, { target, props }) {
    const instance = new Component({ target, props: props || {} });
    return {
      instance,
      set: (p) => instance.$set(p), // props更新 → Svelteが必要な箇所だけ差分更新
      on: (ev, cb) => instance.$on(ev, cb), // コンポーネントの dispatch を購読
      destroy: () => instance.$destroy(), // 子・購読・DOMをSvelteが自動片付け(④/⑤)
    };
  },
};
