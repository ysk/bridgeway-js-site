/*! bridgey site — サイト自身も bridgey で動いています。MIT License */
(() => {
  // site.js
  (function() {
    const root = document.documentElement;
    const VIEWS = { "": "home", home: "home", tutorial: "tutorial", docs: "docs", examples: "examples" };
    const parseHash = () => {
      const h = location.hash;
      if (!h.startsWith("#/")) return { route: null, anchor: null };
      const rest = h.slice(2);
      const i = rest.indexOf("#");
      const route2 = (i >= 0 ? rest.slice(0, i) : rest) || "home";
      const anchor = i >= 0 ? rest.slice(i + 1) : null;
      return { route: route2, anchor };
    };
    const initial = parseHash();
    const route = $$.state(initial.route || "home");
    let tocObserver = null;
    let pendingScroll = initial.anchor;
    const scrollToId = (id) => {
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: "smooth" });
    };
    const page = $$.resource(route, async (name, signal) => {
      const view = VIEWS[name] || "home";
      const embedded = window.__BRIDGEY_VIEWS;
      if (embedded && embedded[view]) return { view, html: embedded[view] };
      const res = await fetch(`views/${view}.html`, { signal });
      if (!res.ok) throw new Error(`${res.status}`);
      return { view, html: await res.text() };
    });
    $$.effect(() => {
      if (page.error()) {
        $$("#app").html(
          `<div class="wrap" style="padding:60px 0">
           <div class="card">
             <b>ページを読み込めませんでした。</b>
             <p style="margin:8px 0 0;font-size:14px">
               ビルドしていない状態で <code>file://</code> から開くと、ブラウザの制限で読み込めません。<br>
               <code>npm run build</code> を実行するか、<code>npx serve .</code> でサーバー越しに開いてください。
             </p>
           </div>
         </div>`
        );
        return;
      }
      const current = page.data();
      if (!current) return;
      $$("#app").html(current.html);
      $$("nav .links a[data-route]").removeClass("active");
      $$(`nav .links a[data-route="${current.view}"]`).addClass("active");
      highlightAll(document.querySelector("#app"));
      addCopyButtons(document.querySelector("#app"));
      addLineNumbers(document.querySelector("#app"));
      if (tocObserver) {
        tocObserver.disconnect();
        tocObserver = null;
      }
      if (current.view !== "home") {
        try {
          initTOC();
        } catch (e) {
          console.warn("[site] 目次の追従を初期化できませんでした", e);
        }
      }
      if (pendingScroll) {
        const id = pendingScroll;
        pendingScroll = null;
        requestAnimationFrame(() => scrollToId(id));
      } else {
        window.scrollTo(0, 0);
      }
    });
    $$(window).on("hashchange", () => {
      const { route: next, anchor } = parseHash();
      if (next === null) return;
      if (anchor) pendingScroll = anchor;
      if (next !== route()) {
        route(next);
      } else if (anchor) {
        scrollToId(anchor);
      }
    });
    $$("nav .links a[data-scroll]").on("click", function(e) {
      e.preventDefault();
      const id = this.dataset.scroll;
      if (route() === "home") {
        scrollToId(id);
      } else {
        pendingScroll = id;
        route("home");
      }
    });
    const menuOpen = $$.state(false);
    $$("#navLinks").toggleClass("open", menuOpen);
    $$("#navToggle").expanded(menuOpen).click(() => menuOpen((v) => !v));
    $$("nav .links a").on("click", () => menuOpen(false));
    const theme = $$.state(localStorage.getItem("bridgey-theme") || "light");
    $$.effect(() => {
      root.setAttribute("data-theme", theme());
      localStorage.setItem("bridgey-theme", theme());
    });
    $$("#themeBtn").click(() => theme((t) => t === "dark" ? "light" : "dark"));
    $$(document).on("click", ".copy", async function() {
      try {
        await navigator.clipboard.writeText(this.dataset.copy);
        const label = this.textContent;
        this.textContent = "copied";
        setTimeout(() => this.textContent = label, 1200);
      } catch (e) {
      }
    });
    function homeDemo($el) {
      const UNIT_PRICE = 1100;
      const quantity = $$.state(1);
      const total = $$.computed(() => quantity() * UNIT_PRICE);
      $el.find("@qty").text(quantity);
      $el.find("@total").text(total, $$.money);
      $el.find("@inc").click(() => quantity((current) => current + 1));
      $el.find("@dec").click(() => quantity((current) => Math.max(1, current - 1)));
      $el.find("@free").when(() => quantity() >= 3);
      $el.find("@bar").vars({
        progress: () => `${Math.min(100, quantity() * 20)}%`
      });
    }
    $$.component("home-demo", ($el) => {
      homeDemo($el);
      showSample("home-demo-source", "homeDemo");
    });
    const TOKENS = new RegExp(
      [
        "(?<c>//[^\\n]*|/\\*[\\s\\S]*?\\*/|<!--[\\s\\S]*?-->)",
        // コメント
        "(?<s>\"(?:[^\"\\\\]|\\\\.)*\"|'(?:[^'\\\\]|\\\\.)*'|`(?:[^`\\\\]|\\\\.)*`)",
        // 文字列
        "(?<t></?[a-zA-Z][\\w-]*)",
        // HTML タグ
        "(?<k>\\b(?:const|let|var|function|return|if|else|for|of|in|await|async|new|import|export|from|class|extends|try|catch|finally|throw|typeof|true|false|null|undefined|this)\\b)",
        // キーワード
        "(?<f>\\b[A-Za-z_$][\\w$]*(?=\\s*\\())"
        // 呼び出し
      ].join("|"),
      "g"
    );
    const escapeHtml = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    function highlight(source) {
      let out = "";
      let last = 0;
      let match;
      TOKENS.lastIndex = 0;
      while (match = TOKENS.exec(source)) {
        out += escapeHtml(source.slice(last, match.index));
        const g = match.groups;
        const cls = g.c ? "tok-c" : g.s ? "tok-s" : g.t ? "tok-t" : g.k ? "tok-k" : "tok-f";
        out += `<span class="${cls}">${escapeHtml(match[0])}</span>`;
        last = match.index + match[0].length;
      }
      return out + escapeHtml(source.slice(last));
    }
    function addCopyButtons(root2) {
      (root2 || document).querySelectorAll("pre").forEach((pre) => {
        if (pre.querySelector(".copy-code")) return;
        const code = pre.querySelector("code");
        if (!code) return;
        const button = document.createElement("button");
        button.type = "button";
        button.className = "copy copy-code";
        button.dataset.copy = code.textContent;
        button.textContent = "copy";
        pre.classList.add("has-copy");
        pre.appendChild(button);
      });
    }
    function highlightAll(root2) {
      (root2 || document).querySelectorAll("pre > code").forEach((code) => {
        if (code.children.length) return;
        code.innerHTML = highlight(code.textContent);
      });
    }
    function splitLines(node) {
      const lines = [document.createDocumentFragment()];
      const last = () => lines[lines.length - 1];
      node.childNodes.forEach((child) => {
        if (child.nodeType === 3) {
          child.textContent.split("\n").forEach((part, i) => {
            if (i) lines.push(document.createDocumentFragment());
            if (part) last().appendChild(document.createTextNode(part));
          });
          return;
        }
        if (child.nodeType !== 1) return;
        splitLines(child).forEach((fragment, i) => {
          if (i) lines.push(document.createDocumentFragment());
          const clone = child.cloneNode(false);
          clone.appendChild(fragment);
          last().appendChild(clone);
        });
      });
      return lines;
    }
    function addLineNumbers(root2) {
      (root2 || document).querySelectorAll("pre > code").forEach((code) => {
        if (code.dataset.numbered) return;
        code.dataset.numbered = "1";
        const lines = splitLines(code);
        while (lines.length > 1 && !lines[lines.length - 1].textContent) lines.pop();
        if (lines.length < 2) return;
        code.textContent = "";
        lines.forEach((fragment) => {
          const line = document.createElement("span");
          line.className = "line";
          line.appendChild(fragment);
          code.appendChild(line);
        });
        code.parentElement.classList.add("has-lines");
      });
    }
    function showSample(target, name) {
      const container = document.querySelector(`[data-brg="${target}"]`);
      if (!container) return;
      const sample = (window.__BRIDGEY_SAMPLES || {})[name];
      if (!sample) {
        container.textContent = "（サンプルを読み込めませんでした。npm run build を実行してください）";
        return;
      }
      const jqueryTemplate = document.querySelector(`template[data-brg="${target}-jquery"]`);
      const jqueryCode = jqueryTemplate?.content.querySelector("code")?.textContent ?? "";
      const tabs = [];
      if (sample.html) tabs.push({ id: "html", label: "HTML", code: sample.html });
      if (jqueryCode) tabs.push({ id: "jquery", label: "jQuery", code: jqueryCode.trim() });
      tabs.push({ id: "js", label: "bridgey", code: sample.js });
      const tabBar = tabs.length < 2 ? "" : `<div class="code-tabs">` + tabs.map((tab) => `<button type="button" data-tab="${tab.id}">${tab.label}</button>`).join("") + `</div>`;
      container.innerHTML = tabBar + tabs.map(
        (tab) => `<div data-pane="${tab.id}"><pre><code>${highlight(tab.code)}</code></pre></div>`
      ).join("");
      addLineNumbers(container);
      const current = $$.state(tabs[0].id);
      $$(container).find("[data-tab]").each((tab) => {
        $$(tab).click(() => current(tab.dataset.tab)).selected(() => current() === tab.dataset.tab);
      });
      $$(container).find("[data-pane]").each((pane) => {
        $$(pane).when(() => current() === pane.dataset.pane);
      });
    }
    const OPTIONS = [
      { id: "warranty", name: "延長保証（3年）", price: 1100 },
      { id: "support", name: "電話サポート", price: 550 },
      { id: "setup", name: "設置・組み立て", price: 3300 }
    ];
    function exampleForm($el) {
      const options = $$.state(OPTIONS.slice());
      const plan = $el.find("@plan").group();
      $el.find("@opts").repeat(options, {
        key: (option) => option.id,
        tpl: "@opt-tpl",
        render: ($row, option) => {
          $row.find("@opt-name").text(option.name);
          $row.find("@opt-price").text(option.price, $$.money, "円/月");
          $row.find("@opt-check").attr("value", option.id);
        }
      });
      const selectedIds = $el.find("@opt-check").group();
      const optionTotal = $$.computed(() => {
        const priceOf = new Map(options().map((option) => [option.id, option.price]));
        return selectedIds().reduce((sum, id) => sum + (priceOf.get(id) ?? 0), 0);
      });
      $el.find("@opt-total").text(optionTotal, $$.money);
      const isCorporate = $$.computed(() => plan() === "corp");
      $el.find("@corp-box").when(isCorporate);
      const signupForm = $el.find("@form").form({
        company: {
          required: isCorporate,
          message: "会社名を入力してください"
        },
        tel: {
          pattern: /^0\d{9,10}$/,
          message: "電話番号の形式が正しくありません（ハイフンなし）"
        },
        confirm: {
          same: "password",
          message: "パスワードが一致しません"
        },
        agree: {
          required: true,
          message: "規約への同意が必要です"
        }
        // promo は required だが画面に出ていない → 検証されない（CV を守る）
      });
      const zipCode = $el.find("#ex-zip").state("");
      $el.find("#ex-zip").val(() => {
        const digits = String(zipCode()).replace(/[^0-9]/g, "").slice(0, 7);
        return digits.length > 3 ? `${digits.slice(0, 3)}-${digits.slice(3)}` : digits;
      });
      $el.find("@err-summary").text(signupForm.errorCount, (count) => {
        return count ? `未入力・不備が${count}件あります` : "";
      });
      $el.find("@submit").disabled(signupForm.submitting);
      $el.find("@done").when(() => {
        return signupForm.submitted() && signupForm.valid() && !signupForm.submitting();
      });
      return { form: signupForm, options };
    }
    $$.component("ex-form", ($el) => {
      const api = exampleForm($el);
      showSample("ex-source", "exampleForm");
      api.form.submit(async () => {
        await new Promise((r) => setTimeout(r, 900));
      });
    });
    $$.component("ex-structure", ($el) => {
      const oldHead = $el.find("@old-head").el;
      $$(oldHead).click(() => {
        const body = oldHead.nextElementSibling;
        if (!body || body.dataset.brg !== "old-body") {
          $el.find("@old-log").text("開きません。隣に別の要素が入りました（例外は出ません）");
          return;
        }
        const hidden = body.style.display === "none";
        body.style.display = hidden ? "" : "none";
        $el.find("@old-log").text(hidden ? "開きました" : "閉じました");
      });
      const open = $$.state(true);
      $el.find("@new-head").click(() => open((v) => !v)).expanded(open);
      $el.find("@new-body").when(open);
      $el.find("@new-log").text(open, (v) => v ? "開きました" : "閉じました");
      $el.find("@wrap").click(function() {
        for (const name of ["old-body", "new-body"]) {
          const target = $el.find(`@${name}`).el;
          if (!target || target.parentElement.dataset.wrapper) continue;
          const wrapper = document.createElement("div");
          wrapper.dataset.wrapper = "1";
          target.parentElement.insertBefore(wrapper, target);
          wrapper.appendChild(target);
        }
        this.disabled = true;
        $el.find("@old-log").text("1段ラップしました。開いてみてください。");
        $el.find("@new-log").text("1段ラップしました。開いてみてください。");
      });
    });
    $$.component("ex-broken", () => {
      const missing = document.querySelector("#this-element-does-not-exist");
      return void missing.getBoundingClientRect();
    });
    $$.component("ex-tabs", ($el) => {
      const current = $$.state("a");
      $el.find("@tab").each((tab) => {
        $$(tab).click(() => current(tab.dataset.tab)).selected(() => current() === tab.dataset.tab);
      });
      $el.find("@pane").each((pane) => {
        $$(pane).when(() => current() === pane.dataset.tab);
      });
    });
    $$.component("ex-mini", ($el) => {
      const n = $$.state(5);
      $el.find("@mini-n").text(n);
      $el.find("@mini-inc").click(() => n((v) => v + 1));
      $el.find("@mini-dec").click(() => n((v) => v - 1));
    });
    $$.component("ex-typo", ($el) => {
      $el.find("@run").click(function() {
        const original = $$.warnSink;
        let captured = "";
        $$.warnSink = (message) => {
          captured += (captured ? "\n\n" : "") + message;
          original(message);
        };
        try {
          $el.find("@run").toggleClass("ex-actve", $$.state(true));
        } finally {
          $$.warnSink = original;
        }
        this.disabled = true;
        $el.find("@typo-log").text(
          captured || "（この警告は1度だけ出ます。ページを読み込み直すとまた出ます）"
        );
      });
    });
    const CART_ITEMS = [
      { id: "desk", name: "昇降デスク", unit: 23800, qty: 1 },
      { id: "arm", name: "モニターアーム", unit: 3300, qty: 1 },
      { id: "cable", name: "USB-C ケーブル", unit: 1650, qty: 2 }
    ];
    function cart($el) {
      const FREE_SHIPPING_FROM = 3e4;
      const SHIPPING_FEE = 550;
      const TAX_RATE = 0.1;
      const COUPON_RATE = 0.1;
      const items = $$.state(CART_ITEMS.map((item) => ({ ...item })));
      const useCoupon = $el.find("@coupon").state(false);
      const subtotal = $$.computed(() => {
        return items().reduce((sum, item) => sum + item.unit * item.qty, 0);
      });
      const shipping = $$.computed(() => {
        if (subtotal() === 0) return 0;
        return subtotal() >= FREE_SHIPPING_FROM ? 0 : SHIPPING_FEE;
      });
      const discount = $$.computed(() => {
        return useCoupon() ? Math.floor(subtotal() * COUPON_RATE) : 0;
      });
      const taxable = $$.computed(() => subtotal() - discount() + shipping());
      const tax = $$.computed(() => Math.floor(taxable() * TAX_RATE));
      const total = $$.computed(() => taxable() + tax());
      const amountToFreeShipping = $$.computed(() => {
        return Math.max(0, FREE_SHIPPING_FROM - subtotal());
      });
      const changeQuantity = (id, change) => {
        items(
          (list) => list.map((item) => {
            if (item.id !== id) return item;
            return { ...item, qty: Math.max(1, change(item.qty)) };
          })
        );
      };
      const removeItem = (id) => {
        items((list) => list.filter((item) => item.id !== id));
      };
      $el.find("@rows").repeat(items, {
        key: (item) => item.id,
        tpl: "@row-tpl",
        render: ($row, item) => {
          $row.find("@name").text(item.name);
          $row.find("@unit").text(item.unit, $$.money, "円");
          $row.find("@qty").text(item.qty);
          $row.find("@line").text(item.unit * item.qty, $$.money, "円");
          $row.find("@inc").click(() => changeQuantity(item.id, (qty) => qty + 1));
          $row.find("@dec").click(() => changeQuantity(item.id, (qty) => qty - 1));
          $row.find("@del").click(() => removeItem(item.id));
        }
      });
      const isEmpty = $$.computed(() => items().length === 0);
      $el.find("@empty").when(isEmpty);
      $el.find("@summary").when(() => !isEmpty());
      $el.find("@subtotal").text(subtotal, $$.money, "円");
      $el.find("@ship").text(shipping, (fee) => {
        return fee === 0 ? "無料" : `${$$.money(fee)}円`;
      });
      $el.find("@discount").text(discount, (amount) => {
        return amount === 0 ? "—" : `-${$$.money(amount)}円`;
      });
      $el.find("@tax").text(tax, $$.money, "円");
      $el.find("@total").text(total, $$.money);
      $el.find("@to-free").text(amountToFreeShipping, $$.money);
      $el.find("@free-note").when(() => {
        return amountToFreeShipping() > 0 && !isEmpty();
      });
      $el.find("@restore").click(() => {
        items(CART_ITEMS.map((item) => ({ ...item })));
      });
    }
    $$.component("ex-cart", ($el) => {
      cart($el);
      showSample("cart-source", "cart");
    });
    function counter($el) {
      const MAX_QUANTITY = 20;
      const UNIT_PRICE = 1100;
      const quantity = $$.state(1);
      const doubled = $$.computed(() => quantity() * 2);
      const total = $$.computed(() => quantity() * UNIT_PRICE);
      const isBulk = $$.computed(() => quantity() >= 10);
      const isMax = $$.computed(() => quantity() >= MAX_QUANTITY);
      $el.find("@cnt-n").text(quantity);
      $el.find("@cnt-doubled").text(doubled);
      $el.find("@cnt-total").text(total, $$.money);
      $el.find("@cnt-inc").click(() => {
        quantity((current) => Math.min(MAX_QUANTITY, current + 1));
      });
      $el.find("@cnt-dec").click(() => {
        quantity((current) => Math.max(1, current - 1));
      });
      $el.find("@cnt-reset").click(() => quantity(1));
      $el.find("@cnt-inc").disabled(isMax);
      $el.find("@cnt-dec").disabled(() => quantity() <= 1);
      $el.find("@cnt-over").when(isBulk);
      $el.find("@cnt-limit").when(isMax);
    }
    $$.component("ex-counter", ($el) => {
      counter($el);
      showSample("counter-source", "counter");
    });
    function todo($el) {
      let nextId = 3;
      const todos = $$.state([
        { id: 1, title: "見積書を送る", done: false },
        { id: 2, title: "請求書を確認する", done: true }
      ]);
      const filter = $el.find("@filter").group();
      const draft = $el.find("@input").state("");
      const visibleTodos = $$.computed(() => {
        if (filter() === "open") return todos().filter((todo2) => !todo2.done);
        if (filter() === "done") return todos().filter((todo2) => todo2.done);
        return todos();
      });
      const remainingCount = $$.computed(() => {
        return todos().filter((todo2) => !todo2.done).length;
      });
      const addTodo = () => {
        const title = draft().trim();
        if (!title) return;
        todos((list) => [...list, { id: nextId++, title, done: false }]);
        draft("");
      };
      const setDone = (id, done) => {
        todos(
          (list) => list.map((todo2) => {
            if (todo2.id !== id) return todo2;
            return { ...todo2, done };
          })
        );
      };
      $el.find("@add").click(addTodo);
      $el.find("@input").on("keydown", (event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        addTodo();
      });
      $el.find("@counts").text(remainingCount, "件が未完了");
      $el.find("@empty").when(() => visibleTodos().length === 0);
      $el.find("@list").repeat(visibleTodos, {
        key: (todo2) => todo2.id,
        tpl: "@todo-tpl",
        render: ($row, todo2) => {
          $row.find("@title").text(todo2.title);
          $row.find("@check").prop("checked", todo2.done);
          $row.find("@check").on("change", function() {
            setDone(todo2.id, this.checked);
          });
          $row.find("@del").click(() => {
            todos((list) => list.filter((item) => item.id !== todo2.id));
          });
          $row.selected(() => todo2.done);
        }
      });
    }
    $$.component("ex-todo", ($el) => {
      todo($el);
      showSample("todo-source", "todo");
    });
    $$.component("code-tabs", ($el) => {
      const current = $$.state($el.find("@code-tab").first().data("tab") || "bridgey");
      $el.find("@code-tab").each((tab) => {
        const name = tab.dataset.tab;
        $$(tab).click(() => current(name)).selected(() => current() === name);
      });
      $el.find("@code-pane").each((pane) => {
        $$(pane).when(() => current() === pane.dataset.tab);
      });
    });
    function initTOC() {
      if (typeof IntersectionObserver === "undefined") return;
      const toc = document.querySelector(".toc");
      if (!toc) return;
      const links = [...toc.querySelectorAll("a[href^='#']")];
      const map = /* @__PURE__ */ new Map();
      links.forEach((a) => {
        const el = document.getElementById(a.getAttribute("href").slice(1));
        if (el) map.set(el, a);
      });
      tocObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => {
            if (!e.isIntersecting) return;
            links.forEach((l) => l.classList.remove("active"));
            const a = map.get(e.target);
            if (a) a.classList.add("active");
          });
        },
        { rootMargin: "-72px 0px -70% 0px", threshold: 0 }
      );
      map.forEach((_, el) => tocObserver.observe(el));
    }
  })();
})();
