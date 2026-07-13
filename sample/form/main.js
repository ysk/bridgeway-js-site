// main.js — 実務のフォームバリデーション。
// jQueryの書き味($$ の .on/.val/.toggleClass/.text/.prop)で検証し、
// 「全項目OKなら送信有効」は state/computed で宣言的に。命令的×宣言的の実例。

import { $$, state, computed, useEngine } from "../../src/index.js";
import { svelteEngine } from "../../src/engines/svelte.js";

useEngine(svelteEngine);

// 各フィールドの検証ルール（空文字を返せばOK）
const rules = {
  name: (v) => (v.trim() ? "" : "お名前を入力してください"),
  email: (v) =>
    /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) ? "" : "メールアドレスの形式が正しくありません",
  password: (v) => (v.length >= 8 ? "" : "パスワードは8文字以上にしてください"),
};

// フォームの状態（宣言的な有効判定に使う）
const form = state({ name: "", email: "", password: "", agree: false });
const setField = (k, v) => form.update((f) => ({ ...f, [k]: v }));

// エラー表示（命令的：jQueryそのまま）
function showError(field, msg) {
  const $f = $$("#" + field);
  $$("#err-" + field).text(msg);
  $f.toggleClass("invalid", !!msg).toggleClass("valid", !msg && $f.val() !== "");
}

// 入力のたびに state 更新、blur で検証メッセージ表示
["name", "email", "password"].forEach((field) => {
  $$("#" + field)
    .on("input", function () {
      setField(field, this.value);
      if ($$("#" + field).hasClass("invalid")) showError(field, rules[field](this.value));
    })
    .on("blur", function () {
      showError(field, rules[field](this.value));
    });
});

// 同意チェック
$$("#agree").on("change", function () {
  setField("agree", this.checked);
  $$("#err-agree").text(this.checked ? "" : "同意が必要です");
});

// パスワード強度メーター
$$("#password").on("input", function () {
  const v = this.value;
  const level = [/.{8,}/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((re) => re.test(v)).length;
  const labels = ["—", "弱い", "まあまあ", "強い", "とても強い"];
  $$("#meter").attr("data-level", v ? level : 0);
  $$("#strength").text(labels[v ? level : 0]);
});

// メッセージ文字数カウンタ
$$("#message").on("input", function () {
  $$("#counter").text(this.value.length);
});

// 「全項目OK」を computed で宣言的に判定 → 送信ボタンの有効/無効に束縛
const valid = computed(() => {
  const f = form.value;
  return !rules.name(f.name) && !rules.email(f.email) && !rules.password(f.password) && f.agree;
});
valid.subscribe((ok) => $$("#submit").prop("disabled", !ok));

// 送信（最終検証 → $$.post で送信）
$$("#form").on("submit", async function (e) {
  e.preventDefault();
  let ok = true;
  ["name", "email", "password"].forEach((field) => {
    const msg = rules[field]($$("#" + field).val());
    showError(field, msg);
    if (msg) ok = false;
  });
  if (!$$("#agree").prop("checked")) {
    $$("#err-agree").text("同意が必要です");
    ok = false;
  }
  if (!ok) return;

  // 送信中はボタンを無効化（jQueryの手癖）
  $$("#submit").prop("disabled", true).text("送信中…");
  try {
    // $$.post: data(オブジェクト)は自動でJSON送信。応答はJSONなら自動パース。
    // デモ用の無料エコーAPI(jsonplaceholder)へ。実務では自社エンドポイントに。
    const res = await $$.post("https://jsonplaceholder.typicode.com/posts", {
      name: form.value.name,
      email: form.value.email,
      message: $$("#message").val(),
    });
    $$("#result")
      .removeClass("err")
      .text(`送信しました。受付番号 #${res.id}。ありがとうございます。`)
      .show();
    $$("#submit").text("送信済み");
  } catch (err) {
    // 失敗時は再送できるように戻す
    $$("#result").addClass("err").text("送信に失敗しました: " + err.message).show();
    $$("#submit").prop("disabled", false).text("再送する");
  }
});
