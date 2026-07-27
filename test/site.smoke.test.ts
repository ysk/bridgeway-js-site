// サイト自身が bridgey v2 で動くかを確かめる。
//
// サイトは bridgey のドッグフーディングなので、ここが壊れていると
// 「作った本人も使えていない」ことになる。index.html と dist をそのまま読み込んで動かす。

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { JSDOM, VirtualConsole } from "jsdom";

const root = new URL("../", import.meta.url);
const ready =
  existsSync(new URL("dist/bridgey.js", root)) && existsSync(new URL("dist/site.js", root));

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Win = Window & typeof globalThis & Record<string, any>;

function openSite(hash = ""): { window: Win; document: Document; messages: string[] } {
  // <script src> は jsdom が取りに行かないので、いったん外して後から注入する
  // （fetch を差し替えてからスクリプトを走らせたいため）
  const html = readFileSync(new URL("index.html", root), "utf8")
    .replace(/<script src="\.\/dist\/bridgey\.js"><\/script>/, "")
    .replace(/<script src="\.\/dist\/views\.js"><\/script>/, "")
    .replace(/<script src="\.\/dist\/samples\.js"><\/script>/, "")
    .replace(/<script src="\.\/dist\/site\.js"><\/script>/, "");

  const messages: string[] = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("warn", (m: string) => messages.push(String(m)));
  virtualConsole.on("error", (m: string) => messages.push(`ERROR ${String(m)}`));
  virtualConsole.on("jsdomError", (e: Error) => messages.push(`JSDOM ${e.message}`));

  const dom = new JSDOM(html, {
    runScripts: "dangerously",
    pretendToBeVisual: true,
    url: `https://bridgey.test/${hash}`,
    virtualConsole,
  });
  const window = dom.window as unknown as Win;

  // jsdom が実装していないスクロール系を無害化する（サイトの問題ではない）
  window.scrollTo = () => {};
  window.Element.prototype.scrollIntoView = function () {};

  // <link rel=stylesheet> も jsdom は取りに行かない。
  // bridgey は「読み込み済みの CSS に無い class 名」を警告するので、
  // CSS が無いままだと本番と違う判断になる。実際の順序どおり最初に入れる。
  const style = window.document.createElement("style");
  style.textContent = readFileSync(new URL("dist/styles.css", root), "utf8");
  window.document.head.appendChild(style);

  // views/*.html をディスクから返す fetch を用意する
  window.fetch = async (url: string) => {
    const path = String(url).replace(/^\.\//, "");
    try {
      const body = readFileSync(new URL(path, root), "utf8");
      return { ok: true, status: 200, text: async () => body };
    } catch {
      return { ok: false, status: 404, text: async () => "" };
    }
  };

  // 本体 → サイトの順に注入（実際の読み込み順と同じ）
  for (const file of ["dist/bridgey.js", "dist/views.js", "dist/samples.js", "dist/site.js"]) {
    const script = window.document.createElement("script");
    script.textContent = readFileSync(new URL(file, root), "utf8");
    window.document.body.appendChild(script);
  }

  return { window, document: window.document, messages };
}

// 単体でコピペされるサンプルから <script src> が抜けていると、貼った人は
// 「$$ is not defined」だけを見て諦める。ページの外の文章で補うのは不親切。
//
// tutorial.html は例外。1章で読み込ませてから章を積んでいく作りなので、
// 2章以降に毎回 CDN 行を書くとノイズになる。
test("サイト: コピペできるサンプルには <script src> が入っている", () => {
  for (const view of ["home.html", "docs.html"]) {
    const html = readFileSync(new URL(`views/${view}`, root), "utf8");
    const blocks = html.match(/<pre><code>[\s\S]*?<\/code><\/pre>/g) ?? [];

    for (const block of blocks) {
      // JS だけの断片ではなく「HTML ごと」見せているサンプルだけが対象
      if (!block.includes("&lt;script&gt;")) continue;
      assert.ok(
        block.includes("&lt;script src="),
        `${view}: 読み込み行の無い HTML サンプルがある\n${block.slice(0, 200)}`
      );
    }
  }
});

// 「最初のテンプレート」は、保存してそのまま開ける1ファイルでなければならない。
// 断片だと、初心者は貼る場所が分からないところで止まる。
test("サイト: 最初のテンプレートは丸ごと1ファイルになっている", () => {
  const targets = [
    { view: "docs.html", heading: 'id="hello"' },
    { view: "tutorial.html", heading: 'id="setup"' },
  ];

  for (const { view, heading } of targets) {
    const html = readFileSync(new URL(`views/${view}`, root), "utf8");
    const after = html.slice(html.indexOf(heading));
    const block = after.match(/<pre><code>[\s\S]*?<\/code><\/pre>/)?.[0] ?? "";

    for (const needed of ["&lt;!doctype html&gt;", "&lt;meta charset=", "&lt;/html&gt;", "&lt;script src="]) {
      assert.ok(block.includes(needed), `${view}: 最初のテンプレートに ${needed} が無い`);
    }
  }
});

test("サイト: bridgey が読み込まれ、スクリプトエラーが出ない", { skip: !ready }, async () => {
  const { window, messages } = openSite();
  await wait(50);

  assert.equal(typeof window.$$, "function", "window.$$ が居る");
  assert.match(String(window.$$.version), /^2\./, `version が 2 系 (${window.$$.version})`);
  assert.deepEqual(
    messages.filter((m) => m.startsWith("ERROR") || m.startsWith("JSDOM")),
    [],
    "例外が出ていない"
  );
});

test("サイト: home ビューが描画される（$$.resource で取得）", { skip: !ready }, async () => {
  const { document } = openSite();
  await wait(50);

  const app = document.querySelector("#app")!;
  assert.match(app.textContent ?? "", /jQuery のまま/, "ヒーローが出ている");
  assert.ok(app.querySelector("#why"), "セクションが入っている");
  assert.equal(
    document.querySelector('nav .links a[data-route="home"]')?.classList.contains("active"),
    true,
    "ナビが active になる"
  );
});

test("★サイト: SPA で差し込んだ HTML の component が自動で動く", { skip: !ready }, async () => {
  const { window, document } = openSite();
  await wait(50);

  // home.html は fetch 後に innerHTML で差し込まれる。
  // それでも data-component="home-demo" が自動でマウントされる（MutationObserver）。
  const qty = () => document.querySelector('[data-brg="qty"]')?.textContent;
  const total = () => document.querySelector('[data-brg="total"]')?.textContent;

  assert.equal(qty(), "1", "差し込まれた HTML の中で state が動いている");
  assert.equal(total(), (1100).toLocaleString());

  document
    .querySelector<HTMLElement>('[data-brg="inc"]')!
    .dispatchEvent(new window.Event("click", { bubbles: true }));
  await window.$$.tick();

  assert.equal(qty(), "2");
  assert.equal(total(), (2200).toLocaleString(), "合計は導出されている");

  // 3個以上で送料無料が出る
  document
    .querySelector<HTMLElement>('[data-brg="inc"]')!
    .dispatchEvent(new window.Event("click", { bubbles: true }));
  await window.$$.tick();
  assert.equal(document.querySelector<HTMLElement>('[data-brg="free"]')!.style.display, "");
});

test("サイト: コード欄に実際に動いている関数が出ている", { skip: !ready }, async () => {
  const { document } = openSite();
  await wait(50);

  const panel = document.querySelector('[data-brg="home-demo-source"]')!;
  const source = panel.textContent ?? "";

  // HTML と bridgey のタブになっている（言語名ではなく書き方の名前を出す）
  const labels = [...panel.querySelectorAll("[data-tab]")].map((b) => b.textContent);
  assert.deepEqual(labels, ["HTML", "jQuery", "bridgey"], "タブ名は言語名ではない");
  assert.match(source, /\$\$\.state\(1\)/, "JS が実装から取れている");
  assert.match(source, /data-brg="qty"/, "HTML も一緒に見せている");
  assert.equal(/function homeDemo/.test(source), false, "関数の外枠は外して中身だけ");
  assert.equal(/3e4|\(i\) =>/.test(source), false, "バンドル後のコードを見せていない");
});

test("サイト: コードブロックに行番号が付く（コピーには入らない）", { skip: !ready }, async () => {
  const { document } = openSite("#/docs");
  await wait(80);

  const pre = document.querySelector<HTMLElement>("#app pre.has-lines")!;
  const code = pre.querySelector("code")!;
  const lines = code.querySelectorAll(":scope > .line");

  assert.ok(lines.length > 1, "1行ずつ包まれている");
  // 番号は CSS の counter（::before）なので、テキストにもコピー文字列にも出ない
  assert.equal(/^\s*1\s/.test(code.textContent ?? ""), false, "番号が本文に混ざっていない");
  assert.equal(
    pre.querySelector<HTMLElement>(".copy-code")?.dataset.copy?.includes("\n"),
    true,
    "コピーする文字列には改行が残っている"
  );

  // 複数行にまたがるトークンがあっても色が壊れない（行ごとに包み直している）
  const multi = [...document.querySelectorAll("#app pre.has-lines code")].find((c) =>
    c.querySelector(".line .tok-c, .line .tok-s")
  );
  assert.ok(multi, "行の中に色付きトークンが残っている");
});

test("サイト: ルート切り替えでビューが差し替わる", { skip: !ready }, async () => {
  const { window, document } = openSite();
  await wait(50);
  assert.match(document.querySelector("#app")!.textContent ?? "", /jQuery のまま/);

  window.location.hash = "#/docs";
  window.dispatchEvent(new window.Event("hashchange"));
  await wait(50);

  assert.equal(
    document.querySelector('nav .links a[data-route="docs"]')?.classList.contains("active"),
    true,
    "docs が active になる"
  );
});

test("サイト: テーマ切替が state で動く", { skip: !ready }, async () => {
  const { window, document } = openSite();
  await wait(50);
  const root = document.documentElement;
  assert.equal(root.getAttribute("data-theme"), "light");

  document
    .querySelector<HTMLElement>("#themeBtn")!
    .dispatchEvent(new window.Event("click", { bubbles: true }));
  await window.$$.tick();

  assert.equal(root.getAttribute("data-theme"), "dark");
  assert.equal(window.localStorage.getItem("bridgey-theme"), "dark", "保存もされる");
});

test("サイト: ハンバーガーメニューが state で開閉する", { skip: !ready }, async () => {
  const { window, document } = openSite();
  await wait(50);
  const links = document.querySelector("#navLinks")!;
  const toggle = document.querySelector<HTMLElement>("#navToggle")!;

  assert.equal(links.classList.contains("open"), false);
  toggle.dispatchEvent(new window.Event("click", { bubbles: true }));
  await window.$$.tick();

  assert.equal(links.classList.contains("open"), true);
  assert.equal(toggle.getAttribute("aria-expanded"), "true", "aria も一緒に付く");
});

test("examples: カウンターは1つの状態から全部導出される", { skip: !ready }, async () => {
  const { window, document } = openSite("#/examples");
  await wait(80);
  const $$ = window.$$;
  const t = (name: string) => document.querySelector(`[data-brg="${name}"]`)?.textContent ?? "";
  const click = (name: string) =>
    document
      .querySelector<HTMLElement>(`[data-brg="${name}"]`)!
      .dispatchEvent(new window.Event("click", { bubbles: true }));

  assert.equal(t("cnt-n"), "1");
  assert.equal(t("cnt-doubled"), "2");
  assert.equal(t("cnt-total"), (1100).toLocaleString());
  assert.equal(
    (document.querySelector('[data-brg="cnt-dec"]') as HTMLButtonElement).disabled,
    true,
    "下限では減らせない"
  );

  for (let i = 0; i < 9; i++) click("cnt-inc");
  await $$.tick();
  assert.equal(t("cnt-n"), "10");
  assert.equal(t("cnt-doubled"), "20");
  assert.equal(t("cnt-total"), (11000).toLocaleString());
  assert.equal(
    (document.querySelector('[data-brg="cnt-over"]') as HTMLElement).style.display,
    "",
    "10個以上の表示が出る"
  );

  click("cnt-reset");
  await $$.tick();
  assert.equal(t("cnt-n"), "1");
});

test("examples: フォーム — 非表示の必須項目でブロックせず、条件付き必須は効く", { skip: !ready }, async () => {
  const { window, document } = openSite("#/examples");
  await wait(80);
  const $$ = window.$$;
  const summary = () => document.querySelector('[data-brg="err-summary"]')?.textContent ?? "";

  document.querySelector<HTMLInputElement>("#ex-mail")!.value = "a@example.com";
  document.querySelector<HTMLInputElement>("#ex-tel")!.value = "09012345678";
  const agree = document.querySelector<HTMLInputElement>('[data-brg="agree"]')!;
  agree.checked = true;
  agree.dispatchEvent(new window.Event("change", { bubbles: true }));
  await wait(40);

  assert.equal(summary(), "", "隠れている必須項目（promo）でブロックしない");

  // 法人に切り替えると会社名が必須になる
  const corp = document.querySelectorAll<HTMLInputElement>('[data-brg="plan"]')[1]!;
  corp.checked = true;
  corp.dispatchEvent(new window.Event("change", { bubbles: true }));
  await wait(60);
  assert.match(summary(), /1件/, "法人なら会社名が必須になる");

  document.querySelector<HTMLInputElement>("#ex-company")!.value = "株式会社テスト";
  await wait(40);
  assert.equal(summary(), "", "埋めれば消える（イベントを飛ばさなくても追従する）");
});

test("examples: フォーム — 送信中の連打は無視される", { skip: !ready }, async () => {
  const { window, document } = openSite("#/examples");
  await wait(80);
  const $$ = window.$$;

  document.querySelector<HTMLInputElement>("#ex-mail")!.value = "a@example.com";
  document.querySelector<HTMLInputElement>("#ex-tel")!.value = "09012345678";
  const agree = document.querySelector<HTMLInputElement>('[data-brg="agree"]')!;
  agree.checked = true;
  agree.dispatchEvent(new window.Event("change", { bubbles: true }));
  await wait(40);

  const form = document.querySelector<HTMLFormElement>('[data-brg="form"]')!;
  const submit = () =>
    form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));

  submit();
  await $$.tick();
  assert.equal(
    (document.querySelector('[data-brg="submit"]') as HTMLButtonElement).disabled,
    true,
    "送信中はボタンが無効"
  );

  submit();
  submit();
  submit();
  await wait(60);
  // 送信中に押した分は無視され、まだ1回目が続いている
  assert.equal(
    (document.querySelector('[data-brg="submit"]') as HTMLButtonElement).disabled,
    true
  );

  await wait(950);
  assert.equal(
    (document.querySelector('[data-brg="submit"]') as HTMLButtonElement).disabled,
    false,
    "終わったら押せるように戻る"
  );
});

