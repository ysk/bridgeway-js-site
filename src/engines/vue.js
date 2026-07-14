// engines/vue.js
// Vueアダプタ ── engine.js が定める契約 {state, computed, mount} を Vue 3 で実装。
//
// 【これがエンジン差し替えの実証】
//   利用者が書く $$ / state / mount は一切変えずに、下の実装だけ Svelte→Vue に替わる。
//   useEngine(vueEngine) を最初に一度呼ぶだけ。＝「もう新フレームワークに翻弄されない」の実体。
//
// 実行時APIだけ使う(ref/computed/watch/createApp/h)ので、SFCコンパイラは不要。
// ※ Svelteエンジンと同一Vueインスタンスを共有するため、ビルド時に "vue" を
//   フルビルド(vue.esm-browser)へ alias する(build.demo.mjs 参照)。

import { createApp, reactive, ref, computed as vueComputed, watch, h } from "vue";

// Vueのref/computedを Reactive契約(get/set/update/subscribe)に包む。
// subscribe は「即時1回＋変化ごと」呼ぶ(Svelteストアと同じ購読意味論)。
function wrap(source, { readonly = false } = {}) {
  return {
    _src: source,
    get: () => source.value,
    set: (v) => {
      if (readonly) throw new Error("[bridgey] computed は読み取り専用です");
      source.value = v;
    },
    update: (fn) => {
      source.value = fn(source.value);
    },
    // watch は stop 関数を返す = 契約どおり購読解除関数になる
    subscribe: (cb) => watch(source, (v) => cb(v), { immediate: true }),
  };
}

export const vueEngine = {
  name: "vue",

  state(initial) {
    return wrap(ref(initial));
  },

  // reactives: このエンジンが作った Reactive の配列
  computed(reactives, fn) {
    const c = vueComputed(() => fn(...reactives.map((r) => r.get())));
    return wrap(c, { readonly: true });
  },

  // Vueコンポーネントを載せる/破棄する。
  //   Vueがリアクティブ更新・DOM差分(パッチ)・アンマウント時の後片付けを担当 = ②③④が消える。
  mount(Component, { target, props }) {
    // reactiveなbagを子のpropsに流す → set()で後から差し替え可能にする
    const bag = reactive({ ...(props || {}) });
    const app = createApp({ render: () => h(Component, bag) });
    const instance = app.mount(target);
    return {
      instance,
      set: (p) => Object.assign(bag, p), // reactive更新 → Vueが必要箇所だけパッチ
      // Vueのイベントは onXxx ハンドラpropとして流す(bagに載せる)
      on: (ev, cb) => {
        bag["on" + ev.charAt(0).toUpperCase() + ev.slice(1)] = cb;
      },
      destroy: () => app.unmount(), // 子・ウォッチャ・DOMをVueが自動片付け(④/⑤)
    };
  },
};
