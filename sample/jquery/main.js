// main.js — 部品もmountも使わない“純粋 $$”デモ。
// jQueryの書き味そのままで、状態(state)に束縛すると表示が自動追従する。
// ＝ プロジェクトの核「命令的(jQuery脳) → 宣言的(モダン)」の移行グラデーション。

import { $$, state, computed, useEngine } from "../../src/index.js";
import { svelteEngine } from "../../src/engines/svelte.js";

useEngine(svelteEngine); // state/computed の裏側(Svelteストア)を有効化

// ── ① 命令的：いつものjQuery。クリックのたびに手で .text() 更新 ──
let n = 0;
$$("#inc-imp").on("click", () => $$("#count-imp").text(++n));

// ── ② 宣言的：状態を +1 するだけ。表示は束縛で自動追従 ──
const count = state(0);
$$("#inc-dec").on("click", () => count.value++);
$$("#count-dec").bindText(count).bindClass("hot", count, (v) => v >= 5);

// ── ③ タブ：jQuery定番の addClass/removeClass ＋ イベント委譲(this=クリック要素) ──
$$("#tabs").on("click", ".tab", function () {
  $$("#tabs .tab").removeClass("active");
  $$(this).addClass("active");
  $$("#panel").text($$(this).attr("data-label") + " の内容");
});

// ── ④ リアルタイム合計：input → state → computed → bindText ──
const price = state(980);
const qty = state(2);
const total = computed(() => price.value * qty.value);
$$("#price").on("input", function () { price.value = Number(this.value) || 0; });
$$("#qty").on("input", function () { qty.value = Number(this.value) || 0; });
$$("#total").bindText(total, (v) => "¥" + v.toLocaleString());

// ── ⑤ アニメーション：アコーディオン(slideToggle) & トースト(fadeIn/fadeOut) ──
$$(".acc").on("click", ".acc-head", function () {
  $$($$(this).attr("data-target")).slideToggle(180);
});
$$("#toast-btn").on("click", () => {
  $$("#toast").fadeIn(150);
  setTimeout(() => $$("#toast").fadeOut(400), 1200);
});
