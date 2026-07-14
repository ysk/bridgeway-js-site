/*! bridgey — jQuery感覚でモダン開発 / グローバル版(Svelteエンジン同梱). bridgey is MIT licensed.
 * Bundles Svelte (MIT, Copyright (c) 2016-23 the Svelte contributors). See THIRD-PARTY-NOTICES.md. */
(function () {
  'use strict';

  // engine.js
  // リアクティビティ・エンジンの差し込み口(アダプタ・レジストリ)。
  //
  // 【このプロジェクトの核】
  // 本質は「レガシー脳の人のモダンJS移行お手伝い」。特定フレームワークに縛らない。
  // だから表側(jQuery風API)は、状態の中身を一切知らず、下の契約だけに依存する。
  // エンジンを Svelte / Vue / Signals に差し替えられる = 移行の受け皿を広く用意する。
  //
  // ── Adapter が満たすべき契約 ──────────────────────────────
  //   adapter.state(initial) -> Reactive
  //   adapter.computed(reactives[], fn) -> Reactive   // reactives は Reactive の配列
  //   adapter.mount(Component, { target, props }) -> Handle   // 任意(コンポーネント描画)
  //
  //   Reactive {
  //     get(): value
  //     set(value): void            // computed は読み取り専用(呼ぶと例外でOK)
  //     update(fn): void
  //     subscribe(cb): () => void   // 購読解除関数を返す
  //   }
  //   Handle {                      // mount の戻り(ライフサイクル)
  //     set(props): void            // props更新
  //     on(event, cb): void         // コンポーネントのイベント購読
  //     destroy(): void             // 破棄(購読・DOMの片付けはエンジン責任)
  //   }
  //
  // 【将来: Vueなどへ差し替え】
  //   同じ契約を満たす vueEngine(state=ref/reactive, computed=computed, mount=createApp)を
  //   用意し useEngine(vueEngine) で差し替える。利用者の $$/state/mount は変えなくていい。
  //   ゆくゆくは「npm install bridgey → フレームワーク選択(svelte/vue)」でこれを自動配線する。
  // ────────────────────────────────────────────────────────

  // 既定エンジンは静的importしない。
  // → こうすることで、import "bridgey" が特定エンジン(svelte)を巻き込まなくなり、
  //   svelte / vue を optional peer にできる(選んだ方だけ npm install すればよい)。
  //   利用者は起動時に useEngine(svelteEngine | vueEngine) を一度だけ呼ぶ。
  //   (グローバル配布版 src/global.js は既定でsvelteを配線して <script> 用途を保つ)
  let current = null;

  /** 使用するエンジンを選択/差し替える。アプリ起動時に一度だけ呼ぶ。 */
  function useEngine(adapter) {
    if (!adapter || typeof adapter.state !== "function") {
      throw new Error("[bridgey] 不正なエンジン: state(initial) を実装してください");
    }
    current = adapter;
  }

  /** 現在のエンジンを取得(表側APIが内部利用)。 */
  function engine() {
    if (!current) {
      throw new Error(
        "[bridgey] エンジン未選択です。起動時に useEngine(...) を呼んでください。\n" +
          '  import { svelteEngine } from "bridgey/engines/svelte.js"; useEngine(svelteEngine);\n' +
          '  または import { vueEngine } from "bridgey/engines/vue.js"; useEngine(vueEngine);'
      );
    }
    return current;
  }

  // bridgey
  // jQueryの書き味 × 本物のモダンフレームワーク。
  //
  // 【このプロジェクトの本質】
  //   モダンな技術(Svelte/将来はVue等)を、限りなく楽に。＝ 学習コストの削減。
  //   「なんちゃって」実装はしない。構造・制御構文・リスト・DOM更新は本物のエンジンに委ねる。
  //   bridgey が受け持つのは2つだけ:
  //     (1) jQueryの書き味(命令的グルー) … 既存の手がそのまま動く入口
  //     (2) state / computed … リアクティブ状態(下のエンジンに委譲。Svelte↔Vue差し替え可)
  //   ※ 画面の構造・{#if}/{#each}・DOM差分は .svelte(将来 .vue)側の担当。ここでは持たない。
  //
  // 【なくしたもの(意図的)】
  //   ・自前テンプレ(旧 template.js / new Function) → CSP違反・XSS源だったので廃止
  //   ・innerHTML 総入れ替え(旧 template()/bindList) → フォーカス飛び等の事故源。エンジンに委譲
  //   ・jQuery共存の島機構(data-bridge-ignore) → 共存はサポートしない方針に伴い撤去


  // -----------------------------------------------------------------------------
  // リアクティブ状態: エンジンのReactiveを、素直な .value で触れる形に包む
  // -----------------------------------------------------------------------------

  // 依存の自動追跡: computed(fn) 実行中はここに「読まれた state」が集まる。
  let tracking = null;

  function readValue(reactive) {
    if (tracking) tracking.add(reactive);
    return reactive.get();
  }

  function makeHandle(reactive, readonly = false) {
    const handle = { __r: reactive, subscribe: reactive.subscribe };
    Object.defineProperty(handle, "value", {
      get: () => readValue(reactive),
      set: readonly ? undefined : (v) => reactive.set(v),
      enumerable: true,
      configurable: true,
    });
    if (!readonly) {
      handle.update = (fn) =>
        reactive.update ? reactive.update(fn) : reactive.set(fn(reactive.get()));
    }
    return handle;
  }

  /**
   * リアクティブな状態を作る。
   *   const count = state(0);
   *   count.value++;             // 書くと束縛先(DOM)が自動更新
   *   count.update(n => n + 1);  // 関数更新
   */
  function state(initial) {
    return makeHandle(engine().state(initial));
  }

  /**
   * 派生状態(computed)。読み取り専用。依存が変わると自動再計算。
   *
   * (A) 関数だけ渡す → 依存を自動追跡（おすすめ）:
   *   const visible = computed(() => filter.value === "done"
   *     ? todos.value.filter(t => t.done) : todos.value);
   *
   * (B) 依存を明示する従来形:
   *   const doubled = computed(count, n => n * 2);
   *   const total   = computed([a, b], (x, y) => x + y);
   */
  function computed(depsOrFn, fn) {
    if (typeof depsOrFn === "function" && fn === undefined) {
      const compute = depsOrFn;
      const prev = tracking;
      const deps = new Set();
      tracking = deps;
      try {
        compute();
      } finally {
        tracking = prev;
      }
      return makeHandle(engine().computed([...deps], () => compute()), true);
    }
    const list = Array.isArray(depsOrFn) ? depsOrFn : [depsOrFn];
    const reactives = list.map((h) => h.__r);
    return makeHandle(engine().computed(reactives, (...vals) => fn(...vals)), true);
  }

  // -----------------------------------------------------------------------------
  // jQueryライクなDOMラッパー(命令的グルー専用。構造描画は持たない)
  // -----------------------------------------------------------------------------

  class Bridgey {
    constructor(selector) {
      if (selector == null) {
        this.els = [];
      } else if (typeof selector === "string") {
        const s = selector.trim();
        if (s[0] === "<" && s[s.length - 1] === ">") {
          // jQuery流のHTML生成: $$("<li class='x'>…</li>")
          const tpl = document.createElement("template");
          tpl.innerHTML = s;
          this.els = [...tpl.content.childNodes].filter((n) => n.nodeType === 1);
        } else {
          this.els = [...document.querySelectorAll(selector)];
        }
      } else if (selector instanceof Bridgey) {
        this.els = selector.els.slice();
      } else if (selector.nodeType) {
        this.els = [selector];
      } else if (typeof selector.length === "number") {
        this.els = Array.prototype.slice.call(selector).filter((n) => n && n.nodeType);
      } else {
        this.els = [];
      }
      // ④対策: このラッパーが張った購読の解除関数を溜める。dispose() で一括解除。
      this._disposers = [];
    }

    // --- 走査 --------------------------------------------------------------
    get el() {
      return this.els[0] ?? null;
    }
    nodes() {
      return this.els.slice();
    }
    get(i) {
      return i === undefined ? this.els.slice() : this.els[i];
    }
    each(fn) {
      this.els.forEach((el, i) => fn.call(el, el, i));
      return this;
    }
    find(sel) {
      return new Bridgey(this.els.flatMap((el) => [...el.querySelectorAll(sel)]));
    }

    // --- 命令的操作(jQuery互換の書き味) -----------------------------------
    text(v) {
      if (v === undefined) return this.el?.textContent ?? "";
      this.els.forEach((el) => (el.textContent = v));
      return this;
    }
    html(v) {
      if (v === undefined) return this.el?.innerHTML ?? "";
      this.els.forEach((el) => (el.innerHTML = v));
      return this;
    }
    val(v) {
      if (v === undefined) return this.el?.value ?? "";
      this.els.forEach((el) => (el.value = v));
      return this;
    }
    attr(name, v) {
      if (name && typeof name === "object") {
        // jQuery流のオブジェクト一括指定: attr({ href, title })
        this.els.forEach((el) => {
          for (const [k, val] of Object.entries(name)) el.setAttribute(k, val);
        });
        return this;
      }
      if (v === undefined) return this.el?.getAttribute(name);
      this.els.forEach((el) => el.setAttribute(name, v));
      return this;
    }
    // jQuery同様、空白区切りで複数クラスOK: addClass("a b c")
    addClass(c) {
      const cs = (c || "").split(/\s+/).filter(Boolean);
      this.els.forEach((el) => el.classList.add(...cs));
      return this;
    }
    removeClass(c) {
      if (c === undefined) {
        this.els.forEach((el) => (el.className = "")); // 引数なしで全消し(jQuery互換)
        return this;
      }
      const cs = c.split(/\s+/).filter(Boolean);
      this.els.forEach((el) => el.classList.remove(...cs));
      return this;
    }
    toggleClass(c, force) {
      const cs = c.split(/\s+/).filter(Boolean);
      this.els.forEach((el) => cs.forEach((x) => el.classList.toggle(x, force)));
      return this;
    }
    // 文字列(HTML) / DOMノード / Bridgey / 配列 を受け付ける(jQuery互換)
    append(content) {
      const nodes = toNodes(content);
      this.els.forEach((el, i) => {
        if (nodes) nodes.forEach((n) => el.appendChild(i === 0 ? n : n.cloneNode(true)));
        else if (typeof content === "string") el.insertAdjacentHTML("beforeend", content);
      });
      return this;
    }
    empty() {
      this.els.forEach((el) => (el.innerHTML = ""));
      return this;
    }
    focus(handler) {
      if (handler) return this.on("focus", handler);
      this.el?.focus();
      return this;
    }
    blur(handler) {
      if (handler) return this.on("blur", handler);
      this.el?.blur();
      return this;
    }

    // --- jQuery定番: 表示/スタイル/プロパティ -----------------------------
    show() {
      this.els.forEach((el) => (el.style.display = ""));
      return this;
    }
    hide() {
      this.els.forEach((el) => (el.style.display = "none"));
      return this;
    }
    toggle(force) {
      this.els.forEach((el) => {
        const willShow = force === undefined ? window.getComputedStyle(el).display === "none" : force;
        el.style.display = willShow ? "" : "none";
      });
      return this;
    }
    // 簡易フェード(jQueryの書き味を残す。transitionで実現)
    fadeOut(ms = 200) {
      this.els.forEach((el) => {
        el.style.transition = `opacity ${ms}ms`;
        el.style.opacity = "0";
        setTimeout(() => (el.style.display = "none"), ms);
      });
      return this;
    }
    fadeIn(ms = 200) {
      this.els.forEach((el) => {
        el.style.display = "";
        el.style.transition = `opacity ${ms}ms`;
        el.style.opacity = "0";
        window.requestAnimationFrame(() => (el.style.opacity = "1"));
      });
      return this;
    }
    fadeToggle(ms = 200) {
      this.els.forEach((el) =>
        window.getComputedStyle(el).display === "none"
          ? new Bridgey(el).fadeIn(ms)
          : new Bridgey(el).fadeOut(ms)
      );
      return this;
    }
    // 高さアニメの開閉(jQuery定番)
    slideDown(ms = 200) {
      this.els.forEach((el) => {
        if (window.getComputedStyle(el).display === "none") el.style.display = "";
        const h = el.scrollHeight;
        el.style.overflow = "hidden";
        el.style.height = "0px";
        el.style.transition = `height ${ms}ms`;
        window.requestAnimationFrame(() => (el.style.height = h + "px"));
        setTimeout(() => {
          el.style.removeProperty("height");
          el.style.removeProperty("overflow");
          el.style.removeProperty("transition");
        }, ms);
      });
      return this;
    }
    slideUp(ms = 200) {
      this.els.forEach((el) => {
        el.style.overflow = "hidden";
        el.style.height = el.scrollHeight + "px";
        el.style.transition = `height ${ms}ms`;
        window.requestAnimationFrame(() => (el.style.height = "0px"));
        setTimeout(() => {
          el.style.display = "none";
          el.style.removeProperty("height");
          el.style.removeProperty("overflow");
          el.style.removeProperty("transition");
        }, ms);
      });
      return this;
    }
    slideToggle(ms = 200) {
      this.els.forEach((el) =>
        window.getComputedStyle(el).display === "none"
          ? new Bridgey(el).slideDown(ms)
          : new Bridgey(el).slideUp(ms)
      );
      return this;
    }
    css(name, v) {
      if (name && typeof name === "object") {
        this.els.forEach((el) => Object.assign(el.style, name));
        return this;
      }
      if (v === undefined) return this.el ? window.getComputedStyle(this.el)[name] : undefined;
      this.els.forEach((el) => (el.style[name] = v));
      return this;
    }
    prop(name, v) {
      if (v === undefined) return this.el ? this.el[name] : undefined;
      this.els.forEach((el) => (el[name] = v));
      return this;
    }
    hasClass(c) {
      return this.el ? this.el.classList.contains(c) : false;
    }
    is(sel) {
      return this.els.some((el) => el.matches(sel));
    }
    data(key, v) {
      if (v === undefined) return this.el ? this.el.dataset[key] : undefined;
      this.els.forEach((el) => (el.dataset[key] = v));
      return this;
    }

    // --- jQuery定番: フォームのシリアライズ -------------------------------
    // フォーム要素なら .elements を、フィールドならそのものを対象にする
    _fields() {
      const out = [];
      this.els.forEach((el) => (el.elements ? out.push(...el.elements) : out.push(el)));
      return out;
    }
    /** 送信対象のフィールドを [{name, value}] で返す(jQuery .serializeArray 相当)。 */
    serializeArray() {
      const skip = new Set(["submit", "button", "reset", "file", "image"]);
      const pairs = [];
      this._fields().forEach((el) => {
        const name = el.name;
        if (!name || el.disabled || skip.has(el.type)) return;
        if ((el.type === "checkbox" || el.type === "radio") && !el.checked) return;
        if (el.tagName === "SELECT" && el.multiple) {
          [...el.selectedOptions].forEach((o) => pairs.push({ name, value: o.value }));
        } else {
          pairs.push({ name, value: el.value });
        }
      });
      return pairs;
    }
    /** クエリ文字列を返す(jQuery .serialize 相当)。 例) "name=太郎&agree=on" */
    serialize() {
      return this.serializeArray()
        .map(({ name, value }) => encodeURIComponent(name) + "=" + encodeURIComponent(value))
        .join("&");
    }

    // --- jQuery定番: 追加/削除 --------------------------------------------
    prepend(htmlOrNode) {
      this.els.forEach((el) => {
        if (typeof htmlOrNode === "string") el.insertAdjacentHTML("afterbegin", htmlOrNode);
        else el.insertBefore(htmlOrNode, el.firstChild);
      });
      return this;
    }
    before(html) {
      this.els.forEach((el) => el.insertAdjacentHTML("beforebegin", html));
      return this;
    }
    after(html) {
      this.els.forEach((el) => el.insertAdjacentHTML("afterend", html));
      return this;
    }
    remove() {
      this.els.forEach((el) => el.remove());
      this.els = [];
      return this;
    }

    // --- jQuery定番: 走査 -------------------------------------------------
    parent() {
      return new Bridgey(this.els.map((el) => el.parentElement).filter(Boolean));
    }
    closest(sel) {
      return new Bridgey(this.els.map((el) => el.closest(sel)).filter(Boolean));
    }
    children(sel) {
      return new Bridgey(
        this.els.flatMap((el) => [...el.children].filter((c) => !sel || c.matches(sel)))
      );
    }
    next() {
      return new Bridgey(this.els.map((el) => el.nextElementSibling).filter(Boolean));
    }
    prev() {
      return new Bridgey(this.els.map((el) => el.previousElementSibling).filter(Boolean));
    }
    siblings(sel) {
      return new Bridgey(
        this.els.flatMap((el) =>
          [...(el.parentElement?.children || [])].filter(
            (c) => c !== el && (!sel || c.matches(sel))
          )
        )
      );
    }

    // --- jQuery定番: 絞り込み ---------------------------------------------
    first() {
      return new Bridgey(this.el ? [this.el] : []);
    }
    last() {
      return new Bridgey(this.els.length ? [this.els[this.els.length - 1]] : []);
    }
    eq(i) {
      const el = this.els.at(i);
      return new Bridgey(el ? [el] : []);
    }
    filter(sel) {
      return new Bridgey(
        this.els.filter((el) => (typeof sel === "function" ? sel(el) : el.matches(sel)))
      );
    }
    not(sel) {
      return new Bridgey(this.els.filter((el) => !el.matches(sel)));
    }
    add(other) {
      const more =
        other instanceof Bridgey
          ? other.els
          : typeof other === "string"
          ? [...document.querySelectorAll(other)]
          : other?.nodeType
          ? [other]
          : [];
      return new Bridgey([...this.els, ...more]);
    }
    index() {
      if (!this.el) return -1;
      return [...(this.el.parentElement?.children || [])].indexOf(this.el);
    }
    map(fn) {
      return this.els.map((el, i) => fn.call(el, el, i));
    }

    // --- jQuery定番: 生成/差し替え/寸法 -----------------------------------
    removeAttr(name) {
      this.els.forEach((el) => el.removeAttribute(name));
      return this;
    }
    replaceWith(html) {
      this.els.forEach((el) => {
        if (typeof html === "string") el.outerHTML = html;
        else el.replaceWith(html);
      });
      return this;
    }
    clone() {
      return new Bridgey(this.els.map((el) => el.cloneNode(true)));
    }
    appendTo(target) {
      const t = target instanceof Bridgey ? target.el : typeof target === "string" ? document.querySelector(target) : target;
      this.els.forEach((el) => t && t.appendChild(el));
      return this;
    }
    prependTo(target) {
      const t = target instanceof Bridgey ? target.el : typeof target === "string" ? document.querySelector(target) : target;
      this.els.forEach((el) => t && t.insertBefore(el, t.firstChild));
      return this;
    }
    detach() {
      this.els.forEach((el) => el.remove()); // remove と違い els は保持(再挿入できる)
      return this;
    }
    width() {
      return this.el ? this.el.getBoundingClientRect().width : undefined;
    }
    height() {
      return this.el ? this.el.getBoundingClientRect().height : undefined;
    }
    scrollTop(v) {
      if (v === undefined) return this.el ? this.el.scrollTop : undefined;
      this.els.forEach((el) => (el.scrollTop = v));
      return this;
    }
    offset() {
      if (!this.el) return undefined;
      const r = this.el.getBoundingClientRect();
      return { top: r.top + window.scrollY, left: r.left + window.scrollX };
    }

    // --- イベント(直接 & 委譲。off できるよう要素にリスナを記録) ----------
    // 複数イベントOK: on("click focus", fn)
    // 名前空間OK(jQuery流): on("click.myui", fn) → off(".myui") でまとめて解除
    on(events, selectorOrHandler, maybeHandler) {
      const direct = typeof selectorOrHandler === "function";
      const sel = direct ? null : selectorOrHandler;
      const handler = direct ? selectorOrHandler : maybeHandler;
      events.split(/\s+/).filter(Boolean).forEach((token) => {
        const { type, ns } = parseEvent(token);
        if (!type) return;
        this.els.forEach((el) => {
          const wrapped = direct
            ? handler
            : (e) => {
                const t = e.target.closest(sel);
                if (t && el.contains(t)) handler.call(t, e);
              };
          el.addEventListener(type, wrapped);
          (el.__bridgeListeners || (el.__bridgeListeners = [])).push({ event: type, ns, sel, handler, wrapped });
        });
      });
      return this;
    }

    /**
     * イベント解除。
     *   off()              全解除
     *   off("click")       click を全部
     *   off("click", fn)   click のうち fn を
     *   off(".myui")       名前空間 myui を全部(イベント種別問わず)
     *   off("click.myui")  click かつ myui
     */
    off(events, handler) {
      const specs = events ? events.split(/\s+/).filter(Boolean).map(parseEvent) : null;
      this.els.forEach((el) => {
        const list = el.__bridgeListeners || [];
        el.__bridgeListeners = list.filter((L) => {
          const hit =
            (!specs ||
              specs.some(
                (s) =>
                  (!s.type || s.type === L.event) &&
                  (s.ns.length === 0 || s.ns.every((n) => (L.ns || []).includes(n)))
              )) &&
            (!handler || L.handler === handler);
          if (hit) el.removeEventListener(L.event, L.wrapped);
          return !hit;
        });
      });
      return this;
    }

    /** 一度だけ発火するリスナ。 */
    one(events, handler) {
      events.split(/\s+/).filter(Boolean).forEach((token) => {
        const { type, ns } = parseEvent(token);
        if (!type) return;
        this.els.forEach((el) => {
          const wrapped = (e) => {
            el.removeEventListener(type, wrapped);
            handler.call(el, e);
          };
          el.addEventListener(type, wrapped);
          (el.__bridgeListeners || (el.__bridgeListeners = [])).push({ event: type, ns, handler, wrapped });
        });
      });
      return this;
    }

    /** イベントを発火(名前空間は無視して種別で発火)。 */
    trigger(event, detail) {
      const { type } = parseEvent(event);
      this.els.forEach((el) =>
        el.dispatchEvent(new window.CustomEvent(type, { bubbles: true, detail }))
      );
      return this;
    }

    // --- jQuery定番: イベント短縮(引数ありでバインド / 無しで発火) ---------
    //   $$("#b").click(fn)  … bind      $$("#b").click()  … trigger
    hover(enter, leave) {
      return this.on("mouseenter", enter).on("mouseleave", leave || enter);
    }
    ready(fn) {
      if (document.readyState !== "loading") fn();
      else document.addEventListener("DOMContentLoaded", () => fn());
      return this;
    }

    // --- リアクティブ束縛(命令的グルーを state に繋ぐ入口) -----------------
    // すべて購読解除関数を _disposers に積む → dispose() でまとめて解除(④対策)。

    _track(unsub) {
      if (typeof unsub === "function") this._disposers.push(unsub);
    }

    /** テキストをstateに束縛。state変化で自動更新。 */
    bindText(st, format = (v) => v) {
      this._track(
        st.subscribe((v) => this.els.forEach((el) => (el.textContent = format(v))))
      );
      return this;
    }

    /** class の付与をstateに束縛(真偽で付け外し)。 */
    bindClass(className, st, predicate = (v) => !!v) {
      this._track(
        st.subscribe((v) =>
          this.els.forEach((el) => el.classList.toggle(className, predicate(v)))
        )
      );
      return this;
    }

    /** 属性をstateに束縛。 */
    bindAttr(name, st, format = (v) => v) {
      this._track(
        st.subscribe((v) => this.els.forEach((el) => el.setAttribute(name, format(v))))
      );
      return this;
    }

    /** input を state に双方向束縛(state→DOM, input→state)。 */
    bindValue(st) {
      this._track(
        st.subscribe((v) =>
          this.els.forEach((el) => {
            if (el.value !== v) el.value = v;
          })
        )
      );
      this.els.forEach((el) =>
        el.addEventListener("input", () => (st.value = el.value))
      );
      return this;
    }

    /** このラッパーが張った購読を全解除(ページ破棄・部分更新時のリーク対策)。 */
    dispose() {
      this._disposers.forEach((unsub) => unsub());
      this._disposers = [];
      return this;
    }
  }

  // jQuery流のイベント短縮メソッドを一括生成。
  //   $$("#b").click(fn) … バインド    $$("#b").click() … 発火
  [
    "click", "dblclick", "change", "submit", "keydown", "keyup", "keypress",
    "mousedown", "mouseup", "mouseenter", "mouseleave", "mouseover", "mouseout",
    "input", "scroll", "contextmenu",
  ].forEach((ev) => {
    Bridgey.prototype[ev] = function (handler) {
      return handler ? this.on(ev, handler) : this.trigger(ev);
    };
  });

  // "click.myui.foo" → { type: "click", ns: ["myui","foo"] }  / ".myui" → { type:"", ns:["myui"] }
  function parseEvent(token) {
    const [type, ...ns] = token.split(".");
    return { type, ns };
  }

  // append/prepend 等が受け取る「ノード列」に正規化(Bridgey/配列/ノード)。文字列は null。
  function toNodes(content) {
    if (content instanceof Bridgey) return content.els.slice();
    if (Array.isArray(content)) return content.flatMap((c) => toNodes(c) || []);
    if (content && content.nodeType) return [content];
    return null; // 文字列(HTML)は呼び出し側で insertAdjacentHTML
  }

  /**
   * jQueryの $ 相当。名前衝突を避けて $$ を既定にする。
   *   $$("#id")            … セレクタ
   *   $$("<li>…</li>")     … HTML生成
   *   $$(node) / $$(list)  … ノード/配列/NodeList/jQueryオブジェクト
   *   $$(fn)               … DOM ready ($(function(){…}) の手癖)
   */
  function $$(selector) {
    if (typeof selector === "function") {
      const fn = selector;
      if (document.readyState !== "loading") fn();
      else document.addEventListener("DOMContentLoaded", () => fn());
      return new Bridgey(document);
    }
    return new Bridgey(selector);
  }

  // jQueryプラグインの書き味で「自作の」拡張を書く場所。
  // 注意: 既存のjQueryプラグイン(slick等)がそのまま動くわけではない(本物のjQueryに依存するため)。
  $$.fn = Bridgey.prototype;

  // -----------------------------------------------------------------------------
  // $$.ajax / $$.get / $$.post — fetch の薄いjQuery風ラッパ
  //   Promise を返しつつ、jQuery流の .done() / .fail() / .always() も生やす。
  //   $$.get("/api/users").then(us => ...) / .done(us => ...)
  //   $$.get("/x", data => ...)                 ← コールバック形もOK
  //   $$.post("/api/todos", { text }).done(...).fail(...)
  // data がオブジェクトなら JSON 送信。応答は content-type が JSON なら自動パース。
  // -----------------------------------------------------------------------------
  async function coreAjax(url, options = {}) {
    const { method = "GET", data, headers = {}, type } = options;
    const opts = { method, headers: { ...headers } };
    if (data != null) {
      if (typeof data === "object" && !(data instanceof FormData)) {
        if (!opts.headers["Content-Type"]) opts.headers["Content-Type"] = "application/json";
        opts.body = JSON.stringify(data);
      } else {
        opts.body = data;
      }
    }
    const res = await fetch(url, opts);
    if (!res.ok) throw new Error(`[bridgey] ${res.status} ${res.statusText}`);
    if (type === "text") return res.text();
    const ct = res.headers.get("content-type") || "";
    return ct.includes("application/json") ? res.json() : res.text();
  }

  // Promise に jQuery流の .done/.fail/.always を生やす(同じPromiseを返しチェーン可)
  function withCallbacks(promise) {
    promise.done = (fn) => (promise.then(fn), promise);
    promise.fail = (fn) => (promise.catch(fn), promise);
    promise.always = (fn) => (promise.finally(fn), promise);
    return promise;
  }

  $$.ajax = (url, options) => withCallbacks(coreAjax(url, options));

  // $$.get(url) / $$.get(url, cb) / $$.get(url, options) / $$.get(url, options, cb)
  $$.get = (url, a, b) => {
    const cb = typeof a === "function" ? a : typeof b === "function" ? b : null;
    const options = a && typeof a === "object" ? a : {};
    const p = $$.ajax(url, { ...options, method: "GET" });
    if (cb) p.then(cb);
    return p;
  };
  // $$.post(url, data) / (url, data, cb) / (url, data, options) / (url, cb)
  $$.post = (url, data, a, b) => {
    const dataIsCb = typeof data === "function";
    const cb = dataIsCb ? data : typeof a === "function" ? a : typeof b === "function" ? b : null;
    const options = a && typeof a === "object" ? a : {};
    const p = $$.ajax(url, { ...options, method: "POST", data: dataIsCb ? undefined : data });
    if (cb) p.then(cb);
    return p;
  };

  // -----------------------------------------------------------------------------
  // 静的ユーティリティ($.extend / $.each / $.map / $.trim 相当)
  // -----------------------------------------------------------------------------
  $$.extend = function (...args) {
    let deep = false, i = 0;
    if (typeof args[0] === "boolean") { deep = args[0]; i = 1; }
    const target = args[i] || {};
    for (i += 1; i < args.length; i++) {
      const src = args[i];
      if (!src) continue;
      for (const key of Object.keys(src)) {
        const v = src[key];
        if (deep && v && typeof v === "object" && !Array.isArray(v)) {
          const base = target[key] && typeof target[key] === "object" ? target[key] : {};
          target[key] = $$.extend(true, base, v);
        } else {
          target[key] = v;
        }
      }
    }
    return target;
  };

  // $$.each(coll, (index|key, value) => ...) — false を返すと中断(jQuery互換)
  $$.each = function (coll, fn) {
    if (Array.isArray(coll) || (coll && typeof coll.length === "number")) {
      for (let i = 0; i < coll.length; i++) if (fn.call(coll[i], i, coll[i]) === false) break;
    } else {
      for (const k of Object.keys(coll || {})) if (fn.call(coll[k], k, coll[k]) === false) break;
    }
    return coll;
  };

  // $$.map(coll, (value, index|key) => ...) — null/undefined は除外(jQuery互換)
  $$.map = function (coll, fn) {
    const out = [];
    if (Array.isArray(coll) || (coll && typeof coll.length === "number")) {
      for (let i = 0; i < coll.length; i++) { const r = fn(coll[i], i); if (r != null) out.push(r); }
    } else {
      for (const k of Object.keys(coll || {})) { const r = fn(coll[k], k); if (r != null) out.push(r); }
    }
    return out;
  };

  $$.trim = (s) => String(s == null ? "" : s).trim();

  // mount.js — 薄いライフサイクル。⑤「薄いヘルパー+最小ライフサイクル」の核。
  //
  // 【重要: エンジンに委譲する】
  //   mount はSvelte決め打ちにしない。現在のエンジン(engine())の mount() に委ねる。
  //   → 将来 Vue エンジンに差し替えても、利用者の mount(Component,...) は変えなくていい。
  //     これが「もう新しいフレームワークに翻弄されない」の実体。
  //
  // 使い方(利用者から見たAPIはエンジンに依らず一定):
  //   const app = mount(App, { target: "#app", props: { name: "bridgey" } });
  //   app.set({ name: "world" });   // props更新
  //   app.on("submit", (e) => ...); // コンポーネントのイベント購読
  //   app.destroy();                // 購読もDOMもエンジンが自動片付け(④/⑤が消える)


  function mount(Component, options = {}) {
    const eng = engine();
    if (typeof eng.mount !== "function") {
      throw new Error(
        `[bridgey] 現在のエンジン(${eng.name || "?"})は mount() 未対応です`
      );
    }
    const target =
      typeof options.target === "string"
        ? document.querySelector(options.target)
        : options.target || document.body;

    return eng.mount(Component, { ...options, target });
  }

  /** @returns {void} */
  function noop() {}

  function run(fn) {
  	return fn();
  }

  /**
   * @param {Function[]} fns
   * @returns {void}
   */
  function run_all(fns) {
  	fns.forEach(run);
  }

  /**
   * @param {any} thing
   * @returns {thing is Function}
   */
  function is_function(thing) {
  	return typeof thing === 'function';
  }

  /** @returns {boolean} */
  function safe_not_equal(a, b) {
  	return a != a ? b == b : a !== b || (a && typeof a === 'object') || typeof a === 'function';
  }

  function subscribe(store, ...callbacks) {
  	if (store == null) {
  		for (const callback of callbacks) {
  			callback(undefined);
  		}
  		return noop;
  	}
  	const unsub = store.subscribe(...callbacks);
  	return unsub.unsubscribe ? () => unsub.unsubscribe() : unsub;
  }

  /**
   * Get the current value from a store by subscribing and immediately unsubscribing.
   *
   * https://svelte.dev/docs/svelte-store#get
   * @template T
   * @param {import('../store/public.js').Readable<T>} store
   * @returns {T}
   */
  function get_store_value(store) {
  	let value;
  	subscribe(store, (_) => (value = _))();
  	return value;
  }

  const subscriber_queue = [];

  /**
   * Creates a `Readable` store that allows reading by subscription.
   *
   * https://svelte.dev/docs/svelte-store#readable
   * @template T
   * @param {T} [value] initial value
   * @param {import('./public.js').StartStopNotifier<T>} [start]
   * @returns {import('./public.js').Readable<T>}
   */
  function readable(value, start) {
  	return {
  		subscribe: writable(value, start).subscribe
  	};
  }

  /**
   * Create a `Writable` store that allows both updating and reading by subscription.
   *
   * https://svelte.dev/docs/svelte-store#writable
   * @template T
   * @param {T} [value] initial value
   * @param {import('./public.js').StartStopNotifier<T>} [start]
   * @returns {import('./public.js').Writable<T>}
   */
  function writable(value, start = noop) {
  	/** @type {import('./public.js').Unsubscriber} */
  	let stop;
  	/** @type {Set<import('./private.js').SubscribeInvalidateTuple<T>>} */
  	const subscribers = new Set();
  	/** @param {T} new_value
  	 * @returns {void}
  	 */
  	function set(new_value) {
  		if (safe_not_equal(value, new_value)) {
  			value = new_value;
  			if (stop) {
  				// store is ready
  				const run_queue = !subscriber_queue.length;
  				for (const subscriber of subscribers) {
  					subscriber[1]();
  					subscriber_queue.push(subscriber, value);
  				}
  				if (run_queue) {
  					for (let i = 0; i < subscriber_queue.length; i += 2) {
  						subscriber_queue[i][0](subscriber_queue[i + 1]);
  					}
  					subscriber_queue.length = 0;
  				}
  			}
  		}
  	}

  	/**
  	 * @param {import('./public.js').Updater<T>} fn
  	 * @returns {void}
  	 */
  	function update(fn) {
  		set(fn(value));
  	}

  	/**
  	 * @param {import('./public.js').Subscriber<T>} run
  	 * @param {import('./private.js').Invalidator<T>} [invalidate]
  	 * @returns {import('./public.js').Unsubscriber}
  	 */
  	function subscribe(run, invalidate = noop) {
  		/** @type {import('./private.js').SubscribeInvalidateTuple<T>} */
  		const subscriber = [run, invalidate];
  		subscribers.add(subscriber);
  		if (subscribers.size === 1) {
  			stop = start(set, update) || noop;
  		}
  		run(value);
  		return () => {
  			subscribers.delete(subscriber);
  			if (subscribers.size === 0 && stop) {
  				stop();
  				stop = null;
  			}
  		};
  	}
  	return { set, update, subscribe };
  }

  /**
   * Derived value store by synchronizing one or more readable stores and
   * applying an aggregation function over its input values.
   *
   * https://svelte.dev/docs/svelte-store#derived
   * @template {import('./private.js').Stores} S
   * @template T
   * @overload
   * @param {S} stores - input stores
   * @param {(values: import('./private.js').StoresValues<S>, set: (value: T) => void, update: (fn: import('./public.js').Updater<T>) => void) => import('./public.js').Unsubscriber | void} fn - function callback that aggregates the values
   * @param {T} [initial_value] - initial value
   * @returns {import('./public.js').Readable<T>}
   */

  /**
   * Derived value store by synchronizing one or more readable stores and
   * applying an aggregation function over its input values.
   *
   * https://svelte.dev/docs/svelte-store#derived
   * @template {import('./private.js').Stores} S
   * @template T
   * @overload
   * @param {S} stores - input stores
   * @param {(values: import('./private.js').StoresValues<S>) => T} fn - function callback that aggregates the values
   * @param {T} [initial_value] - initial value
   * @returns {import('./public.js').Readable<T>}
   */

  /**
   * @template {import('./private.js').Stores} S
   * @template T
   * @param {S} stores
   * @param {Function} fn
   * @param {T} [initial_value]
   * @returns {import('./public.js').Readable<T>}
   */
  function derived(stores, fn, initial_value) {
  	const single = !Array.isArray(stores);
  	/** @type {Array<import('./public.js').Readable<any>>} */
  	const stores_array = single ? [stores] : stores;
  	if (!stores_array.every(Boolean)) {
  		throw new Error('derived() expects stores as input, got a falsy value');
  	}
  	const auto = fn.length < 2;
  	return readable(initial_value, (set, update) => {
  		let started = false;
  		const values = [];
  		let pending = 0;
  		let cleanup = noop;
  		const sync = () => {
  			if (pending) {
  				return;
  			}
  			cleanup();
  			const result = fn(single ? values[0] : values, set, update);
  			if (auto) {
  				set(result);
  			} else {
  				cleanup = is_function(result) ? result : noop;
  			}
  		};
  		const unsubscribers = stores_array.map((store, i) =>
  			subscribe(
  				store,
  				(value) => {
  					values[i] = value;
  					pending &= ~(1 << i);
  					if (started) {
  						sync();
  					}
  				},
  				() => {
  					pending |= 1 << i;
  				}
  			)
  		);
  		started = true;
  		sync();
  		return function stop() {
  			run_all(unsubscribers);
  			cleanup();
  			// We need to set this to false because callbacks can still happen despite having unsubscribed:
  			// Callbacks might already be placed in the queue which doesn't know it should no longer
  			// invoke this derived store.
  			started = false;
  		};
  	});
  }

  // engines/svelte.js
  // Svelteアダプタ ── 既定のリアクティビティ・エンジン。
  //
  // 中身は正真正銘 Svelte のランタイム(svelte/store)。
  // runes($state)はコンパイラ前提で単体では動かないが、store は実行時APIなので
  // バンドルして配布版 bridgey に同梱できる = 利用者は <script> 一本で入る。
  //
  // このファイルは「engine.js が定める Adapter 契約」を満たす一実装にすぎない。
  // 同じ契約を満たせば Vue でも Signals でも差し替えられる。


  // svelte store を Reactive 契約(get/set/update/subscribe)に包む
  function wrap(store) {
    return {
      _store: store, // computed(derived)構築用に内部保持
      get: () => get_store_value(store),
      set: (v) => {
        if (typeof store.set !== "function") {
          throw new Error("[bridgey] computed は読み取り専用です");
        }
        store.set(v);
      },
      update: (fn) => store.update(fn),
      subscribe: (cb) => store.subscribe(cb),
    };
  }

  const svelteEngine = {
    name: "svelte",

    state(initial) {
      return wrap(writable(initial));
    },

    // reactives: このエンジンが作った Reactive の配列
    computed(reactives, fn) {
      const stores = reactives.map((r) => r._store);
      return wrap(derived(stores, (values) => fn(...values)));
    },

    // 本物のSvelteコンポーネントを載せる/破棄する。
    //   Component はコンパイル済みSvelteクラス(.svelte を rollup-plugin-svelte でビルドしたもの)。
    //   Svelteがリアクティブ更新・DOM差分・購読解除を全部やる = ②③④が消える。
    mount(Component, { target, props }) {
      const instance = new Component({ target, props: props || {} });
      return {
        instance,
        set: (p) => instance.$set(p), // props更新 → Svelteが必要な箇所だけ差分更新
        on: (ev, cb) => instance.$on(ev, cb), // コンポーネントの dispatch を購読
        destroy: () => instance.$destroy(), // 子・購読・DOMをSvelteが自動片付け(④/⑤)
      };
    },
  };

  // attach-global.js — <script>版で window に公開する共通処理。名前衝突に配慮。
  //
  // 方針(jQuery流):
  //   ・安定した名前空間 window.bridgey は必ず残す。衝突が怖ければ常にこれ経由で使える。
  //   ・利便性のため $$ / state / … も window に載せるが、上書き前の値は退避しておく。
  //   ・bridgey.noConflict() で元に戻して好きな名前に束ね直せる。
  //   ・bridgey.alias("名前") で任意名エイリアス(既存名は壊さない)。
  //
  // 現場が既に $$ を定義している場合(例: Prototype.js)への対策がこれ。

  const NAMES = ["$$", "state", "computed", "mount", "useEngine", "engine"];

  function attachGlobal(api) {
    if (typeof window === "undefined") return api;

    // 上書き前の値を退避(衝突復元用)
    const prev = {};
    for (const k of NAMES) prev[k] = window[k];
    const prevNs = window.bridgey;

    Object.assign(window, api);
    window.bridgey = api; // ← 安定名前空間。window.bridgey.$$ / bridgey.state で常に届く

    const restore = (k, v) => {
      if (v === undefined) delete window[k];
      else window[k] = v;
    };

    /**
     * 衝突回避。
     *   const b$ = bridgey.noConflict();      // $$ を元に戻し、bridgey の $$ を戻り値で受ける
     *   const B  = bridgey.noConflict(true);  // 触った全グローバルを元に戻し、api を返す
     */
    api.noConflict = function (all) {
      restore("$$", prev["$$"]);
      if (all) {
        NAMES.forEach((k) => restore(k, prev[k]));
        restore("bridgey", prevNs);
      }
      return all ? api : api.$$;
    };

    /** 任意名エイリアス。既存名があれば壊さず警告のみ。 例) bridgey.alias("jq") → window.jq */
    api.alias = function (name) {
      if (name in window && window[name] !== api.$$) {
        console.warn(`[bridgey] window.${name} は既に使われています。alias を中止しました。`);
        return api.$$;
      }
      window[name] = api.$$;
      return api.$$;
    };

    return api;
  }

  // global.js — 配布版(bridgey)のエントリ。
  //
  // <script src="bridgey.js"></script> を読み込むと、$$ / state / computed / mount /
  // useEngine がグローバル(window)で使える。ライブラリ本体は index.js(window非依存)。
  //
  // 注意: mount() は「コンパイル済みコンポーネント」を渡す前提なので、実運用では
  // 利用者側のビルド(.svelte/.vue のコンパイル)と併用する。$$ / state / computed は
  // 素の <script> でもそのまま使える。


  // グローバル配布版は「読み込むだけで使える」利便性を優先し、既定でSvelteを配線。
  // (ESMの import "bridgey" 経路はエンジンを巻き込まない = optional peer を保つ)
  useEngine(svelteEngine);

  const api = { $$, Bridgey, state, computed, mount, useEngine, engine, svelteEngine };

  // window へ公開(衝突退避 + noConflict/alias 付き)
  attachGlobal(api);

})();
