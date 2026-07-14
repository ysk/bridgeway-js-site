// main.js — 利用者コード。bridgey の書き味だけで本物のSvelteのToDoを動かす。
// 触るのは $$ / mount の2つだけ = 学習コストは jQuery+α。

import { $$, mount, useEngine } from "../../src/index.js";
import { svelteEngine } from "../../src/engines/svelte.js";
import Todo from "./Todo.svelte";

// 起動時に一度だけエンジンを選択
useEngine(svelteEngine);

// 本物のSvelteコンポーネントをマウント(描画・差分・破棄はSvelteが担当)。
// コンポーネント“外”のバッジ更新を、jQueryの書き味($$)のままコールバックで渡す。
// Svelte領域(#app)とバッジ(#count)は別ノード = 領域分離の相互運用。
const app = mount(Todo, {
  target: "#app",
  props: {
    onRemaining: (n) => $$("#count").text(n).toggleClass("zero", n === 0),
  },
});
