// site.js — このサイト自身を bridgey(Svelte版) で動かすSPAルーター。
// ＝ ドッグフーディング。ルーティング/描画/テーマ/コピー/目次追従を $$ / state / $$.get で。
//
// bridgey(グローバル/Svelteエンジン)が先に読み込まれ、window に $$ / state / $$ が載っている前提。

(function () {
  const root = document.documentElement;
  const VIEWS = { "": "home", home: "home", tutorial: "tutorial", docs: "docs", examples: "examples" };

  // 現在ハッシュを {route, anchor} に分解する。
  //   #/docs           → { route:"docs",     anchor:null }
  //   #/examples#todo  → { route:"examples", anchor:"todo" }  ← ルート＋ページ内アンカーの複合リンク
  //   #why             → { route:null,       anchor:null }     ← 現ビュー内アンカー(ブラウザがスクロール)
  const parseHash = () => {
    const h = location.hash;
    if (!h.startsWith("#/")) return { route: null, anchor: null };
    const rest = h.slice(2); // "examples#todo" / "docs" / ""
    const i = rest.indexOf("#");
    const route = (i >= 0 ? rest.slice(0, i) : rest) || "home";
    const anchor = i >= 0 ? rest.slice(i + 1) : null;
    return { route, anchor };
  };

  // ★ルートは state。値が変わると subscribe が描画する = bridgey が SPA を駆動している。
  const initial = parseHash();
  const route = state(initial.route || "home");

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
    // 描画後フック（サイドバー付きページは目次スクロール追従を張り直す）
    if (tocObserver) { tocObserver.disconnect(); tocObserver = null; }
    if (view === "docs" || view === "tutorial" || view === "examples") initTOC();
    // home描画後に指定セクションへスクロール。無ければ先頭へ。
    if (pendingScroll) {
      const id = pendingScroll;
      pendingScroll = null;
      scrollToId(id);
    } else {
      window.scrollTo(0, 0);
    }
  }

  // 初期表示でアンカー付き(#/tutorial#state 等)なら、描画後にそこへスクロール
  if (initial.anchor) pendingScroll = initial.anchor;

  // 値が変わるたび描画(初回も即時発火 → 初期ビュー)
  route.subscribe(render);

  // ハッシュ変化 → ルートなら state 更新。複合リンク(#/route#anchor)は
  // 描画後にアンカーへスクロール。純粋なページ内アンカーはブラウザに任せる。
  window.addEventListener("hashchange", () => {
    const { route: next, anchor } = parseHash();
    if (next === null) return; // 現ビュー内アンカー → 素通り
    if (anchor) pendingScroll = anchor;
    if (next !== route.value) {
      route.value = next; // 再描画 → render() が pendingScroll へスクロール
    } else if (anchor) {
      scrollToId(anchor); // 同じビュー内の別セクションへ
    }
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
  const saved = localStorage.getItem("bridgey-theme");
  if (saved) root.setAttribute("data-theme", saved);
  $$("#themeBtn").on("click", () => {
    const cur = root.getAttribute("data-theme")
      || (matchMedia("(prefers-color-scheme:dark)").matches ? "dark" : "light");
    const next = cur === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    localStorage.setItem("bridgey-theme", next);
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