// 過去に `$$.component` を `$.component` と書き間違えて、
// このコンポーネントだけ丸ごと登録されていなかったことがある（例外は出るが機能テストが無かった）。
// 「登録されていること」ではなく「切り替わること」を見る。
test("examples: コード比較タブ（bridgey / jQuery）が切り替わる", { skip: !ready }, async () => {
  const { window, document } = openSite("#/examples");
  await wait(80);

  const tab = (name: string) =>
    document.querySelector<HTMLElement>(`[data-brg="code-tab"][data-tab="${name}"]`)!;
  const pane = (name: string) =>
    document.querySelector<HTMLElement>(`[data-brg="code-pane"][data-tab="${name}"]`)!;

  assert.equal(pane("bridgey").style.display, "", "最初は bridgey 側が出ている");
  assert.equal(pane("jquery").style.display, "none");
  assert.equal(tab("bridgey").hasAttribute("data-selected"), true, "タブにも印が付く");

  tab("jquery").dispatchEvent(new window.Event("click", { bubbles: true }));
  await window.$$.tick();

  assert.equal(pane("jquery").style.display, "", "jQuery 側に切り替わる");
  assert.equal(pane("bridgey").style.display, "none");
  assert.equal(tab("jquery").hasAttribute("data-selected"), true);
  assert.equal(tab("bridgey").hasAttribute("data-selected"), false);
});

