// site.js — このサイト自身を bridgey v2 で動かす。
//
// ＝ ドッグフーディング。ルーティング・描画・テーマ・コピー・目次追従を
//    $$.state / $$.computed / $$.resource / $$(document) だけで書いている。
//    v1 からの変更点はコメントで示した（利用者の移行の実例にもなるので）。
//
// bridgey が先に読み込まれ、window.$$ が居る前提。

(function () {
  const root = document.documentElement;
  const VIEWS = { "": "home", home: "home", tutorial: "tutorial", docs: "docs", examples: "examples" };

  // 現在ハッシュを {route, anchor} に分解する。
  //   #/docs           → { route:"docs",     anchor:null }
  //   #/examples#todo  → { route:"examples", anchor:"todo" }
  //   #why             → { route:null,       anchor:null }   ← 現ビュー内アンカー
  const parseHash = () => {
    const h = location.hash;
    if (!h.startsWith("#/")) return { route: null, anchor: null };
    const rest = h.slice(2);
    const i = rest.indexOf("#");
    const route = (i >= 0 ? rest.slice(0, i) : rest) || "home";
    const anchor = i >= 0 ? rest.slice(i + 1) : null;
    return { route, anchor };
  };

  const initial = parseHash();

  // ★ルートは state。v1: state("home") / route.value → v2: $$.state("home") / route()
  const route = $$.state(initial.route || "home");

  let tocObserver = null;
  let pendingScroll = initial.anchor;

  const scrollToId = (id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth" });
  };

  // ビューの HTML を取ってくる。
  // v1: $$.get(url, {type:"text"}) → v2: $$.resource
  //   ・route が変わるたび取り直す
  //   ・通信する場合は前のリクエストが自動で中断される（順序が入れ替わらない）
  //
  // ビューは build 時に dist/views.js へ埋め込んでいる。
  // これで file:// で直接開いても動く（fetch は file:// では CORS でブロックされる）。
  const page = $$.resource(route, async (name, signal) => {
    const view = VIEWS[name] || "home";
    const embedded = window.__BRIDGEY_VIEWS;
    if (embedded && embedded[view]) return { view, html: embedded[view] };

    // 埋め込みが無い場合（ビルド前など）は取りに行く
    const res = await fetch(`views/${view}.html`, { signal });
    if (!res.ok) throw new Error(`${res.status}`);
    return { view, html: await res.text() };
  });

  // 取得できたら差し込む。失敗したら失敗を出す。
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

    // ナビの active（v2 では .selected() で aria-current 相当も付けられるが、
    // ここは既存 CSS が .active を見ているのでそのまま）
    $$("nav .links a[data-route]").removeClass("active");
    $$(`nav .links a[data-route="${current.view}"]`).addClass("active");

    highlightAll(document.querySelector("#app"));
    // コピー用の文字列を先に確保してから行に切る（番号も改行も文字列に混ぜない）
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
      // 差し込んだ直後はまだレイアウトが決まっていないので次のフレームで
      requestAnimationFrame(() => scrollToId(id));
    } else {
      window.scrollTo(0, 0);
    }
  });

  // ハッシュ変化 → route を更新
  $$(window).on("hashchange", () => {
    const { route: next, anchor } = parseHash();
    if (next === null) return; // 現ビュー内アンカー → ブラウザに任せる
    if (anchor) pendingScroll = anchor;
    if (next !== route()) {
      route(next);
    } else if (anchor) {
      scrollToId(anchor);
    }
  });

  // ヘッダーの home セクションリンク（Why/Concept/Install）
  $$("nav .links a[data-scroll]").on("click", function (e) {
    e.preventDefault();
    const id = this.dataset.scroll;
    if (route() === "home") {
      scrollToId(id);
    } else {
      pendingScroll = id;
      route("home");
    }
  });

  // --- ハンバーガーメニュー（永続 nav なので一度だけ配線） ---
  const menuOpen = $$.state(false);
  $$("#navLinks").toggleClass("open", menuOpen);
  $$("#navToggle").expanded(menuOpen).click(() => menuOpen((v) => !v));
  $$("nav .links a").on("click", () => menuOpen(false));

  // --- テーマ（localStorage で維持） ---
  const theme = $$.state(localStorage.getItem("bridgey-theme") || "light");
  $$.effect(() => {
    root.setAttribute("data-theme", theme());
    localStorage.setItem("bridgey-theme", theme());
  });
  $$("#themeBtn").click(() => theme((t) => (t === "dark" ? "light" : "dark")));

  // --- コピーボタン（イベント委譲。再描画されても効く） ---
  // v1 と同じく $$(document) に張る（v2 でも document / window を渡せる）
  $$(document).on("click", ".copy", async function () {
    try {
      await navigator.clipboard.writeText(this.dataset.copy);
      const label = this.textContent;
      this.textContent = "copied";
      setTimeout(() => (this.textContent = label), 1200);
    } catch (e) {
      /* クリップボードが使えない環境では黙る */
    }
  });

  // ---------------------------------------------------------------------------
  // ホームのライブデモ。
  //
  // SPA で差し込まれた HTML でも、data-component="home-demo" があれば
  // bridgey が自動で見つけて動かす（MutationObserver）。
  // ＝ サイト自身が「Ajax で追加した要素にも効く」の実例になっている。
  // ---------------------------------------------------------------------------
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
      progress: () => `${Math.min(100, quantity() * 20)}%`,
    });
  }

  $$.component("home-demo", ($el) => {
    homeDemo($el);
    showSample("home-demo-source", "homeDemo");
  });

  // ---------------------------------------------------------------------------
  // シンタックスハイライト。
  //
  // 外部ライブラリは入れない（依存ゼロの看板と、CSPセーフを保つため）。
  // 既に .tok-* が手で書かれている <pre> は触らない。
  // ---------------------------------------------------------------------------
  const TOKENS = new RegExp(
    [
      "(?<c>//[^\\n]*|/\\*[\\s\\S]*?\\*/|<!--[\\s\\S]*?-->)", // コメント
      "(?<s>\"(?:[^\"\\\\]|\\\\.)*\"|'(?:[^'\\\\]|\\\\.)*'|`(?:[^`\\\\]|\\\\.)*`)", // 文字列
      "(?<t></?[a-zA-Z][\\w-]*)", // HTML タグ
      "(?<k>\\b(?:const|let|var|function|return|if|else|for|of|in|await|async|new|" +
        "import|export|from|class|extends|try|catch|finally|throw|typeof|" +
        "true|false|null|undefined|this)\\b)", // キーワード
      "(?<f>\\b[A-Za-z_$][\\w$]*(?=\\s*\\())", // 呼び出し
    ].join("|"),
    "g"
  );

  const escapeHtml = (text) =>
    text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  function highlight(source) {
    let out = "";
    let last = 0;
    let match;
    TOKENS.lastIndex = 0;
    while ((match = TOKENS.exec(source))) {
      out += escapeHtml(source.slice(last, match.index));
      const g = match.groups;
      const cls = g.c ? "tok-c" : g.s ? "tok-s" : g.t ? "tok-t" : g.k ? "tok-k" : "tok-f";
      out += `<span class="${cls}">${escapeHtml(match[0])}</span>`;
      last = match.index + match[0].length;
    }
    return out + escapeHtml(source.slice(last));
  }

  /**
   * コードブロックにコピーボタンを付ける。
   * コピー自体は $(document) に張った .copy のハンドラが処理する。
   */
  function addCopyButtons(root) {
    (root || document).querySelectorAll("pre").forEach((pre) => {
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

  /** そのビューの中の、まだ色が付いていないコードブロックを着色する。 */
  function highlightAll(root) {
    (root || document).querySelectorAll("pre > code").forEach((code) => {
      if (code.children.length) return; // 手で .tok-* が書かれている → 触らない
      code.innerHTML = highlight(code.textContent);
    });
  }

  /**
   * コードブロックを1行ずつ <span class="line"> で包む。番号は CSS のカウンタが振る。
   *
   * 文字列を改行で split すると、複数行にまたがるトークン（ブロックコメントや
   * テンプレートリテラル）の <span> が壊れる。なので DOM を辿って切り、
   * またいだ要素は行ごとに同じタグで包み直す。
   *
   * 番号は ::before で出すので、コピーした文字列には入らない。
   */
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

  function addLineNumbers(root) {
    (root || document).querySelectorAll("pre > code").forEach((code) => {
      if (code.dataset.numbered) return;
      code.dataset.numbered = "1";

      const lines = splitLines(code);
      // 末尾の改行で生まれる空行は数に入れない
      while (lines.length > 1 && !lines[lines.length - 1].textContent) lines.pop();
      if (lines.length < 2) return; // 1行だけなら番号は邪魔

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

  /**
   * サンプルを [bridgey] [HTML] [jQuery（参考）] のタブで表示する。
   *
   * ラベルは「JavaScript」ではなく「bridgey」。どちらも JavaScript なので、
   * 言語名では何も言っていない。読む人が知りたいのは jQuery か bridgey か。
   *
   * 最初に出すのは bridgey。このサイトで読ませたいのはそれで、
   * jQuery は「同じ画面を今までの書き方で書くとこうなる」という参考なので末尾。
   *
   * jQuery 版は書き比べたい場所にだけ置く。同じ場所に
   *   <template data-brg="{target}-jquery"><pre><code>…</code></pre></template>
   * を書いておくと、この1列に混ざる。
   * （タブの中にタブを作らない。読む人が2回選ばされることになるので）
   *
   * bridgey 側の中身は build 時に **元のソースから** 抜き出したもの（dist/samples.js）。
   * バンドル後のコードを見せると変数名が変わって読めないので、そうしている。
   * JS だけでは何を操作しているのか分からないため、HTML も見られるようにしている。
   *
   * このタブ自体も bridgey の state で動いている。
   */
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

    const tabs = [{ id: "js", label: "bridgey", code: sample.js }];
    if (sample.html) tabs.push({ id: "html", label: "HTML", code: sample.html });
    if (jqueryCode) tabs.push({ id: "jquery", label: "jQuery（参考）", code: jqueryCode.trim() });

    // 1枚しかないなら、タブは出さない（押しても何も起きないボタンを置かない）
    const tabBar =
      tabs.length < 2
        ? ""
        : `<div class="code-tabs">` +
          tabs
            .map((tab) => `<button type="button" data-tab="${tab.id}">${tab.label}</button>`)
            .join("") +
          `</div>`;

    container.innerHTML =
      tabBar +
      tabs
        .map(
          (tab) =>
            `<div data-pane="${tab.id}"><pre><code>${highlight(tab.code)}</code></pre></div>`
        )
        .join("");

    addLineNumbers(container);

    const current = $$.state(tabs[0].id);

    $$(container)
      .find("[data-tab]")
      .each((tab) => {
        $$(tab)
          .click(() => current(tab.dataset.tab))
          .selected(() => current() === tab.dataset.tab);
      });

    $$(container)
      .find("[data-pane]")
      .each((pane) => {
        $$(pane).when(() => current() === pane.dataset.pane);
      });
  }

  // ---------------------------------------------------------------------------
  // examples: 複雑な申し込みフォーム。
  // 下のコード欄には、この関数の中身をそのまま表示する（手書きの写しにしない）。
  // ---------------------------------------------------------------------------
  const OPTIONS = [
    { id: "warranty", name: "延長保証（3年）", price: 1100 },
    { id: "support", name: "電話サポート", price: 550 },
    { id: "setup", name: "設置・組み立て", price: 3300 },
  ];

  function exampleForm($el) {
    const options = $$.state(OPTIONS.slice());
    const plan = $el.find("@plan").group();

    // オプション一覧（行の DOM は使い回されるのでチェックが消えない）
    $el.find("@opts").repeat(options, {
      key: (option) => option.id,
      tpl: "@opt-tpl",
      render: ($row, option) => {
        $row.find("@opt-name").text(option.name);
        $row.find("@opt-price").text(option.price, $$.money, "円/月");
        $row.find("@opt-check").attr("value", option.id);
      },
    });

    // 選択を1つの state にして、合計は導出する（代入する場所を作らない）
    // 後からオプションが増えても、この state に自動で参加する（張り直しは要らない）
    const selectedIds = $el.find("@opt-check").group();

    const optionTotal = $$.computed(() => {
      const priceOf = new Map(options().map((option) => [option.id, option.price]));

      return selectedIds().reduce((sum, id) => sum + (priceOf.get(id) ?? 0), 0);
    });

    $el.find("@opt-total").text(optionTotal, $$.money);

    // 法人のときだけ会社名を表示し、同じ条件で必須にする
    const isCorporate = $$.computed(() => plan() === "corp");
    $el.find("@corp-box").when(isCorporate);

    const signupForm = $el.find("@form").form({
      company: {
        required: isCorporate,
        message: "会社名を入力してください",
      },
      tel: {
        pattern: /^0\d{9,10}$/,
        message: "電話番号の形式が正しくありません（ハイフンなし）",
      },
      confirm: {
        same: "password",
        message: "パスワードが一致しません",
      },
      agree: {
        required: true,
        message: "規約への同意が必要です",
      },
      // promo は required だが画面に出ていない → 検証されない（CV を守る）
    });

    // 郵便番号の自動整形（日本語変換中は書き戻さないので変換が壊れない）
    const zipCode = $el.find("#ex-zip").state("");

    $el.find("#ex-zip").val(() => {
      const digits = String(zipCode()).replace(/[^0-9]/g, "").slice(0, 7);

      return digits.length > 3
        ? `${digits.slice(0, 3)}-${digits.slice(3)}`
        : digits;
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
      // 送信の代わりに待つだけ。待っている間は submit ボタンが自動で無効になる
      await new Promise((r) => setTimeout(r, 900));
    });
  });

  // ---------------------------------------------------------------------------
  // examples: 構造依存の事故を、その場で起こしてみせる。
  //
  // 左は「隣の要素を掴む」書き方（jQuery の .next() 相当）。
  // 右は「名前で引く」書き方。HTML を1段ラップすると、左だけが黙って動かなくなる。
  // ---------------------------------------------------------------------------
  $$.component("ex-structure", ($el) => {
    // 従来のやり方: nextElementSibling で隣を掴む
    const oldHead = $el.find("@old-head").el;

    $$(oldHead).click(() => {
      const body = oldHead.nextElementSibling;

      if (!body || body.dataset.brg !== "old-body") {
        // ここが事故。掴めていないのに例外は出ないので、誰も気づけない
        $el.find("@old-log").text("開きません。隣に別の要素が入りました（例外は出ません）");
        return;
      }
      const hidden = body.style.display === "none";
      body.style.display = hidden ? "" : "none";
      $el.find("@old-log").text(hidden ? "開きました" : "閉じました");
    });

    // bridgey: 名前で引くので、構造が変わっても同じ要素に届く
    const open = $$.state(true);

    $el.find("@new-head").click(() => open((v) => !v)).expanded(open);
    $el.find("@new-body").when(open);
    $el.find("@new-log").text(open, (v) => (v ? "開きました" : "閉じました"));

    $el.find("@wrap").click(function () {
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

  // ---------------------------------------------------------------------------
  // examples: エラーの隔離。
  // わざと初期化に失敗する部品を混ぜても、他の部品は動き続ける。
  // ---------------------------------------------------------------------------
  $$.component("ex-broken", () => {
    // 元コードの s.offset().top と同じ状況（存在しない要素を触る）
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

  // ---------------------------------------------------------------------------
  // examples: CSS に無いクラス名を検出する。
  // 警告の出口（$$.warnSink）を一時的に借りて、出た文を画面にも見せる。
  // ---------------------------------------------------------------------------
  $$.component("ex-typo", ($el) => {
    $el.find("@run").click(function () {
      const original = $$.warnSink;
      let captured = "";

      $$.warnSink = (message) => {
        captured += (captured ? "\n\n" : "") + message;
        original(message);
      };
      try {
        // ".ex-active" のつもりで綴りを間違えている
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

  // ---------------------------------------------------------------------------
  // examples: カート。金額を全部「導出」する例。
  // 代入している行が1つもないので、数量変更・削除・クーポンで合計がズレようがない。
  // ---------------------------------------------------------------------------
  const CART_ITEMS = [
    { id: "desk", name: "昇降デスク", unit: 23800, qty: 1 },
    { id: "arm", name: "モニターアーム", unit: 3300, qty: 1 },
    { id: "cable", name: "USB-C ケーブル", unit: 1650, qty: 2 },
  ];

  function cart($el) {
    const FREE_SHIPPING_FROM = 30000;
    const SHIPPING_FEE = 550;
    const TAX_RATE = 0.1;
    const COUPON_RATE = 0.1;

    const items = $$.state(CART_ITEMS.map((item) => ({ ...item })));
    const useCoupon = $el.find("@coupon").state(false);

    // ここから下は全部「導出」。金額に代入している行は1つもない
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
      items((list) =>
        list.map((item) => {
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
      },
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

  // ---------------------------------------------------------------------------
  // examples: カウンター（最小の状態管理）
  // 状態は n ひとつ。表示は全部そこから導出する。
  // ---------------------------------------------------------------------------
  function counter($el) {
    const MAX_QUANTITY = 20;
    const UNIT_PRICE = 1100;

    // 状態はこの1つだけ
    const quantity = $$.state(1);

    // ここから下は全部「導出」。どこにも代入していない
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

  // ---------------------------------------------------------------------------
  // examples: ToDo（一覧の状態管理）
  // 一覧は repeat が描くので、行の DOM が使い回される＝入力途中の文字が消えない。
  // ---------------------------------------------------------------------------
  function todo($el) {
    let nextId = 3;

    const todos = $$.state([
      { id: 1, title: "見積書を送る", done: false },
      { id: 2, title: "請求書を確認する", done: true },
    ]);

    const filter = $el.find("@filter").group();
    const draft = $el.find("@input").state("");

    // 表示する一覧は「絞り込んだ結果」を導出する
    const visibleTodos = $$.computed(() => {
      if (filter() === "open") return todos().filter((todo) => !todo.done);
      if (filter() === "done") return todos().filter((todo) => todo.done);

      return todos();
    });

    const remainingCount = $$.computed(() => {
      return todos().filter((todo) => !todo.done).length;
    });

    const addTodo = () => {
      const title = draft().trim();
      if (!title) return;

      todos((list) => [...list, { id: nextId++, title, done: false }]);
      draft("");
    };

    const setDone = (id, done) => {
      todos((list) =>
        list.map((todo) => {
          if (todo.id !== id) return todo;

          return { ...todo, done };
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
      key: (todo) => todo.id,
      tpl: "@todo-tpl",
      render: ($row, todo) => {
        $row.find("@title").text(todo.title);
        $row.find("@check").prop("checked", todo.done);

        $row.find("@check").on("change", function () {
          setDone(todo.id, this.checked);
        });
        $row.find("@del").click(() => {
          todos((list) => list.filter((item) => item.id !== todo.id));
        });

        $row.selected(() => todo.done);
      },
    });
  }

  $$.component("ex-todo", ($el) => {
    todo($el);
    showSample("todo-source", "todo");
  });

  // ---------------------------------------------------------------------------
  // コード比較のタブ切り替え（bridgey / jQuery）。
  // 横に並べると1行が短くなって読みにくいので、切り替えて全幅で見せる。
  // ---------------------------------------------------------------------------
  $$.component("code-tabs", ($el) => {
    const current = $$.state($el.find("@code-tab").first().data("tab") || "bridgey");

    $el.find("@code-tab").each((tab) => {
      const name = tab.dataset.tab;

      $$(tab)
        .click(() => current(name))
        .selected(() => current() === name);
    });

    $el.find("@code-pane").each((pane) => {
      $$(pane).when(() => current() === pane.dataset.tab);
    });
  });

  // --- 目次のスクロール追従 ---
  function initTOC() {
    // 目次の追従は「あると嬉しい」機能。使えない環境でも描画を止めない。
    // （1つの API が無いだけでページ全体が死ぬ、を自分でやらないため）
    if (typeof IntersectionObserver === "undefined") return;
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
