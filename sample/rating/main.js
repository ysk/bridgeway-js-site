// main.js — 星評価 & レビュー（純粋 $$ + state/computed）。
// 星の塗りは jQueryの .each / .toggleClass。平均・分布・投稿一覧は computed で。
// 「ホバー中は仮表示・確定値は state」を分けるのが操作感のコツ。

import { $$, state, computed, useEngine } from "../../src/index.js";
import { svelteEngine } from "../../src/engines/svelte.js";

useEngine(svelteEngine);

// ── 投稿済みレビュー（初期データ入り） ──
const reviews = state([
  { score: 5, comment: "期待以上でした。リピートします！" },
  { score: 4, comment: "満足。梱包も丁寧。" },
  { score: 5, comment: "" },
  { score: 3, comment: "普通かな。" },
]);

// 自分の入力中の評価（0 = 未選択）
const myScore = state(0);

// ── 星の塗り分け（n個ぶんを on に）。jQueryの .each そのまま ──
function paint(n) {
  $$("#input-stars .star").each(function () {
    $$(this).toggleClass("on", Number(this.dataset.v) <= n);
  });
}

// ホバーでプレビュー、離れたら確定値に戻す（イベント委譲）
$$("#input-stars")
  .on("mouseover", ".star", function () {
    paint(Number(this.dataset.v));
  })
  .on("mouseleave", function () {
    paint(myScore.value);
  })
  .on("click", ".star", function () {
    myScore.value = Number(this.dataset.v);
  });

const labels = ["タップで評価", "不満", "いまひとつ", "普通", "満足", "大満足"];
myScore.subscribe((n) => {
  paint(n);
  $$("#rate-label").text(labels[n]);
  $$("#post").prop("disabled", n === 0); // 星を選ぶまで投稿不可
});

// ── 投稿：新しい配列を先頭に足して state 更新 → 一覧・平均が自動追従 ──
$$("#post").on("click", function () {
  reviews.value = [{ score: myScore.value, comment: $$("#comment").val().trim() }, ...reviews.value];
  // 入力をリセット（jQueryそのまま）
  myScore.value = 0;
  $$("#comment").val("");
});

// ── 平均は computed ──
const average = computed(() => {
  const list = reviews.value;
  return list.length ? list.reduce((s, r) => s + r.score, 0) / list.length : 0;
});
$$("#avg").bindText(average, (v) => v.toFixed(1));
$$("#avg-count").bindText(reviews, (list) => list.length + "件");

// ── 分布バー（★5〜★1）も computed で ──
computed(() => {
  const list = reviews.value;
  return [5, 4, 3, 2, 1].map((star) => ({
    star,
    pct: list.length ? (list.filter((r) => r.score === star).length / list.length) * 100 : 0,
  }));
}).subscribe((dist) => {
  $$("#bars").html(
    dist
      .map(
        (d) =>
          `<div class="bar-row"><span>★${d.star}</span>` +
          `<span class="track"><span class="fill" style="width:${d.pct}%"></span></span></div>`
      )
      .join("")
  );
});

// ── レビュー一覧（reviews が変わるたび描画） ──
const escape = (s) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
reviews.subscribe((list) => {
  $$("#reviews").html(
    list
      .map(
        (r) =>
          `<div class="review"><div class="rs">${"★".repeat(r.score)}<span style="color:#dcdce4">${"★".repeat(5 - r.score)}</span></div>` +
          `<p class="cm ${r.comment ? "" : "empty"}">${r.comment ? escape(r.comment) : "（コメントなし）"}</p></div>`
      )
      .join("")
  );
});
