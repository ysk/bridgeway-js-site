// site.js — このサイト自身を bridge.js(Svelte版) で動かすSPAルーター。
// ＝ ドッグフーディング。ルーティング/描画/テーマ/コピー/目次追従を $$ / state / $$.get で。
//
// bridge.js(グローバル/Svelteエンジン)が先に読み込まれ、window に $$ / state / $$ が載っている前提。

(function () {
  const root = document.documentElement;
  const VIEWS = { "": "home", home: "home", docs: "docs", examples: "examples" };

  // 現在ハッシュ → ルート名(#/docs → "docs")。#/ 以外(#anchor)は null=ページ内アンカー。
  const parse = () => {
    const h = location.hash;
    return h.startsWith("#/") ? h.slice(2) || "home" : null;
  };

  // ★ルートは state。値が変わると subscribe が描画する = bridge が SPA を駆動している。
  const route = state(parse() || "home");

  let tocObserver = null;
  let pendingScroll = null; // home描画後にスクロールしたい要素id

  const scrollToId = (id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth" });
  };

  async function render(name) {
    const view = VIEWS[name] || "home";
    try {
      const html = await $$.get(`views/${view}.html`, { type: "text" });
      $$("#app").html(html);
    } catch (e) {
      $$("#app").html(`<div class="wrap" style="padding:60px 0">ページを読み込めませんでした。</div>`);
      return;
    }
    // ナビの active
    $$("nav .links a[data-route]").removeClass("active");
    $$(`nav .links a[data-route="${view}"]`).addClass("active");
    // 描画後フック
    if (tocObserver) { tocObserver.disconnect(); tocObserver = null; }
    if (view === "docs") initTOC();
    // home描画後に指定セクションへスクロール。無ければ先頭へ。
    if (pendingScroll) {
      const id = pendingScroll;
      pendingScroll = null;
      scrollToId(id);
    } else {
      window.scrollTo(0, 0);
    }
  }

  // 値が変わるたび描画(初回も即時発火 → 初期ビュー)
  route.subscribe(render);

  // ハッシュ変化 → ルートなら state 更新、ページ内アンカーは素通り(ブラウザがスクロール)
  window.addEventListener("hashchange", () => {
    const r = parse();
    if (r !== null) route.value = r;
  });

  // ヘッダーの home セクションリンク(Why/Concept/Install)。
  // 別ビューにいたら home へ遷移してからスクロールする。
  $$("nav .links a[data-scroll]").on("click", function (e) {
    e.preventDefault();
    const id = this.dataset.scroll;
    if (route.value === "home") {
      scrollToId(id);
    } else {
      pendingScroll = id;
      route.value = "home"; // 再描画後に render() がスクロール
    }
  });

  // --- テーマ(localStorageで維持。永続navなので一度だけ) ---
  const saved = localStorage.getItem("bridge-theme");
  if (saved) root.setAttribute("data-theme", saved);
  $$("#themeBtn").on("click", () => {
    const cur = root.getAttribute("data-theme")
      || (matchMedia("(prefers-color-scheme:dark)").matches ? "dark" : "light");
    const next = cur === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    localStorage.setItem("bridge-theme", next);
  });

  // --- コピー(イベント委譲。再描画されても効く) ---
  $$(document).on("click", ".copy", async function () {
    try {
      await navigator.clipboard.writeText(this.dataset.copy);
      const t = this.textContent;
      this.textContent = "✓ copied";
      setTimeout(() => (this.textContent = t), 1200);
    } catch (e) {}
  });

  // --- Docs の目次スクロール追従 ---
  function initTOC() {
    const toc = document.querySelector(".toc");
    if (!toc) return;
    const links = [...toc.querySelectorAll("a[href^='#']")];
    const map = new Map();
    links.forEach((a) => {
      const el = document.getElementById(a.getAttribute("href").slice(1));
      if (el) map.set(el, a);
    });
    tocObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            links.forEach((l) => l.classList.remove("active"));
            const a = map.get(e.target);
            if (a) a.classList.add("active");
          }
        });
      },
      { rootMargin: "-72px 0px -70% 0px", threshold: 0 }
    );
    map.forEach((_, el) => tocObserver.observe(el));
  }
})();
