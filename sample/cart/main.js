// main.js — ショッピングカート（純粋 $$ + state/computed）。
// 「操作は jQueryの書き味（委譲・this・チェーン）／金額は computed で宣言的に」。
// カート本体は state。配列は“新しい参照を代入”して更新するのがポイント。

import { $$, state, computed, useEngine } from "../../src/index.js";
import { svelteEngine } from "../../src/engines/svelte.js";

useEngine(svelteEngine);

const yen = (n) => "¥" + n.toLocaleString();

// ── カートの状態（各行 { id, name, price, qty }） ──
const cart = state([
  { id: 1, name: "ドリップコーヒー", price: 680, qty: 1 },
  { id: 2, name: "チーズケーキ", price: 520, qty: 2 },
  { id: 3, name: "クロワッサン", price: 320, qty: 1 },
]);

// 適用中のクーポン（割引率）
const coupon = state(null); // { code, rate }

// クーポン定義
const COUPONS = { SAVE10: 0.1, SAVE20: 0.2 };
const FREE_SHIP = 3000; // これ以上で送料無料
const SHIP_FEE = 500;

// ── 金額は全部 computed（cart / coupon が変われば自動で追従） ──
const subtotal = computed(() => cart.value.reduce((s, it) => s + it.price * it.qty, 0));
const discount = computed(() => Math.floor(subtotal.value * (coupon.value ? coupon.value.rate : 0)));
const shipping = computed(() => (subtotal.value === 0 || subtotal.value - discount.value >= FREE_SHIP ? 0 : SHIP_FEE));
const total = computed(() => Math.max(0, subtotal.value - discount.value) + shipping.value);

// ── カート一覧の描画（cart が変わるたび） ──
cart.subscribe((list) => {
  if (!list.length) {
    $$("#cart").html(`<li class="empty">カートは空です</li>`);
    return;
  }
  $$("#cart").html(
    list
      .map(
        (it) => `
      <li class="item" data-id="${it.id}">
        <span class="thumb">${it.name.slice(0, 1)}</span>
        <div class="mid">
          <div class="name">${it.name}</div>
          <div class="unit">${yen(it.price)} / 個</div>
        </div>
        <span class="stepper">
          <button class="minus" aria-label="減らす">−</button>
          <span class="qty">${it.qty}</span>
          <button class="plus" aria-label="増やす">＋</button>
        </span>
        <span class="sub">${yen(it.price * it.qty)}</span>
        <button class="del" aria-label="削除">✕</button>
      </li>`
      )
      .join("")
  );
});

// ── 数量の増減・削除（イベント委譲：再描画されても効く。this=クリック要素） ──
const idOf = (el) => Number($$(el).closest(".item").data("id"));
const patch = (id, fn) =>
  (cart.value = cart.value
    .map((it) => (it.id === id ? fn(it) : it))
    .filter((it) => it.qty > 0)); // 0以下になった行は消える

$$("#cart")
  .on("click", ".plus", function () {
    patch(idOf(this), (it) => ({ ...it, qty: it.qty + 1 }));
  })
  .on("click", ".minus", function () {
    patch(idOf(this), (it) => ({ ...it, qty: it.qty - 1 }));
  })
  .on("click", ".del", function () {
    const id = idOf(this);
    // jQueryらしく、消える行をふわっとフェードしてから状態を更新
    $$(this).closest(".item").fadeOut(150);
    setTimeout(() => (cart.value = cart.value.filter((it) => it.id !== id)), 160);
  });

// ── クーポン適用（Enterでも適用できるよう submit風に） ──
function applyCoupon() {
  const code = $$("#coupon").val().trim().toUpperCase();
  const $msg = $$("#coupon-msg");
  if (!code) return;
  if (COUPONS[code]) {
    coupon.value = { code, rate: COUPONS[code] };
    $msg.removeClass("ng").addClass("ok").text(`「${code}」を適用しました（${COUPONS[code] * 100}%OFF）`);
  } else {
    coupon.value = null;
    $msg.removeClass("ok").addClass("ng").text("無効なクーポンコードです");
  }
}
$$("#apply").on("click", applyCoupon);
$$("#coupon").on("keydown", function (e) {
  if (e.key === "Enter") applyCoupon();
});

// ── サマリー行を各 computed に束縛（bindText で自動追従） ──
$$("#subtotal").bindText(subtotal, yen);
$$("#shipping").bindText(shipping, (v) => (v === 0 ? "無料" : yen(v)));
$$("#total").bindText(total, yen);
$$("#discount").bindText(discount, (v) => "-" + yen(v));

// 割引行の表示/非表示・送料無料の案内は subscribe で細かく制御
discount.subscribe((v) => {
  $$("#discount-line").css("display", v > 0 ? "flex" : "none");
  $$("#discount-label").text(coupon.value ? `割引（${coupon.value.code}）` : "割引");
});
computed(() => Math.max(0, FREE_SHIP - (subtotal.value - discount.value))).subscribe((remain) => {
  $$("#free-note").text(remain > 0 && subtotal.value > 0 ? `あと ${yen(remain)} で送料無料` : "");
});
