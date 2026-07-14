// main.js — ライブ検索フィルタ（純粋 $$ + state/computed）。
// 検索語(input)と分類(チップ)をそれぞれ state に。両方を掛け合わせた
// 絞り込み結果は computed で宣言的に導出し、変化したら $$ で一覧を描き直す。
// ＝「入力は命令的に受ける・結果は宣言的に導く」bridgey の型どおりの例。

import { $$, state, computed, useEngine } from "../../src/index.js";
import { svelteEngine } from "../../src/engines/svelte.js";

useEngine(svelteEngine);

// ── データ（実務ではAPI取得でもOK。ここでは即値） ──
const items = [
  { name: "りんご", cat: "fruit", price: 180 },
  { name: "バナナ", cat: "fruit", price: 120 },
  { name: "いちご", cat: "fruit", price: 480 },
  { name: "たまねぎ", cat: "veg", price: 60 },
  { name: "にんじん", cat: "veg", price: 40 },
  { name: "じゃがいも", cat: "veg", price: 35 },
  { name: "ほうれん草", cat: "veg", price: 150 },
  { name: "さけ", cat: "fish", price: 320 },
  { name: "まぐろ", cat: "fish", price: 580 },
  { name: "あじ", cat: "fish", price: 210 },
  { name: "牛肉", cat: "meat", price: 780 },
  { name: "鶏むね肉", cat: "meat", price: 240 },
  { name: "豚バラ肉", cat: "meat", price: 360 },
];
const catLabel = { fruit: "果物", veg: "野菜", fish: "魚", meat: "肉" };

// ── 2つの入力を state に ──
const query = state(""); // 検索語
const cat = state("all"); // 選択中の分類

// ── 絞り込みは computed（依存の query/cat が変わると自動再計算） ──
const filtered = computed(() => {
  const q = query.value.trim().toLowerCase();
  return items.filter(
    (it) =>
      (cat.value === "all" || it.cat === cat.value) &&
      (q === "" || it.name.toLowerCase().includes(q))
  );
});

// ── ヒット箇所を <mark> で強調（HTMLは自前で組む） ──
const escape = (s) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const highlight = (name, q) => {
  if (!q) return escape(name);
  const i = name.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return escape(name);
  return escape(name.slice(0, i)) + "<mark>" + escape(name.slice(i, i + q.length)) + "</mark>" + escape(name.slice(i + q.length));
};

// ── 描画：computed が変わるたびに一覧を組み直す ──
function render(list) {
  const q = query.value.trim();
  if (!list.length) {
    $$("#list").html(`<li class="empty">「${escape(q)}」に一致する食材はありません</li>`);
  } else {
    $$("#list").html(
      list
        .map(
          (it) =>
            `<li><span class="cat ${it.cat}">${catLabel[it.cat]}</span>` +
            `<span>${highlight(it.name, q)}</span>` +
            `<span class="price">¥${it.price}</span></li>`
        )
        .join("")
    );
  }
  $$("#hit").text(list.length);
  $$("#qlabel").text(q ? `（"${q}"）` : "");
  $$("#clear").css("display", q ? "block" : "none");
}
filtered.subscribe(render); // 初回も即時発火 → 初期一覧が出る

// ── 入力（命令的に受ける） ──
$$("#q").on("input", function () {
  query.value = this.value;
});
$$("#clear").on("click", () => {
  query.value = "";
  $$("#q").val("").el.focus();
});

// ── 分類チップ（イベント委譲 + addClass/removeClass はjQuery定番） ──
$$("#chips").on("click", ".chip", function () {
  $$("#chips .chip").removeClass("active");
  $$(this).addClass("active");
  cat.value = this.dataset.cat;
});