// タブの中にタブを作らない（読む人に2回選ばせない）。
// 書き比べたい例は HTML / jQuery / bridgey の1列にまとめる。
test("examples: 書き比べは1列のタブ（HTML / jQuery / bridgey）", { skip: !ready }, async () => {
  const { window, document } = openSite("#/examples");
  await wait(80);

  for (const target of ["counter-source", "ex-source", "cart-source", "todo-source"]) {
    const panel = document.querySelector<HTMLElement>(`[data-brg="${target}"]`)!;
    const labels = [...panel.querySelectorAll("[data-tab]")].map((b) => b.textContent);

    assert.deepEqual(labels, ["HTML", "jQuery", "bridgey"], `${target} のタブ`);
  }

  // 比較タブの中にサンプル欄が入っている（＝入れ子タブ）状態を作らない
  assert.equal(
    document.querySelectorAll('[data-brg="code-pane"] [data-brg$="-source"]').length,
    0,
    "タブの中にタブが無い"
  );

  // jQuery 側に切り替えると、手書きの jQuery コードが出る
  const cart = document.querySelector<HTMLElement>('[data-brg="cart-source"]')!;
  cart
    .querySelector<HTMLElement>('[data-tab="jquery"]')!
    .dispatchEvent(new window.Event("click", { bubbles: true }));
  await window.$$.tick();

  const shown = [...cart.querySelectorAll<HTMLElement>("[data-pane]")].filter(
    (pane) => pane.style.display !== "none"
  );
  assert.equal(shown.length, 1, "出ているのは1枚だけ");
  assert.equal(shown[0]!.dataset.pane, "jquery");
  assert.match(shown[0]!.textContent ?? "", /calcTotal/, "jQuery 版の中身が出ている");
});

