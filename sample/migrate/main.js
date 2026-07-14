// migrate — bridgey の“うま味”の実証（レガシー→モダンの卒業ルート）。
//   ・入力/イベント = jQueryの手癖のまま($$)
//   ・描画          = 本物のSvelteに委譲(mount)
//   ・両者の会話     = 共有 state  ← ここが橋。ノードには相乗りしない(断線しない)
import { $$, state, computed, mount, useEngine } from "../../src/index.js";
import { svelteEngine } from "../../src/engines/svelte.js";
import App from "./App.svelte";

useEngine(svelteEngine);

const ALL = ["apple", "banana", "cherry", "grape", "melon", "orange", "peach"];

// 共有 state = 橋。
const query = state("");
const results = computed(query, (q) => (q ? ALL.filter((x) => x.includes(q)) : ALL));

// ── jQueryの領域 ── DOMを直接いじらず、共有 state に書くだけ。
$$("#q").on("input", (e) => (query.value = e.target.value));
$$("#clear").on("click", () => {
  query.value = "";
  $$("#q").val(""); // 自分の領域(Svelteの外)の入力欄はjQueryで操作してOK
});

// ── Svelteの領域 ── 共有 state を渡して描画を丸投げ。
const app = mount(App, { target: "#panel", props: { query, items: results } });

// ── Svelte → jQuery ── Svelteが出したイベントを、jQueryの領域のノードに反映。
app.on("pick", (e) => $$("#picked").text("選択: " + e.detail));
