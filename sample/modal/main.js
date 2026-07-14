// main.js — モーダル / 画像ギャラリー（ライトボックス）。
// jQuery定番そのまま：一覧はループで append、開閉はイベント委譲 + fadeIn/fadeOut。
// 「今どの写真を開いているか」だけ state で持ち、前へ/次へで付け替える。

import { $$, state, useEngine } from "../../src/index.js";
import { svelteEngine } from "../../src/engines/svelte.js";

useEngine(svelteEngine);

// ── 写真データ（画像の代わりにグラデ背景。CSP: 外部読込なし） ──
const photos = [
  { title: "雪山の朝", desc: "標高2500mの稜線から", bg: "linear-gradient(135deg,#a8c0ff,#3f5efb)" },
  { title: "夏の海", desc: "南の島のビーチにて", bg: "linear-gradient(135deg,#43e97b,#38f9d7)" },
  { title: "満開の桜", desc: "川沿いの並木道", bg: "linear-gradient(135deg,#ffdde1,#ee9ca7)" },
  { title: "都市の夕暮れ", desc: "屋上バーからの眺め", bg: "linear-gradient(135deg,#f6d365,#fda085)" },
  { title: "深い森", desc: "苔むした古道", bg: "linear-gradient(135deg,#0ba360,#3cba92)" },
  { title: "満天の星空", desc: "高原の天体観測", bg: "linear-gradient(135deg,#30cfd0,#330867)" },
];

// ── ギャラリーのタイルを生成（jQueryそのまま：empty してから append） ──
const $g = $$("#gallery").empty();
photos.forEach((p, i) => {
  $g.append(
    `<div class="tile" data-i="${i}" style="background:${p.bg}">` +
      `<span class="cap">${p.title}</span></div>`
  );
});

// ── いま開いている写真の index（-1 = 閉じている） ──
const current = state(-1);

// index が変わるたびライトボックスの中身を差し替え（宣言的に反映） ──
current.subscribe((i) => {
  if (i < 0) return;
  const p = photos[i];
  $$("#lb-img").css("background", p.bg);
  $$("#lb-title").text(p.title);
  $$("#lb-desc").text(p.desc);
  $$("#lb-count").text(`${i + 1} / ${photos.length}`);
});

const open = (i) => {
  current.value = i;
  $$("#lb").fadeIn(150); // inline display を空に→CSS既定の grid で中央表示
};
const close = () => $$("#lb").fadeOut(150);
const step = (d) => (current.value = (current.value + d + photos.length) % photos.length);

// ── タイルを開く（イベント委譲：後から追加した要素にも効く） ──
$$("#gallery").on("click", ".tile", function () {
  open(Number($$(this).data("i")));
});

// ── 閉じる：×ボタン / 背景クリック（frame自身のクリックは伝播を止める） ──
$$("#lb-close").on("click", close);
$$("#lb").on("click", function (e) {
  if (e.target === this) close(); // 背景(オーバーレイ)そのものを押したときだけ
});

// ── 前へ / 次へ ──
$$("#lb-prev").on("click", () => step(-1));
$$("#lb-next").on("click", () => step(1));

// ── キーボード操作（Esc で閉じる・矢印で移動） ──
$$(document).on("keydown", function (e) {
  if (current.value < 0 || $$("#lb").css("display") === "none") return;
  if (e.key === "Escape") close();
  else if (e.key === "ArrowLeft") step(-1);
  else if (e.key === "ArrowRight") step(1);
});