test("★examples: 1段ラップすると、隣を掴む方だけが黙って壊れる", { skip: !ready }, async () => {
  const { window, document } = openSite("#/examples");
  await wait(80);
  const click = (name: string) =>
    document
      .querySelector<HTMLElement>(`[data-brg="${name}"]`)!
      .dispatchEvent(new window.Event("click", { bubbles: true }));
  const oldBody = () => document.querySelector<HTMLElement>('[data-brg="old-body"]')!;
  const newBody = () => document.querySelector<HTMLElement>('[data-brg="new-body"]')!;

  // ラップ前はどちらも開閉できる
  click("old-head");
  await window.$$.tick();
  assert.equal(oldBody().style.display, "", "従来のやり方でも今は開く");

  click("new-head");
  await window.$$.tick();
  assert.equal(newBody().style.display, "none", "bridgey 側は閉じた");

  // HTML を1段ラップする（デザイナーが div を1枚足したのと同じ）
  click("wrap");
  await window.$$.tick();
  assert.equal(oldBody().parentElement?.dataset.wrapper, "1", "ラップされた");

  // 従来のやり方: 隣が別の要素になったので届かない。例外は出ない
  click("old-head");
  await window.$$.tick();
  assert.match(
    document.querySelector('[data-brg="old-log"]')!.textContent ?? "",
    /開きません/,
    "隣を掴む方は動かなくなる"
  );

  // bridgey: 名前で引いているので、構造が変わっても届く
  click("new-head");
  await window.$$.tick();
  assert.equal(newBody().style.display, "", "ラップ後も開ける");
});

test("★examples: 初期化に失敗した部品があっても、他の部品は動く", { skip: !ready }, async () => {
  const { window, document, messages } = openSite("#/examples");
  await wait(80);

  // ex-broken は存在しない要素を触って必ず落ちる
  assert.ok(
    messages.some((m) => m.includes("ex-broken")),
    `壊れた部品が報告される: ${messages.join(" / ").slice(0, 200)}`
  );

  // 同じカードの中のタブとカウンターは巻き添えにならない
  const pane = (tab: string) =>
    document.querySelector<HTMLElement>(`[data-brg="pane"][data-tab="${tab}"]`)!;
  assert.equal(pane("a").style.display, "", "タブは動いている");
  assert.equal(pane("b").style.display, "none");

  document
    .querySelectorAll<HTMLElement>('[data-brg="tab"]')[1]!
    .dispatchEvent(new window.Event("click", { bubbles: true }));
  await window.$$.tick();
  assert.equal(pane("b").style.display, "", "切り替えも効く");

  const n = () => document.querySelector('[data-brg="mini-n"]')?.textContent;
  assert.equal(n(), "5", "カウンターも生きている");
  document
    .querySelector<HTMLElement>('[data-brg="mini-inc"]')!
    .dispatchEvent(new window.Event("click", { bubbles: true }));
  await window.$$.tick();
  assert.equal(n(), "6");
});

test("examples: CSS に無い class 名を、似ている名前を添えて知らせる", { skip: !ready }, async () => {
  const { window, document } = openSite("#/examples");
  await wait(80);

  document
    .querySelector<HTMLElement>('[data-brg="run"]')!
    .dispatchEvent(new window.Event("click", { bubbles: true }));
  await window.$$.tick();

  const log = document.querySelector('[data-brg="typo-log"]')?.textContent ?? "";
  assert.match(log, /ex-actve/, "間違えたクラス名が出る");
  assert.match(log, /ex-active/, "似ている名前を提示する");
});

test("★examples: カートの金額が全部導出される", { skip: !ready }, async () => {
  const { window, document } = openSite("#/examples");
  await wait(80);
  const $$ = window.$$;
  const t = (name: string) => document.querySelector(`[data-brg="${name}"]`)?.textContent ?? "";
  const clickAt = (name: string, index: number) =>
    document
      .querySelectorAll<HTMLElement>(`[data-brg="${name}"]`)[index]!
      .dispatchEvent(new window.Event("click", { bubbles: true }));

  // 23800 + 3300 + 1650*2 = 30400 → 送料無料 / 税 3040 / 合計 33440
  assert.equal(t("subtotal"), `${(30400).toLocaleString()}円`);
  assert.equal(t("ship"), "無料");
  assert.equal(t("total"), (33440).toLocaleString());

  // 3行目を削除 → 送料が復活する（送料も導出）
  clickAt("del", 2);
  await wait(40);
  assert.equal(t("subtotal"), `${(27100).toLocaleString()}円`);
  assert.equal(t("ship"), `${(550).toLocaleString()}円`);

  // クーポン（10% OFF）
  const coupon = document.querySelector<HTMLInputElement>('[data-brg="coupon"]')!;
  coupon.checked = true;
  coupon.dispatchEvent(new window.Event("change", { bubbles: true }));
  await $$.tick();
  assert.equal(t("discount"), `-${(2710).toLocaleString()}円`);

  // 数量を増やすと無料ラインを超える
  clickAt("inc", 0);
  await wait(40);
  assert.equal(t("subtotal"), `${(50900).toLocaleString()}円`);
  assert.equal(t("ship"), "無料");

  // 全部消すと空表示に切り替わる
  clickAt("del", 0);
  await wait(40);
  clickAt("del", 0);
  await wait(40);
  assert.equal(document.querySelectorAll('[data-brg="row"]').length, 0);
  assert.equal((document.querySelector('[data-brg="empty"]') as HTMLElement).style.display, "");
});

test("★examples: ToDo — 行の DOM が使い回されるので入力が消えない", { skip: !ready }, async () => {
  const { window, document } = openSite("#/examples");
  await wait(80);
  const $$ = window.$$;
  const rows = () => document.querySelectorAll<HTMLElement>('[data-brg="item"]');

  assert.equal(rows().length, 2);
  assert.match(document.querySelector('[data-brg="counts"]')!.textContent ?? "", /1件が未完了/);

  // 1行目のメモ欄に入力しておく
  const firstRow = rows()[0]!;
  const memo = firstRow.querySelector<HTMLInputElement>('[data-brg="memo"]')!;
  memo.value = "急ぎ";

  // 追加する
  const input = document.querySelector<HTMLInputElement>('[data-brg="input"]')!;
  input.value = "電話する";
  input.dispatchEvent(new window.Event("input", { bubbles: true }));
  document
    .querySelector<HTMLElement>('[data-brg="add"]')!
    .dispatchEvent(new window.Event("click", { bubbles: true }));
  await wait(40);

  assert.equal(rows().length, 3, "行が増える");
  assert.equal(rows()[0], firstRow, "1行目は同じ DOM");
  assert.equal(memo.value, "急ぎ", "入力途中の文字が消えない");

  // 絞り込み（未完了のみ）
  const openFilter = document.querySelectorAll<HTMLInputElement>('[data-brg="filter"]')[1]!;
  openFilter.checked = true;
  openFilter.dispatchEvent(new window.Event("change", { bubbles: true }));
  await wait(40);
  assert.equal(rows().length, 2, "完了済みが消える");

  // 完了にすると絞り込みから外れ、残り件数も減る
  rows()[0]!.querySelector<HTMLInputElement>('[data-brg="check"]')!.checked = true;
  rows()[0]!
    .querySelector<HTMLInputElement>('[data-brg="check"]')!
    .dispatchEvent(new window.Event("change", { bubbles: true }));
  await wait(40);
  assert.equal(rows().length, 1);
  assert.match(document.querySelector('[data-brg="counts"]')!.textContent ?? "", /1件が未完了/);
});
