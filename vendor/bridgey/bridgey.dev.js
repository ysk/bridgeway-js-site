/*! bridgey v2.0.0-beta.1 | MIT License
 * jQuery の書き味で、モダンな状態管理。依存ゼロ・ビルド不要・CSPセーフ。
 */
"use strict";
(() => {
  var __defProp = Object.defineProperty;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

  // src/core/reactive.ts
  var activeSub = null;
  var activeScope = null;
  var batchDepth = 0;
  var flushScheduled = false;
  var queue = /* @__PURE__ */ new Set();
  var tickWaiters = [];
  function track(dep) {
    if (!activeSub) return;
    activeSub._deps.set(dep, dep.version);
    dep.subs.add(activeSub);
  }
  function propagate(dep) {
    for (const sub of dep.subs) {
      if (sub instanceof Effect) queue.add(sub);
      else propagate(sub);
    }
  }
  function scheduleFlush() {
    if (flushScheduled || batchDepth > 0) return;
    flushScheduled = true;
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => flush());
    else Promise.resolve().then(() => flush());
  }
  function flush() {
    flushScheduled = false;
    let guard = 0;
    while (queue.size) {
      if (++guard > 100) {
        queue.clear();
        console.warn(
          "[bridgey] 更新が収束しません(effect が自分の依存を書き換え続けている可能性)。無限ループを避けるため中断しました。"
        );
        break;
      }
      const running = [...queue];
      queue.clear();
      for (const e of running) e._runIfStale();
    }
    const waiters = tickWaiters;
    tickWaiters = [];
    for (const resolve of waiters) resolve();
  }
  function tick() {
    if (!queue.size && !flushScheduled) return Promise.resolve();
    scheduleFlush();
    return new Promise((resolve) => tickWaiters.push(resolve));
  }
  function batch(fn) {
    batchDepth++;
    try {
      return fn();
    } finally {
      batchDepth--;
      if (batchDepth === 0 && queue.size) scheduleFlush();
    }
  }
  function untrack(fn) {
    const prev = activeSub;
    activeSub = null;
    try {
      return fn();
    } finally {
      activeSub = prev;
    }
  }
  var Reactive = class {
    constructor() {
      __publicField(this, "subs", /* @__PURE__ */ new Set());
      __publicField(this, "version", 0);
    }
    /** 現在値を読む(依存として記録される)。 */
    get() {
      throw new Error("[bridgey] get() は継承側で実装します");
    }
    /** 購読せずに現在値を覗く。 */
    peek() {
      throw new Error("[bridgey] peek() は継承側で実装します");
    }
    /**
     * 値の変化を購読する(登録直後に現在値で1回呼ぶ = Svelte store と同じ作法)。
     * 戻り値は購読解除関数。DOM 束縛層はこれだけを使う。
     */
    subscribe(cb) {
      return effect(() => cb(this.get()));
    }
  };
  var Signal = class extends Reactive {
    constructor(initial) {
      super();
      __publicField(this, "_value");
      this._value = initial;
    }
    get() {
      track(this);
      return this._value;
    }
    peek() {
      return this._value;
    }
    set(next) {
      if (Object.is(next, this._value)) return;
      this._value = next;
      this.version++;
      propagate(this);
      if (queue.size) scheduleFlush();
    }
    update(fn) {
      this.set(fn(this._value));
    }
  };
  var Computed = class _Computed extends Reactive {
    constructor(fn) {
      super();
      __publicField(this, "fn");
      __publicField(this, "_value");
      __publicField(this, "_deps", /* @__PURE__ */ new Map());
      // dep -> 読んだ時点の version
      __publicField(this, "_ready", false);
      __publicField(this, "_computing", false);
      this.fn = fn;
    }
    get() {
      this._pull();
      track(this);
      return this._value;
    }
    peek() {
      this._pull();
      return this._value;
    }
    /** 必要なら再計算して自分を最新にする。 */
    _pull() {
      if (this._stale()) this._recompute();
    }
    _stale() {
      if (!this._ready) return true;
      for (const [dep, seen] of this._deps) {
        if (dep instanceof _Computed) dep._pull();
        if (dep.version !== seen) return true;
      }
      return false;
    }
    _recompute() {
      if (this._computing) {
        throw new Error("[bridgey] computed が自分自身を参照しています(循環依存)");
      }
      this._computing = true;
      const prevSub = activeSub;
      const prevDeps = this._deps;
      this._deps = /* @__PURE__ */ new Map();
      activeSub = this;
      let next;
      try {
        next = this.fn();
      } finally {
        activeSub = prevSub;
        this._computing = false;
        for (const dep of prevDeps.keys()) {
          if (!this._deps.has(dep)) dep.subs.delete(this);
        }
      }
      const first = !this._ready;
      this._ready = true;
      if (first || !Object.is(next, this._value)) {
        this._value = next;
        this.version++;
      }
    }
    /** 上流とのリンクを切る(scope 破棄時に呼ばれる)。 */
    dispose() {
      for (const dep of this._deps.keys()) dep.subs.delete(this);
      this._deps.clear();
      this._ready = false;
      this.subs.clear();
    }
  };
  var Effect = class {
    constructor(fn) {
      __publicField(this, "fn");
      __publicField(this, "_deps", /* @__PURE__ */ new Map());
      __publicField(this, "_cleanup", null);
      __publicField(this, "_disposed", false);
      this.fn = fn;
    }
    run() {
      if (this._disposed) return;
      if (this._cleanup) {
        const cleanup = this._cleanup;
        this._cleanup = null;
        cleanup();
      }
      const prevSub = activeSub;
      const prevDeps = this._deps;
      this._deps = /* @__PURE__ */ new Map();
      activeSub = this;
      try {
        const ret = this.fn();
        if (typeof ret === "function") this._cleanup = ret;
      } finally {
        activeSub = prevSub;
        for (const dep of prevDeps.keys()) {
          if (!this._deps.has(dep)) dep.subs.delete(this);
        }
      }
    }
    /** 上流が本当に変わっていれば実行する(グリッチ・無駄な再描画の抑止)。 */
    _runIfStale() {
      if (this._disposed) return;
      for (const [dep, seen] of this._deps) {
        if (dep instanceof Computed) dep._pull();
        if (dep.version !== seen) {
          this.run();
          return;
        }
      }
    }
    dispose() {
      if (this._disposed) return;
      this._disposed = true;
      queue.delete(this);
      if (this._cleanup) {
        const cleanup = this._cleanup;
        this._cleanup = null;
        cleanup();
      }
      for (const dep of this._deps.keys()) dep.subs.delete(this);
      this._deps.clear();
    }
  };
  var Scope = class {
    constructor(parent) {
      __publicField(this, "_disposers", []);
      __publicField(this, "_disposed", false);
      if (parent) parent.add(this);
    }
    add(disposable) {
      if (this._disposed) {
        disposeOf(disposable);
        return disposable;
      }
      this._disposers.push(disposable);
      return disposable;
    }
    /** この scope を現在の scope にして fn を実行する。 */
    run(fn) {
      const prev = activeScope;
      activeScope = this;
      try {
        return fn(this);
      } finally {
        activeScope = prev;
      }
    }
    dispose() {
      if (this._disposed) return;
      this._disposed = true;
      for (let i = this._disposers.length - 1; i >= 0; i--) {
        disposeOf(this._disposers[i]);
      }
      this._disposers.length = 0;
    }
  };
  function disposeOf(d) {
    if (!d) return;
    if (typeof d === "function") d();
    else if (typeof d.dispose === "function") d.dispose();
  }
  function signal(initial) {
    return new Signal(initial);
  }
  function computed(fn) {
    const c = new Computed(fn);
    if (activeScope) activeScope.add(c);
    return c;
  }
  function effect(fn) {
    const e = new Effect(fn);
    e.run();
    if (activeScope) activeScope.add(e);
    return () => e.dispose();
  }
  function currentScope() {
    return activeScope;
  }

  // src/core/handle.ts
  function toHandle(source, readonly = false) {
    const writable = !readonly && source instanceof Signal ? source : null;
    const handle = ((...args) => {
      if (args.length === 0) return source.get();
      if (!writable) {
        throw new Error("[bridgey] この状態は読み取り専用です(computed / resource の結果など)。");
      }
      const next = args[0];
      if (typeof next === "function") writable.update(next);
      else writable.set(next);
      return void 0;
    });
    Object.defineProperty(handle, "reactive", { value: source });
    handle.peek = () => source.peek();
    handle.subscribe = (cb) => source.subscribe(cb);
    handle[Symbol.toPrimitive] = () => source.get();
    return handle;
  }
  function toReadonly(source) {
    return toHandle(source, true);
  }
  function isState(v) {
    return typeof v === "function" && v.reactive instanceof Signal;
  }
  function readerOf(value) {
    if (typeof value === "function") return value;
    if (value instanceof Reactive) return () => value.get();
    return null;
  }

  // src/core/reconcile.ts
  function reconcile(input) {
    const { parent, keys, existing, create: create2, update } = input;
    const next = /* @__PURE__ */ new Map();
    keys.forEach((key, index) => {
      const found = existing.get(key);
      if (found) {
        existing.delete(key);
        update(found, index);
        next.set(key, found);
      } else {
        next.set(key, create2(key, index));
      }
    });
    for (const row of existing.values()) {
      row.dispose();
      row.node.remove();
    }
    existing.clear();
    let cursor = parent.firstElementChild;
    for (const key of keys) {
      const node = next.get(key).node;
      if (node === cursor) {
        cursor = cursor.nextElementSibling;
      } else {
        parent.insertBefore(node, cursor);
      }
    }
    return next;
  }
  function findDuplicateKey(keys) {
    const seen = /* @__PURE__ */ new Set();
    for (const key of keys) {
      if (seen.has(key)) return key;
      seen.add(key);
    }
    return null;
  }

  // src/core/ime.ts
  var composing = /* @__PURE__ */ new WeakSet();
  var watched = /* @__PURE__ */ new WeakSet();
  var endCallbacks = /* @__PURE__ */ new WeakMap();
  function isComposing(el) {
    return composing.has(el);
  }
  function watchComposition(el) {
    if (watched.has(el)) return;
    watched.add(el);
    endCallbacks.set(el, /* @__PURE__ */ new Set());
    el.addEventListener("compositionstart", () => composing.add(el));
    el.addEventListener("compositionend", () => {
      composing.delete(el);
      for (const callback of endCallbacks.get(el) ?? []) callback();
    });
  }
  function onCompositionEnd(el, callback) {
    watchComposition(el);
    const set = endCallbacks.get(el);
    set.add(callback);
    return () => set.delete(callback);
  }
  function writeValue(el, prop, value) {
    if (prop === "value" && composing.has(el)) return;
    el[prop] = value;
  }

  // src/compat.ts
  var STRUCTURE_HINT = 'HTML の構造に依存する書き方です。要素を1つ挟むだけで、例外も出ないまま静かに動かなくなります。\n  → 名前で引く方が壊れません: $$(this).closest("@row").find("@price")';
  function installCompat(BridgeyClass, dollar, deps) {
    const proto = BridgeyClass.prototype;
    const { hint: hint2, resolveSelector: resolveSelector2 } = deps;
    const wrap3 = (els, selector = null) => new BridgeyClass(els, selector);
    const elementsOf = (self) => self.els;
    proto.next = function(selector) {
      hint2("compat:next", `next() を使っています。${STRUCTURE_HINT}`);
      return wrap3(
        elementsOf(this).map((el) => nextMatching(el, selector, resolveSelector2)).filter(Boolean)
      );
    };
    proto.prev = function(selector) {
      hint2("compat:prev", `prev() を使っています。${STRUCTURE_HINT}`);
      return wrap3(
        elementsOf(this).map((el) => prevMatching(el, selector, resolveSelector2)).filter(Boolean)
      );
    };
    proto.nextAll = function() {
      hint2("compat:nextAll", `nextAll() を使っています。${STRUCTURE_HINT}`);
      return wrap3(elementsOf(this).flatMap((el) => siblingsAfter(el)));
    };
    proto.prevAll = function() {
      hint2("compat:prevAll", `prevAll() を使っています。${STRUCTURE_HINT}`);
      return wrap3(elementsOf(this).flatMap((el) => siblingsBefore(el)));
    };
    proto.siblings = function(selector) {
      hint2("compat:siblings", `siblings() を使っています。${STRUCTURE_HINT}`);
      const sel = selector ? resolveSelector2(selector) : null;
      return wrap3(
        elementsOf(this).flatMap(
          (el) => [...el.parentElement?.children ?? []].filter(
            (child) => child !== el && (!sel || child.matches(sel))
          )
        )
      );
    };
    proto.parents = function(selector) {
      const sel = selector ? resolveSelector2(selector) : null;
      const found = [];
      for (const el of elementsOf(this)) {
        let node = el.parentElement;
        while (node) {
          if ((!sel || node.matches(sel)) && !found.includes(node)) found.push(node);
          node = node.parentElement;
        }
      }
      if (sel) {
        hint2(
          "compat:parents",
          "parents(セレクタ) は closest(セレクタ) の方が速く、意図も明確です（最初の1つで止まる）。"
        );
      }
      return wrap3(found);
    };
    proto.eq = function(index) {
      hint2(
        "compat:eq",
        'eq(位置) を使っています。要素の順番が変わると別のものを掴みます。\n  → 名前で引く方が壊れません: $$("@row").filter((el) => el.dataset.id === id)'
      );
      const el = elementsOf(this).at(index);
      return wrap3(el ? [el] : []);
    };
    proto.index = function() {
      hint2(
        "compat:index",
        "index() で位置を取っています。並び順が変わると対応がズレます。\n  → data 属性で名前を持たせ、名前で対応付ける方が壊れません。"
      );
      const el = this.el;
      if (!el) return -1;
      return [...el.parentElement?.children ?? []].indexOf(el);
    };
    proto.filter = function(selector) {
      const test = typeof selector === "function" ? selector : (el) => el.matches(resolveSelector2(selector));
      return wrap3(elementsOf(this).filter((el, i) => test(el, i)));
    };
    proto.not = function(selector) {
      const sel = resolveSelector2(selector);
      return wrap3(elementsOf(this).filter((el) => !el.matches(sel)));
    };
    proto.has = function(selector) {
      const sel = resolveSelector2(selector);
      return wrap3(elementsOf(this).filter((el) => !!el.querySelector(sel)));
    };
    proto.add = function(other) {
      const more = other instanceof BridgeyClass ? other.els : typeof other === "string" ? [...document.querySelectorAll(resolveSelector2(other))] : other?.nodeType ? [other] : [];
      return wrap3([...elementsOf(this), ...more]);
    };
    proto.map = function(fn) {
      return elementsOf(this).map((el, i) => fn.call(el, el, i));
    };
    proto.nodes = function() {
      return elementsOf(this).slice();
    };
    proto.get = function(index) {
      return index === void 0 ? elementsOf(this).slice() : elementsOf(this).at(index);
    };
    const SHOW_HINT = "表示を命令的に切り替えています。\n  → .when(state) だと表示が状態から導出されるので、初期表示と更新がズレません。";
    proto.show = function() {
      hint2("compat:show", `show() を使っています。${SHOW_HINT}`);
      elementsOf(this).forEach((el) => el.style.display = "");
      return this;
    };
    proto.hide = function() {
      hint2("compat:hide", `hide() を使っています。${SHOW_HINT}`);
      elementsOf(this).forEach((el) => el.style.display = "none");
      return this;
    };
    proto.toggle = function(force) {
      hint2("compat:toggle", `toggle() を使っています。${SHOW_HINT}`);
      elementsOf(this).forEach((el) => {
        const willShow = force === void 0 ? isHidden(el) : force;
        el.style.display = willShow ? "" : "none";
      });
      return this;
    };
    const ANIM_HINT = 'アニメーションを JS で行っています。\n  → CSS の transition と .toggleClass("is-open", state) の方が滑らかで、状態と一致します。';
    proto.fadeIn = function(ms = 200) {
      hint2("compat:fade", `fadeIn() を使っています。${ANIM_HINT}`);
      elementsOf(this).forEach((el) => {
        el.style.opacity = "0";
        el.style.display = "";
        el.style.transition = `opacity ${ms}ms`;
        requestAnimationFrame(() => el.style.opacity = "1");
        window.setTimeout(() => {
          el.style.removeProperty("transition");
          el.style.removeProperty("opacity");
        }, ms);
      });
      return this;
    };
    proto.fadeOut = function(ms = 200) {
      hint2("compat:fade", `fadeOut() を使っています。${ANIM_HINT}`);
      elementsOf(this).forEach((el) => {
        el.style.transition = `opacity ${ms}ms`;
        el.style.opacity = "0";
        window.setTimeout(() => {
          el.style.display = "none";
          el.style.removeProperty("transition");
          el.style.removeProperty("opacity");
        }, ms);
      });
      return this;
    };
    proto.fadeToggle = function(ms = 200) {
      elementsOf(this).forEach((el) => {
        const one = wrap3([el]);
        if (isHidden(el)) one.fadeIn(ms);
        else one.fadeOut(ms);
      });
      return this;
    };
    proto.slideDown = function(ms = 200) {
      hint2("compat:slide", `slideDown() を使っています。${ANIM_HINT}`);
      elementsOf(this).forEach((el) => {
        if (isHidden(el)) el.style.display = "";
        const height = el.scrollHeight;
        el.style.overflow = "hidden";
        el.style.height = "0px";
        el.style.transition = `height ${ms}ms`;
        requestAnimationFrame(() => el.style.height = `${height}px`);
        window.setTimeout(() => {
          el.style.removeProperty("height");
          el.style.removeProperty("overflow");
          el.style.removeProperty("transition");
        }, ms);
      });
      return this;
    };
    proto.slideUp = function(ms = 200) {
      hint2("compat:slide", `slideUp() を使っています。${ANIM_HINT}`);
      elementsOf(this).forEach((el) => {
        el.style.overflow = "hidden";
        el.style.height = `${el.scrollHeight}px`;
        el.style.transition = `height ${ms}ms`;
        requestAnimationFrame(() => el.style.height = "0px");
        window.setTimeout(() => {
          el.style.display = "none";
          el.style.removeProperty("height");
          el.style.removeProperty("overflow");
          el.style.removeProperty("transition");
        }, ms);
      });
      return this;
    };
    proto.slideToggle = function(ms = 200) {
      elementsOf(this).forEach((el) => {
        const one = wrap3([el]);
        if (isHidden(el)) one.slideDown(ms);
        else one.slideUp(ms);
      });
      return this;
    };
    proto.prepend = function(content) {
      elementsOf(this).forEach((el) => {
        if (typeof content === "string") el.insertAdjacentHTML("afterbegin", content);
        else if (content?.nodeType) el.insertBefore(content, el.firstChild);
      });
      return this;
    };
    proto.before = function(content) {
      elementsOf(this).forEach((el) => {
        if (typeof content === "string") el.insertAdjacentHTML("beforebegin", content);
        else if (content?.nodeType) el.parentNode?.insertBefore(content, el);
      });
      return this;
    };
    proto.after = function(content) {
      elementsOf(this).forEach((el) => {
        if (typeof content === "string") el.insertAdjacentHTML("afterend", content);
        else if (content?.nodeType) el.after(content);
      });
      return this;
    };
    proto.replaceWith = function(content) {
      elementsOf(this).forEach((el) => {
        if (typeof content === "string") el.outerHTML = content;
        else if (content?.nodeType) el.replaceWith(content);
      });
      return this;
    };
    proto.clone = function() {
      return wrap3(elementsOf(this).map((el) => el.cloneNode(true)));
    };
    proto.detach = function() {
      elementsOf(this).forEach((el) => el.remove());
      return this;
    };
    proto.appendTo = function(target) {
      const node = targetOf(target, BridgeyClass, resolveSelector2);
      elementsOf(this).forEach((el) => node?.appendChild(el));
      return this;
    };
    proto.prependTo = function(target) {
      const node = targetOf(target, BridgeyClass, resolveSelector2);
      elementsOf(this).forEach((el) => node?.insertBefore(el, node.firstChild));
      return this;
    };
    proto.wrap = function(html) {
      elementsOf(this).forEach((el) => {
        const tpl = el.ownerDocument.createElement("template");
        tpl.innerHTML = html.trim();
        const wrapper = tpl.content.firstElementChild;
        if (!wrapper) return;
        el.parentNode?.insertBefore(wrapper, el);
        wrapper.appendChild(el);
      });
      return this;
    };
    proto.width = function() {
      return this.el?.getBoundingClientRect().width;
    };
    proto.height = function() {
      return this.el?.getBoundingClientRect().height;
    };
    proto.offset = function() {
      const el = this.el;
      if (!el) return void 0;
      const rect = el.getBoundingClientRect();
      return { top: rect.top + window.scrollY, left: rect.left + window.scrollX };
    };
    proto.position = function() {
      const el = this.el;
      return el ? { top: el.offsetTop, left: el.offsetLeft } : void 0;
    };
    proto.scrollTop = function(value) {
      if (value === void 0) return this.el?.scrollTop;
      elementsOf(this).forEach((el) => el.scrollTop = value);
      return this;
    };
    proto.serializeArray = function() {
      const skip = /* @__PURE__ */ new Set(["submit", "button", "reset", "file", "image"]);
      const pairs = [];
      for (const el of formFields(elementsOf(this))) {
        const field = el;
        if (!field.name || field.disabled || skip.has(field.type)) continue;
        if ((field.type === "checkbox" || field.type === "radio") && !field.checked) continue;
        if (field.tagName === "SELECT" && field.multiple) {
          for (const option of field.selectedOptions) {
            pairs.push({ name: field.name, value: option.value });
          }
        } else {
          pairs.push({ name: field.name, value: field.value });
        }
      }
      return pairs;
    };
    proto.serialize = function() {
      return this.serializeArray().map(({ name, value }) => `${encodeURIComponent(name)}=${encodeURIComponent(value)}`).join("&");
    };
    proto.one = function(events, handler) {
      for (const type of events.split(/\s+/).filter(Boolean)) {
        elementsOf(this).forEach((el) => el.addEventListener(type, handler, { once: true }));
      }
      return this;
    };
    proto.trigger = function(event, detail) {
      elementsOf(this).forEach(
        (el) => el.dispatchEvent(new CustomEvent(event, { bubbles: true, cancelable: true, detail }))
      );
      return this;
    };
    proto.hover = function(enter, leave) {
      return this.on("mouseenter", enter).on("mouseleave", leave ?? enter);
    };
    proto.ready = function(fn) {
      if (document.readyState !== "loading") fn();
      else document.addEventListener("DOMContentLoaded", () => fn(), { once: true });
      return this;
    };
    const AJAX_HINT = "通信の競合を防げません。連続で呼ぶと、遅い応答が後で届いて古い内容が表示されます。\n  → $$.resource(source, fetcher) なら前のリクエストを自動で中断し、古い応答を捨てます。\n  → 送信ボタンには $$.action(fn) を使うと二重送信も防げます。";
    async function coreAjax(url, options = {}) {
      const { method = "GET", data, headers = {}, type, signal: signal2 } = options;
      const init = { method, headers: { ...headers }, signal: signal2 };
      if (data != null) {
        if (typeof data === "object" && !(data instanceof FormData)) {
          const merged = init.headers;
          if (!merged["Content-Type"]) merged["Content-Type"] = "application/json";
          init.body = JSON.stringify(data);
        } else {
          init.body = data;
        }
      }
      const res = await fetch(url, init);
      if (!res.ok) throw new Error(`[bridgey] ${res.status} ${res.statusText}`);
      if (type === "text") return res.text();
      const contentType = res.headers.get("content-type") ?? "";
      return contentType.includes("application/json") ? res.json() : res.text();
    }
    function withCallbacks(promise) {
      const target = promise;
      target.done = (fn) => (promise.then(fn), target);
      target.fail = (fn) => (promise.catch(fn), target);
      target.always = (fn) => (promise.finally(fn), target);
      return target;
    }
    dollar.ajax = (url, options) => {
      hint2("compat:ajax", `$$.ajax() を使っています。${AJAX_HINT}`);
      return withCallbacks(coreAjax(url, options));
    };
    dollar.get = (url, a, b) => {
      hint2("compat:ajax", `$$.get() を使っています。${AJAX_HINT}`);
      const callback = typeof a === "function" ? a : typeof b === "function" ? b : null;
      const options = a && typeof a === "object" ? a : {};
      const promise = withCallbacks(coreAjax(url, { ...options, method: "GET" }));
      if (callback) promise.then(callback);
      return promise;
    };
    dollar.post = (url, data, a, b) => {
      hint2("compat:ajax", `$$.post() を使っています。${AJAX_HINT}`);
      const dataIsCallback = typeof data === "function";
      const callback = dataIsCallback ? data : typeof a === "function" ? a : typeof b === "function" ? b : null;
      const options = a && typeof a === "object" ? a : {};
      const promise = withCallbacks(
        coreAjax(url, { ...options, method: "POST", data: dataIsCallback ? void 0 : data })
      );
      if (callback) promise.then(callback);
      return promise;
    };
    dollar.trim = (value) => String(value ?? "").trim();
    dollar.isArray = (value) => Array.isArray(value);
    dollar.isFunction = (value) => typeof value === "function";
    dollar.noop = () => {
    };
  }
  function isHidden(el) {
    return window.getComputedStyle(el).display === "none";
  }
  function nextMatching(el, selector, resolve) {
    let node = el.nextElementSibling;
    if (!selector) return node;
    const sel = resolve(selector);
    while (node && !node.matches(sel)) node = node.nextElementSibling;
    return node;
  }
  function prevMatching(el, selector, resolve) {
    let node = el.previousElementSibling;
    if (!selector) return node;
    const sel = resolve(selector);
    while (node && !node.matches(sel)) node = node.previousElementSibling;
    return node;
  }
  function siblingsAfter(el) {
    const out = [];
    let node = el.nextElementSibling;
    while (node) {
      out.push(node);
      node = node.nextElementSibling;
    }
    return out;
  }
  function siblingsBefore(el) {
    const out = [];
    let node = el.previousElementSibling;
    while (node) {
      out.unshift(node);
      node = node.previousElementSibling;
    }
    return out;
  }
  function targetOf(target, BridgeyClass, resolve) {
    if (target instanceof BridgeyClass) return target.el;
    if (typeof target === "string") return document.querySelector(resolve(target));
    return target?.nodeType ? target : null;
  }
  function formFields(els) {
    const out = [];
    for (const el of els) {
      const form2 = el;
      if (form2.elements) out.push(...Array.from(form2.elements));
      else out.push(el);
    }
    return out;
  }

  // src/resource.ts
  function resource(a, b, c) {
    const hasSource = typeof b === "function";
    const read2 = hasSource ? readerOf(a) ?? (() => a) : null;
    const fetcher = hasSource ? b : a;
    const options = (hasSource ? c : b) ?? {};
    const keepPrevious = options.keepPrevious !== false;
    const debounceMs = options.debounce ?? 0;
    const data = signal(void 0);
    const error = signal(void 0);
    const loading = signal(false);
    let controller = null;
    let timer = null;
    let sequence = 0;
    let waiters = [];
    let started = false;
    function settle() {
      const list = waiters;
      waiters = [];
      for (const resolve of list) resolve();
    }
    function abort() {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      controller?.abort();
      controller = null;
      if (loading.peek()) loading.set(false);
      settle();
    }
    async function run(value) {
      const mine = ++sequence;
      controller?.abort();
      const ctrl = new AbortController();
      controller = ctrl;
      started = true;
      loading.set(true);
      if (!keepPrevious) data.set(void 0);
      try {
        const result = await fetcher(value, ctrl.signal);
        if (mine !== sequence) return;
        error.set(void 0);
        data.set(result);
      } catch (e) {
        if (mine !== sequence) return;
        if (isAbort(e)) return;
        error.set(e);
      } finally {
        if (mine === sequence) {
          controller = null;
          loading.set(false);
          settle();
        }
      }
    }
    function schedule(value) {
      if (timer !== null) clearTimeout(timer);
      if (debounceMs > 0) {
        loading.set(true);
        timer = setTimeout(() => {
          timer = null;
          void run(value);
        }, debounceMs);
      } else {
        void run(value);
      }
    }
    if (read2) {
      effect(() => {
        const value = read2();
        if (!started && options.immediate === false) {
          started = true;
          return;
        }
        schedule(value);
      });
    } else if (options.immediate !== false) {
      schedule(void 0);
    }
    currentScope()?.add(() => abort());
    return {
      data: toReadonly(data),
      loading: toReadonly(loading),
      error: toReadonly(error),
      refetch: () => schedule(read2 ? read2() : void 0),
      abort,
      ready: () => {
        if (!loading.peek() && started) return Promise.resolve(data.peek());
        return new Promise((resolve) => waiters.push(() => resolve(data.peek())));
      }
    };
  }
  function isAbort(e) {
    return !!e && typeof e === "object" && e.name === "AbortError";
  }
  function action(fn) {
    const running = signal(false);
    const error = signal(void 0);
    const call = (async (...args) => {
      if (running.peek()) return;
      running.set(true);
      error.set(void 0);
      try {
        await fn(...args);
      } catch (e) {
        error.set(e);
      } finally {
        running.set(false);
      }
    });
    call.running = toReadonly(running);
    call.error = toReadonly(error);
    return call;
  }

  // src/component.ts
  var registry = /* @__PURE__ */ new Map();
  var healthy = /* @__PURE__ */ new Set();
  var attrName = "data-component";
  var observer = null;
  var wrap = (el) => el;
  var warnSink = (m) => console.warn(m);
  function configureComponents(options) {
    if (options.wrap) wrap = options.wrap;
    if (options.warn) warnSink = options.warn;
  }
  function componentAttr(next) {
    if (typeof next === "string") attrName = next;
    return attrName;
  }
  function component(name, setup) {
    registry.set(name, setup);
    if (typeof document === "undefined") return;
    startObserver();
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => scan(document.body), { once: true });
    } else if (document.body) {
      scan(document.body);
    }
  }
  function mount(root) {
    if (typeof document === "undefined") return;
    scan(root ?? document.body);
  }
  function unmount(root) {
    const target = root ?? (typeof document === "undefined" ? null : document.body);
    if (target) unmountTree(target);
  }
  function mountOne(el, name, props) {
    applyOne(el, name, props);
  }
  function scan(root) {
    if (!root) return;
    if (root.nodeType === 1 && root.hasAttribute(attrName)) applyAll(root);
    for (const el of root.querySelectorAll(`[${attrName}]`)) applyAll(el);
  }
  function applyAll(el) {
    const list = (el.getAttribute(attrName) || "").split(/\s+/).filter(Boolean);
    for (const name of list) applyOne(el, name);
  }
  function applyOne(el, name, extraProps) {
    const setup = registry.get(name);
    if (!setup) return;
    const host = el;
    if (!host.__brgMounted) host.__brgMounted = /* @__PURE__ */ new Map();
    if (host.__brgMounted.has(name)) return;
    const scope = new Scope(null);
    const props = readProps(el, extraProps);
    try {
      let instance = void 0;
      scope.run(() => {
        instance = setup(wrap(el), props, { name, el, scope });
      });
      host.__brgMounted.set(name, { scope, instance });
      healthy.add(name);
    } catch (e) {
      scope.dispose();
      const others = [...healthy].filter((n) => n !== name);
      warnSink(
        `[bridgey] component "${name}" の初期化に失敗しました。
  ${describe(e)}
` + (others.length ? `  → 他の component (${others.map((n) => `"${n}"`).join(" / ")}) は正常に動作しています。` : `  → 他の component には影響していません。`)
      );
    }
  }
  function unmountTree(root) {
    disposeHost(root);
    for (const el of root.querySelectorAll(`[${attrName}]`)) disposeHost(el);
  }
  function disposeHost(el) {
    const host = el;
    if (!host.__brgMounted) return;
    for (const { scope, instance } of host.__brgMounted.values()) {
      try {
        instance?.destroy?.();
      } catch (e) {
        warnSink(`[bridgey] component の destroy() で例外が発生しました。
  ${describe(e)}`);
      }
      scope.dispose();
    }
    host.__brgMounted.clear();
    host.__brgMounted = void 0;
  }
  function startObserver() {
    if (observer || typeof MutationObserver === "undefined") return;
    const root = document.documentElement ?? document.body;
    if (!root) return;
    observer = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.removedNodes) {
          if (node.nodeType === 1) unmountTree(node);
        }
        for (const node of record.addedNodes) {
          if (node.nodeType === 1) scan(node);
        }
      }
    });
    observer.observe(root, { childList: true, subtree: true });
  }
  function readProps(el, extra) {
    const props = {};
    const skip = camelize(attrName.replace(/^data-/, ""));
    for (const [key, raw] of Object.entries(el.dataset)) {
      if (key === skip) continue;
      props[key] = coerce(raw);
    }
    return extra ? { ...props, ...extra } : props;
  }
  function camelize(name) {
    return name.replace(/-([a-z])/g, (_m, c) => c.toUpperCase());
  }
  function coerce(raw) {
    if (raw === void 0) return void 0;
    if (raw === "") return "";
    if (raw === "true") return true;
    if (raw === "false") return false;
    if (raw === "null") return null;
    const first = raw[0];
    if (first === "{" || first === "[") {
      try {
        return JSON.parse(raw);
      } catch {
        return raw;
      }
    }
    const num = Number(raw);
    if (!Number.isNaN(num) && String(num) === raw) return num;
    return raw;
  }
  function describe(e) {
    if (e instanceof Error) return `${e.name}: ${e.message}`;
    return String(e);
  }

  // src/safe-form.ts
  var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  var SKIP_TYPES = /* @__PURE__ */ new Set(["submit", "button", "reset", "image", "file"]);
  function form(el, rules = {}, options = {}) {
    const formEl = el.tagName === "FORM" ? el : el.closest("form") ?? el;
    const errorAttr = options.errorAttr ?? "data-brg-error";
    const autoSlot = options.autoErrorSlot !== false;
    if (formEl.tagName === "FORM") formEl.setAttribute("novalidate", "");
    const revision = signal(0);
    const dirty = signal(false);
    const submitted = signal(false);
    const bump = () => revision.update((n) => n + 1);
    const values = computed(() => {
      revision.get();
      return readValues(formEl);
    });
    const errors = computed(() => {
      const current = values.get();
      const found = {};
      for (const [name, rule] of Object.entries(rules)) {
        if (rule.when && !rule.when()) continue;
        const field = fieldsNamed(formEl, name)[0];
        if (!options.validateHidden && (!field || !isVisible(field))) continue;
        const message = check(current[name], rule, current);
        if (message) found[name] = message;
      }
      return found;
    });
    const valid = computed(() => Object.keys(errors.get()).length === 0);
    const errorList = computed(
      () => Object.entries(errors.get()).map(([name, message]) => ({ name, message }))
    );
    const errorCount = computed(() => errorList.get().length);
    const hasErrors = computed(() => errorList.get().length > 0);
    const firstError = computed(() => errorList.get()[0]?.message ?? "");
    const perField = /* @__PURE__ */ new Map();
    const errorOf = (name) => {
      let found = perField.get(name);
      if (!found) {
        found = toReadonly(computed(() => errors.get()[name] ?? ""));
        perField.set(name, found);
      }
      return found;
    };
    const submitAction = action(async (v) => {
      if (handler) await handler(v);
    });
    let handler = null;
    const onInput = (event) => {
      const target = event.target;
      if (target && isComposing(target)) return;
      dirty.set(true);
      bump();
    };
    formEl.addEventListener("input", onInput);
    formEl.addEventListener("change", onInput);
    hookValueSetters(formEl, bump);
    installAutofillProbe(formEl.ownerDocument);
    const onAnimation = (e) => {
      if (e.animationName === AUTOFILL_ANIMATION) bump();
    };
    formEl.addEventListener("animationstart", onAnimation, true);
    let observer2 = null;
    if (typeof MutationObserver !== "undefined") {
      observer2 = new MutationObserver((records) => {
        if (records.every((r) => isErrorSlotChange(r, errorAttr))) return;
        hookValueSetters(formEl, bump);
        bump();
      });
      observer2.observe(formEl, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["style", "class", "hidden", "disabled", "required"]
      });
    }
    const syncErrors = effect(() => {
      const current = errors.get();
      const show = submitted.get() || dirty.get();
      for (const name of Object.keys(rules)) {
        const fields = fieldsNamed(formEl, name);
        const message = show ? current[name] : void 0;
        for (const field of fields) {
          if (message) {
            field.setAttribute("aria-invalid", "true");
            field.setAttribute("data-invalid", "");
          } else {
            field.removeAttribute("aria-invalid");
            field.removeAttribute("data-invalid");
          }
        }
        const slot = errorSlot(formEl, name, errorAttr, autoSlot, fields[0]);
        if (!slot) continue;
        slot.textContent = message ?? "";
        if (message) {
          slot.removeAttribute("hidden");
          if (fields[0] && slot.id) fields[0].setAttribute("aria-describedby", slot.id);
        } else {
          slot.setAttribute("hidden", "");
        }
      }
    });
    const onSubmit = (e) => {
      bump();
      submitted.set(true);
      if (!valid.peek()) {
        e.preventDefault();
        focusFirstError();
        return;
      }
      if (handler) {
        e.preventDefault();
        void submitAction(values.peek());
      }
    };
    formEl.addEventListener("submit", onSubmit);
    function focusFirstError() {
      const names = Object.keys(errors.peek());
      if (names.length === 0) return false;
      for (const field of Array.from(formEl.elements)) {
        const name = field.name;
        if (!name || !names.includes(name)) continue;
        if (!isVisible(field)) continue;
        field.scrollIntoView?.({ block: "center", behavior: "smooth" });
        field.focus?.();
        return true;
      }
      return false;
    }
    currentScope()?.add(() => {
      observer2?.disconnect();
      formEl.removeEventListener("input", onInput);
      formEl.removeEventListener("change", onInput);
      formEl.removeEventListener("animationstart", onAnimation, true);
      formEl.removeEventListener("submit", onSubmit);
      syncErrors();
    });
    return {
      values: toReadonly(values),
      errors: toReadonly(errors),
      errorCount: toReadonly(errorCount),
      hasErrors: toReadonly(hasErrors),
      firstError: toReadonly(firstError),
      errorList: toReadonly(errorList),
      error: errorOf,
      valid: toReadonly(valid),
      dirty: toReadonly(dirty),
      submitting: submitAction.running,
      submitted: toReadonly(submitted),
      submit(next) {
        if (typeof next === "function") {
          handler = next;
          return void 0;
        }
        bump();
        submitted.set(true);
        if (!valid.peek()) {
          focusFirstError();
          return false;
        }
        if (handler) void submitAction(values.peek());
        return true;
      },
      validate() {
        bump();
        submitted.set(true);
        return valid.peek();
      },
      reset(next) {
        if (formEl.tagName === "FORM" && !next) formEl.reset();
        if (next) {
          for (const [name, value] of Object.entries(next)) {
            for (const field of fieldsNamed(formEl, name)) {
              const input = field;
              if (input.type === "checkbox" || input.type === "radio") {
                input.checked = Array.isArray(value) ? value.includes(input.value) : value === true || value === input.value;
              } else {
                input.value = value == null ? "" : String(value);
              }
            }
          }
        }
        dirty.set(false);
        submitted.set(false);
        bump();
      },
      focusFirstError,
      refresh: bump
    };
  }
  function check(value, rule, all) {
    const empty = value === void 0 || value === null || value === "" || value === false || Array.isArray(value) && value.length === 0;
    const required = typeof rule.required === "function" ? !!rule.required() : !!rule.required;
    if (required && empty) return rule.message ?? "入力してください";
    if (empty) return null;
    const text = Array.isArray(value) ? value.join(",") : String(value);
    if (rule.email && !EMAIL.test(text)) return rule.message ?? "メールアドレスの形式が正しくありません";
    if (rule.pattern) {
      const re = typeof rule.pattern === "string" ? new RegExp(rule.pattern) : rule.pattern;
      if (!re.test(text)) return rule.message ?? "形式が正しくありません";
    }
    if (rule.minLength !== void 0 && text.length < rule.minLength) {
      return rule.message ?? `${rule.minLength}文字以上で入力してください`;
    }
    if (rule.maxLength !== void 0 && text.length > rule.maxLength) {
      return rule.message ?? `${rule.maxLength}文字以内で入力してください`;
    }
    if (rule.min !== void 0 || rule.max !== void 0) {
      const num = Number(text);
      if (Number.isNaN(num)) return rule.message ?? "数値を入力してください";
      if (rule.min !== void 0 && num < rule.min) return rule.message ?? `${rule.min}以上で入力してください`;
      if (rule.max !== void 0 && num > rule.max) return rule.message ?? `${rule.max}以下で入力してください`;
    }
    if (rule.same !== void 0 && text !== String(all[rule.same] ?? "")) {
      return rule.message ?? "入力内容が一致しません";
    }
    if (rule.validate) {
      const message = rule.validate(value, all);
      if (message) return message;
    }
    return null;
  }
  function rulesFromHtml(el) {
    const formEl = el.tagName === "FORM" ? el : el.closest("form") ?? el;
    const out = {};
    for (const field of Array.from(formEl.elements)) {
      if (!field.name || SKIP_TYPES.has(field.type)) continue;
      const rule = {};
      let any = false;
      if (field.required) {
        rule.required = true;
        any = true;
      }
      if (field.type === "email") {
        rule.email = true;
        any = true;
      }
      const pattern = field.getAttribute("pattern");
      if (pattern) {
        rule.pattern = pattern;
        any = true;
      }
      const min = field.getAttribute("min");
      if (min !== null) {
        rule.min = Number(min);
        any = true;
      }
      const max = field.getAttribute("max");
      if (max !== null) {
        rule.max = Number(max);
        any = true;
      }
      if (field.minLength > 0) {
        rule.minLength = field.minLength;
        any = true;
      }
      if (field.maxLength > 0) {
        rule.maxLength = field.maxLength;
        any = true;
      }
      if (any && !out[field.name]) out[field.name] = rule;
    }
    return out;
  }
  function readValues(formEl) {
    const out = {};
    const elements = formEl.elements;
    const list = elements ? Array.from(elements) : Array.from(formEl.querySelectorAll("input, select, textarea"));
    for (const field of list) {
      const name = field.name;
      if (!name || field.disabled || SKIP_TYPES.has(field.type)) continue;
      if (field.type === "checkbox") {
        const group = fieldsNamed(formEl, name);
        if (group.length > 1) {
          out[name] = group.filter((f) => f.checked).map((f) => f.value);
        } else {
          out[name] = field.checked;
        }
      } else if (field.type === "radio") {
        if (field.checked) out[name] = field.value;
        else if (!(name in out)) out[name] = "";
      } else if (field.tagName === "SELECT" && field.multiple) {
        out[name] = Array.from(field.selectedOptions).map(
          (o) => o.value
        );
      } else {
        out[name] = field.value;
      }
    }
    return out;
  }
  function fieldsNamed(formEl, name) {
    const escaped = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(name) : name.replace(/"/g, '\\"');
    return [
      ...formEl.querySelectorAll(
        `input[name="${escaped}"], select[name="${escaped}"], textarea[name="${escaped}"]`
      )
    ];
  }
  function isVisible(el) {
    if (el.type === "hidden") return false;
    let node = el;
    const view = el.ownerDocument?.defaultView;
    while (node) {
      if (node.hidden) return false;
      if (view) {
        const style = view.getComputedStyle(node);
        if (style.display === "none" || style.visibility === "hidden") return false;
      }
      node = node.parentElement;
    }
    return true;
  }
  function isErrorSlotChange(record, errorAttr) {
    if (isErrorSlot(record.target, errorAttr)) return true;
    const nodes = [...record.addedNodes, ...record.removedNodes];
    return nodes.length > 0 && nodes.every((n) => isErrorSlot(n, errorAttr));
  }
  function isErrorSlot(node, errorAttr) {
    if (!node) return false;
    const el = node.nodeType === 1 ? node : node.parentElement;
    return !!el?.hasAttribute(errorAttr);
  }
  var slotSeq = 0;
  function errorSlot(formEl, name, errorAttr, autoCreate, field) {
    const escaped = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(name) : name;
    const existing = formEl.querySelector(`[${errorAttr}="${escaped}"]`);
    if (existing) {
      if (!existing.id) existing.id = `brg-error-${++slotSeq}`;
      return existing;
    }
    if (!autoCreate || !field) return null;
    const created = formEl.ownerDocument.createElement("p");
    created.setAttribute(errorAttr, name);
    created.className = "bridgey-error";
    created.id = `brg-error-${++slotSeq}`;
    created.setAttribute("hidden", "");
    field.insertAdjacentElement("afterend", created);
    return created;
  }
  function hookValueSetters(formEl, bump) {
    const fields = formEl.querySelectorAll("input, select, textarea");
    for (const field of fields) {
      const target = field;
      if (target.__brgValueHooked) continue;
      const proto = Object.getPrototypeOf(target);
      const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
      if (!descriptor?.get || !descriptor.set) continue;
      target.__brgValueHooked = true;
      watchComposition(target);
      onCompositionEnd(target, bump);
      Object.defineProperty(target, "value", {
        configurable: true,
        enumerable: descriptor.enumerable ?? true,
        get() {
          return descriptor.get.call(this);
        },
        set(next) {
          descriptor.set.call(this, next);
          bump();
        }
      });
    }
  }
  var AUTOFILL_ANIMATION = "brgAutofill";
  var probed = /* @__PURE__ */ new WeakSet();
  function installAutofillProbe(doc) {
    if (!doc || probed.has(doc)) return;
    probed.add(doc);
    const style = doc.createElement("style");
    style.textContent = `@keyframes ${AUTOFILL_ANIMATION}{from{}to{}}input:-webkit-autofill{animation-name:${AUTOFILL_ANIMATION};animation-duration:1ms}`;
    doc.head?.appendChild(style);
  }

  // src/directives.ts
  var wrap2 = (el) => el;
  var prefixOf = () => "data-brg";
  var warnSink2 = (m) => console.warn(m);
  var warnEnabled = () => true;
  function configureDirectives(options) {
    if (options.wrap) wrap2 = options.wrap;
    if (options.prefix) prefixOf = options.prefix;
    if (options.warn) warnSink2 = options.warn;
    if (options.enabled) warnEnabled = options.enabled;
  }
  var FIXED_DIRECTIVES = [
    "text",
    "html",
    "value",
    "checked",
    "when",
    "when-detach",
    "mode",
    "selected",
    "expanded",
    "invalid",
    "busy",
    "disabled",
    "repeat"
  ];
  var boundElements = /* @__PURE__ */ new WeakSet();
  var bindCalled = false;
  var checkScheduled = false;
  function scheduleUnboundCheck() {
    if (checkScheduled || typeof document === "undefined") return;
    checkScheduled = true;
    const run = () => {
      setTimeout(checkUnbound, 0);
    };
    if (document.readyState === "complete") run();
    else window.addEventListener("load", run, { once: true });
  }
  function checkUnbound() {
    if (!warnEnabled()) return;
    const prefix = prefixOf();
    const selector = FIXED_DIRECTIVES.map((name) => `[${prefix}-${name}]`).join(",");
    const missing = [...document.querySelectorAll(selector)].filter((el) => !boundElements.has(el));
    if (missing.length === 0) return;
    const sample = missing.slice(0, 3).map((el) => {
      const mark = [...el.attributes].find((a) => a.name.startsWith(`${prefix}-`));
      return `    <${el.tagName.toLowerCase()} ${mark?.name}="${mark?.value}">`;
    }).join("\n");
    warnSink2(
      `[bridgey] ${prefix}-* の印が付いているのに $$.bind() されていない要素が ${missing.length} 個あります。
` + (bindCalled ? `  $$.bind() は呼ばれていますが、これらは範囲の外にあるようです。
` : `  $$.bind() が一度も呼ばれていません。
`) + sample + `
  → 印を書いた範囲を bind してください: $$.bind("#app", { … })
     component の中なら $$.bind(ctx.el, { … }) が確実です。
  (この後で bind する場合は無視してよい警告です。$$.warn = false で止まります)`
    );
  }
  function bind(root, states, options = {}) {
    const el = typeof root === "string" ? document.querySelector(root.replace(/@([\w-]+)/g, (_m, n) => `[${prefixOf()}="${n}"]`)) : root;
    if (!el) {
      warnSink2(
        `[bridgey] $$.bind(): 対象が見つかりません: ${String(root)}
  HTML が変わった可能性があります。`
      );
      return;
    }
    bindCalled = true;
    walk(el, states, options);
  }
  function walk(el, states, options) {
    const tookOverChildren = apply(el, states, options);
    if (tookOverChildren) return;
    for (const child of [...el.children]) {
      if (child.tagName === "TEMPLATE") continue;
      walk(child, states, options);
    }
  }
  function apply(el, states, options) {
    const prefix = `${prefixOf()}-`;
    const found = [];
    for (const attr of [...el.attributes]) {
      if (!attr.name.startsWith(prefix)) continue;
      found.push([attr.name.slice(prefix.length), attr.value]);
    }
    if (found.length === 0) return false;
    boundElements.add(el);
    const $el = wrap2(el);
    const modifiers = new Map(found);
    const format = modifiers.get("format");
    const useMoney = modifiers.has("money");
    const repeatName = modifiers.get("repeat");
    if (repeatName !== void 0) {
      applyRepeat($el, el, repeatName, modifiers, states, options);
      return true;
    }
    for (const [key, value] of found) {
      switch (key) {
        case "format":
        case "money":
        case "tpl":
        case "key":
          continue;
        // 修飾子。単独では何もしない
        case "text": {
          const shape = useMoney ? moneyFormat : format;
          const template = useMoney ? format : void 0;
          $el.text(read(states, value, options, el), shape, template);
          continue;
        }
        case "html":
          $el.html(read(states, value, options, el));
          continue;
        case "value":
          $el.prop("value", readTwoWay(states, value, options, el));
          continue;
        case "checked":
          $el.prop("checked", readTwoWay(states, value, options, el));
          continue;
        case "when":
          $el.when(read(states, value, options, el));
          continue;
        case "when-detach":
          $el.when(read(states, value, options, el), { detach: true });
          continue;
        case "mode":
          $el.mode(read(states, value, options, el));
          continue;
        case "selected":
        case "expanded":
        case "invalid":
        case "busy":
        case "disabled":
          $el[key](
            read(states, value, options, el)
          );
          continue;
        default:
          break;
      }
      if (key.startsWith("attr-")) {
        $el.attr(key.slice(5), read(states, value, options, el));
      } else if (key.startsWith("class-")) {
        $el.toggleClass(key.slice(6), read(states, value, options, el));
      } else if (key.startsWith("style-")) {
        $el.css(key.slice(6), read(states, value, options, el));
      } else if (key.startsWith("var-")) {
        $el.vars({ [key.slice(4)]: read(states, value, options, el) });
      } else if (key.startsWith("on-")) {
        const handler = resolveHandler(states, value, options, el);
        if (handler) $el.on(key.slice(3), handler);
      } else {
        warnSink2(
          `[bridgey] ${prefixOf()}-${key} は知らない印です。
  使えるもの: text / html / value / checked / when / when-detach / mode /
  selected / expanded / invalid / busy / disabled / repeat /
  attr-* / class-* / style-* / var-* / on-*`
        );
      }
    }
    return false;
  }
  function moneyFormat(value) {
    const num = typeof value === "number" ? value : Number(String(value).replace(/,/g, ""));
    return Number.isNaN(num) ? String(value) : num.toLocaleString();
  }
  function applyRepeat($el, el, name, modifiers, states, options) {
    const items = read(states, name, options, el);
    const keyField = modifiers.get("key");
    const tpl = modifiers.get("tpl");
    $el.repeat(items, {
      key: keyField ? (item, index) => item?.[keyField] ?? index : void 0,
      tpl,
      render: ($row, item, index) => {
        const rowStates = Object.create(states);
        if (item && typeof item === "object") Object.assign(rowStates, item);
        rowStates.$item = item;
        rowStates.$index = index;
        const node = $row.el;
        if (node) walk(node, rowStates, options);
      }
    });
  }
  function read(states, expression, options, el) {
    const raw = expression.trim();
    const negate = raw.startsWith("!");
    const path = (negate ? raw.slice(1) : raw).trim().split(".");
    const head = path[0];
    if (!(head in states)) {
      reportUnknown(states, head, options, el);
      return () => negate ? true : void 0;
    }
    return () => {
      let value = states[head];
      if (typeof value === "function") value = value();
      for (const step of path.slice(1)) {
        value = value == null ? void 0 : value[step];
      }
      return negate ? !value : value;
    };
  }
  function readTwoWay(states, expression, options, el) {
    const raw = expression.trim();
    if (!raw.startsWith("!") && !raw.includes(".") && raw in states) {
      const entry = states[raw];
      if (typeof entry === "function") return entry;
    }
    return read(states, expression, options, el);
  }
  function resolveHandler(states, expression, options, el) {
    const name = expression.trim();
    if (!(name in states)) {
      reportUnknown(states, name, options, el);
      return null;
    }
    const handler = states[name];
    if (typeof handler !== "function") {
      warnSink2(
        `[bridgey] on- の "${name}" は関数ではありません。
  クリック時に呼ぶ関数を渡してください: $$.bind(root, { ${name}: () => { … } })`
      );
      return null;
    }
    return handler;
  }
  function reportUnknown(states, name, options, el) {
    if (options.quiet) return;
    const keys = Object.keys(states);
    const near = nearest(name, keys);
    warnSink2(
      `[bridgey] "${name}" という状態が渡されていません(<${el.tagName.toLowerCase()}> の印)。` + (near ? `
  タイポの可能性があります(似ている名前: "${near}")。` : "") + `
  渡されているのは: ${keys.length ? keys.join(", ") : "(なし)"}
  → $$.bind(root, { ${name}: … }) のように渡してください。
  ※ 印には式(count > 10 など)は書けません。JS 側で computed を作って名前を渡してください。`
    );
  }
  function nearest(name, pool) {
    let best = null;
    let bestScore = 3;
    for (const candidate of pool) {
      if (Math.abs(candidate.length - name.length) > 2) continue;
      const score = distance(name, candidate);
      if (score < bestScore) {
        bestScore = score;
        best = candidate;
      }
    }
    return best;
  }
  function distance(a, b) {
    const prev = new Array(b.length + 1);
    for (let j = 0; j <= b.length; j++) prev[j] = j;
    for (let i = 1; i <= a.length; i++) {
      let last = prev[0];
      prev[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const current = prev[j];
        prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, last + (a[i - 1] === b[j - 1] ? 0 : 1));
        last = current;
      }
    }
    return prev[b.length];
  }

  // src/dollar.ts
  var dataAttr = "data-brg";
  function resolveSelector(selector) {
    return selector.replace(/@([\w-]+)/g, (_m, name) => `[${dataAttr}="${name}"]`);
  }
  function scopeOf(el) {
    const holder = el;
    if (!holder.__brgScope || holder.__brgScope._disposed) {
      holder.__brgScope = new Scope(currentScope());
    }
    return holder.__brgScope;
  }
  function disposeTree(el) {
    const holder = el;
    holder.__brgScope?.dispose();
    holder.__brgScope = void 0;
    for (const child of el.querySelectorAll("*")) {
      const c = child;
      c.__brgScope?.dispose();
      c.__brgScope = void 0;
    }
  }
  var warnEnabled2 = true;
  var warnSink3 = (m) => console.warn(m);
  var hintsEnabled = true;
  var hinted = /* @__PURE__ */ new Set();
  function hint(key, message) {
    if (!hintsEnabled || !warnEnabled2 || hinted.has(key)) return;
    hinted.add(key);
    warnSink3(`[bridgey] ${message}
  (このヒントは $$.hints = false で止められます)`);
  }
  var STATE_CLASS_HINTS = {
    active: "selected",
    "is-active": "selected",
    current: "selected",
    "is-current": "selected",
    selected: "selected",
    "is-selected": "selected",
    on: "selected",
    open: "expanded",
    "is-open": "expanded",
    opened: "expanded",
    expanded: "expanded",
    disabled: "disabled",
    "is-disabled": "disabled",
    error: "invalid",
    "is-error": "invalid",
    invalid: "invalid",
    "has-error": "invalid",
    loading: "busy",
    "is-loading": "busy",
    busy: "busy",
    hidden: "when",
    "is-hidden": "when",
    hide: "when",
    show: "when",
    "is-visible": "when",
    visible: "when"
  };
  var HINT_REASON = {
    selected: "aria-selected も一緒に付き、他の要素から消し忘れることもありません",
    expanded: "aria-expanded も一緒に付きます(スクリーンリーダーに開閉が伝わります)",
    disabled: "本物の disabled 属性になり、a タグなら aria-disabled になります",
    invalid: "aria-invalid も付き、エラー表示と揃います",
    busy: "aria-busy も付きます($$.resource の loading をそのまま渡せます)",
    when: "CSS のクラス名に依存しないので、CSS を1行消しても漏れません"
  };
  function hintStateClass(names, method) {
    for (const name of names) {
      const better = STATE_CLASS_HINTS[name.toLowerCase()];
      if (!better) continue;
      hint(
        `class:${name}:${better}`,
        `${method}("${name}") で状態を表しているようです。
  → .${better}(state) が使えます: ${HINT_REASON[better]}`
      );
    }
  }
  var warnUnknownClass = true;
  var knownClasses = null;
  var warnedClasses = /* @__PURE__ */ new Set();
  function walkRules(rules, out) {
    for (const rule of Array.from(rules)) {
      const selector = rule.selectorText;
      if (selector) {
        for (const m of selector.matchAll(/\.(-?[_a-zA-Z]+[\w-]*)/g)) out.add(m[1]);
      }
      const nested = rule.cssRules;
      if (nested) walkRules(nested, out);
    }
  }
  function styleSheetClasses() {
    const found = /* @__PURE__ */ new Set();
    if (typeof document === "undefined") return found;
    for (const sheet of Array.from(document.styleSheets)) {
      let rules = null;
      try {
        rules = sheet.cssRules;
      } catch {
        continue;
      }
      if (rules) walkRules(rules, found);
    }
    return found;
  }
  function nearest2(name, pool) {
    let best = null;
    let bestScore = 3;
    for (const candidate of pool) {
      if (Math.abs(candidate.length - name.length) > 2) continue;
      const score = distance2(name, candidate);
      if (score < bestScore) {
        bestScore = score;
        best = candidate;
      }
    }
    return best;
  }
  function distance2(a, b) {
    const prev = new Array(b.length + 1);
    for (let j = 0; j <= b.length; j++) prev[j] = j;
    for (let i = 1; i <= a.length; i++) {
      let last = prev[0];
      prev[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const current = prev[j];
        prev[j] = Math.min(
          prev[j] + 1,
          prev[j - 1] + 1,
          last + (a[i - 1] === b[j - 1] ? 0 : 1)
        );
        last = current;
      }
    }
    return prev[b.length];
  }
  function checkClassNames(names, method, reactive) {
    if (!warnEnabled2 || !warnUnknownClass) return;
    if (!reactive && warnUnknownClass !== "all") return;
    if (!knownClasses || knownClasses.size === 0) knownClasses = styleSheetClasses();
    if (knownClasses.size === 0) return;
    for (const name of names) {
      if (knownClasses.has(name) || warnedClasses.has(name)) continue;
      warnedClasses.add(name);
      const near = nearest2(name, knownClasses);
      warnSink3(
        `[bridgey] ${method}("${name}") — このクラスはどの CSS にも定義されていません。` + (near ? `
  タイポの可能性があります(似ている名前: "${near}")。` : "") + `
  表示制御が効かず、隠すべき要素が見えたままになる恐れがあります。
  → 表示の出し入れは when(state) を使ってください。
     見せてはいけないものは when(state, { detach: true }) で DOM から外してください(CSS に依存しないので、CSS が1行消えても漏れません)。`
      );
    }
  }
  var Bridgey = class _Bridgey {
    constructor(input, selector = null, roots = []) {
      __publicField(this, "els");
      /** 何で引いたか(警告メッセージに出すため)。 */
      __publicField(this, "selector");
      /** どこから引いたか(後から足された要素を拾い直すため)。 */
      __publicField(this, "roots");
      this.selector = selector;
      this.els = collect(input);
      this.roots = roots;
    }
    get length() {
      return this.els.length;
    }
    get el() {
      return this.els[0] ?? null;
    }
    /**
     * 束縛しようとしたのに0件だった場合に警告する。
     * 命令的操作(addClass 等)の0件は無害なことも多いので、そちらでは鳴らさない。
     */
    _requireElements(method) {
      if (this.els.length > 0) return true;
      if (!warnEnabled2) return false;
      const what = this.selector ? `$$("${this.selector}")` : "$$(...)";
      const atName = this.selector?.match(/@([\w-]+)/)?.[1];
      const advice = atName ? `
  "@${atName}" は [${dataAttr}="${atName}"] の略記です。HTML 側にこの属性が必要です:
     <span ${dataAttr}="${atName}"></span>
  (id や class でも書けます: $$("#${atName}") / $$(".${atName}"))` : `
  → 壊れにくくするには data 属性で結びつけてください:
     <span ${dataAttr}="name"></span>  →  $$("@name")
     class を変えても JS が壊れなくなります`;
      warnSink3(
        `[bridgey] ${what} が0件でした。${method}() を結びつけられません。
  HTML が変わった可能性があります(class 名の変更・要素の削除・読み込み順)。${advice}`
      );
      return false;
    }
    /** 各要素に effect を張り、要素の片付け単位に登録する。 */
    _bind(method, run) {
      if (!this._requireElements(method)) return this;
      for (const el of this.els) {
        scopeOf(el).add(effect(() => run(el)));
      }
      return this;
    }
    // --- 走査(最小セット) ---------------------------------------------------
    each(fn) {
      this.els.forEach((el, i) => fn.call(el, el, i));
      return this;
    }
    find(selector) {
      const sel = resolveSelector(selector);
      return new _Bridgey(
        this.els.flatMap(
          (el) => (
            // window には querySelectorAll が無い（$$(window) 対応）
            typeof el.querySelectorAll === "function" ? [...el.querySelectorAll(sel)] : []
          )
        ),
        selector,
        // 引いた元を覚えておく。後から要素が足されたときに、ここから拾い直す
        this.els
      );
    }
    closest(selector) {
      const sel = resolveSelector(selector);
      return new _Bridgey(
        this.els.map((el) => el.closest(sel)).filter(Boolean),
        selector
      );
    }
    parent() {
      return new _Bridgey(this.els.map((el) => el.parentElement).filter(Boolean));
    }
    children(selector) {
      const sel = selector ? resolveSelector(selector) : null;
      return new _Bridgey(
        this.els.flatMap(
          (el) => [...el.children].filter((c) => !sel || c.matches(sel))
        )
      );
    }
    first() {
      return new _Bridgey(this.el ? [this.el] : [], this.selector);
    }
    last() {
      return new _Bridgey(this.els.length ? [this.els[this.els.length - 1]] : [], this.selector);
    }
    is(selector) {
      const sel = resolveSelector(selector);
      return this.els.some((el) => el.matches(sel));
    }
    text(value, format, template) {
      if (value === void 0) return this.el?.textContent ?? "";
      const shape = formatter(format, template);
      const read2 = readerOf(value);
      if (read2) return this._bind("text", (el) => el.textContent = shape(read2()));
      this.els.forEach((el) => el.textContent = shape(value));
      return this;
    }
    html(value) {
      if (value === void 0) return this.el?.innerHTML ?? "";
      if (typeof value === "string" && looksLikeList(value)) {
        hint(
          "html:list",
          `html() で一覧を組み立てているようです。
  → .repeat(items, { tpl: "#テンプレートのid", render: … }) が使えます:
     行を作り直さず差分だけ更新するので、入力中のフォーカスやスクロールが飛びません`
        );
      }
      const read2 = readerOf(value);
      if (read2) return this._bind("html", (el) => el.innerHTML = String(read2()));
      this.els.forEach((el) => el.innerHTML = String(value));
      return this;
    }
    val(value) {
      if (value === void 0) return this.el?.value ?? "";
      const read2 = readerOf(value);
      if (read2) {
        this._bind("val", (el) => {
          const next = String(read2());
          if (el.value !== next) writeValue(el, "value", next);
        });
        if (isState(value)) this._syncFromInput(value, "value");
        return this;
      }
      this.els.forEach((el) => el.value = String(value));
      return this;
    }
    attr(name, value) {
      if (value === void 0) return this.el?.getAttribute(name) ?? null;
      if (typeof value === "boolean") {
        hint(
          "attr:boolean",
          `attr("${name}", ${value}) は文字列 "${value}" を書き込みます。
  → 属性の有無で表したいなら .toggleAttr("${name}", state) を使ってください(false のとき属性が消えるので [${name}] セレクタに当たりません)`
        );
      }
      const read2 = readerOf(value);
      if (read2) return this._bind("attr", (el) => el.setAttribute(name, String(read2())));
      this.els.forEach((el) => el.setAttribute(name, String(value)));
      return this;
    }
    removeAttr(name) {
      this.els.forEach((el) => el.removeAttribute(name));
      return this;
    }
    prop(name, value) {
      if (value === void 0) return this.el ? this.el[name] : void 0;
      const read2 = readerOf(value);
      if (read2) {
        this._bind("prop", (el) => {
          writeValue(el, name, read2());
        });
        if (isState(value) && (name === "checked" || name === "value")) {
          this._syncFromInput(value, name);
        }
        return this;
      }
      this.els.forEach((el) => el[name] = value);
      return this;
    }
    css(name, value) {
      if (value === void 0) {
        return this.el ? window.getComputedStyle(this.el).getPropertyValue(name) : void 0;
      }
      if (name === "display") {
        hint(
          "css:display",
          `css("display", …) で表示を切り替えているようです。
  → .when(state) が使えます: 表示が状態から導出されるので、初期表示と更新がズレません`
        );
      }
      const read2 = readerOf(value);
      if (read2) return this._bind("css", (el) => el.style.setProperty(name, String(read2())));
      this.els.forEach((el) => el.style.setProperty(name, String(value)));
      return this;
    }
    addClass(names) {
      const list = split(names);
      checkClassNames(list, "addClass", false);
      hintStateClass(list, "addClass");
      this.els.forEach((el) => el.classList.add(...list));
      return this;
    }
    removeClass(names) {
      const list = split(names);
      checkClassNames(list, "removeClass", false);
      hintStateClass(list, "removeClass");
      this.els.forEach((el) => el.classList.remove(...list));
      return this;
    }
    /**
     * class の付け外し。真偽の state を渡せば追従する。
     *   $$("@box").toggleClass("is-open", open)   ← fadeIn/slideDown を持たない理由がこれ
     */
    toggleClass(names, force) {
      const list = split(names);
      const read2 = readerOf(force);
      checkClassNames(list, "toggleClass", read2 !== null);
      if (read2 === null) hintStateClass(list, "toggleClass");
      if (read2) {
        return this._bind("toggleClass", (el) => {
          const on = !!read2();
          list.forEach((n) => el.classList.toggle(n, on));
        });
      }
      this.els.forEach(
        (el) => list.forEach((n) => force === void 0 ? el.classList.toggle(n) : el.classList.toggle(n, !!force))
      );
      return this;
    }
    hasClass(name) {
      return this.el?.classList.contains(name) ?? false;
    }
    // --- 状態を要素に出す(class より安全な表現) ------------------------------
    //
    // 【なぜ class より良いのか】
    //   ① 排他状態: class は「消し忘れ」で2つ付く(.loading と .done が同時に付く)。
    //      属性は1つしか値を持てないので、排他が構造的に保証される。
    //   ② 綴りミスの倒れ方: CSS を「既定=隠す / 属性が付いたら見せる」で書けば、
    //      綴りを間違えても "見えない" 側に倒れる。class で .is-hidden を付けて隠す設計は
    //      綴りを間違えると "見えてしまう" 側に倒れる(= 事故)。
    //   ③ 見た目の責任: .css() は JS が px を計算してしまう。CSS 変数なら値を渡すだけで、
    //      計算・アニメーション・メディアクエリは CSS の仕事のまま残る。
    //
    //   .addClass() / .css() は互換のため残す。新規に書くならこちらを推奨。
    /**
     * 排他的な状態を data-mode 属性に出す。CSS 側は [data-mode="…"] で受ける。
     *   $$("@form").mode(() => sending() ? "sending" : error() ? "error" : "ready");
     *   → <form data-mode="sending">   ... CSS: [data-mode="sending"] .spinner { display:block }
     *
     * falsy(false / null / undefined / "") なら属性そのものを外す。
     * 第2引数で別名にできる: mode(value, "phase") → data-phase
     */
    mode(value, attribute = "mode") {
      const name = attribute.startsWith("data-") ? attribute : `data-${attribute}`;
      const read2 = readerOf(value);
      if (read2) return this._bind("mode", (el) => setModeValue(el, name, read2()));
      this.els.forEach((el) => setModeValue(el, name, value));
      return this;
    }
    /**
     * 真偽で属性の有無を切り替える。CSS 側は [data-open] で受ける。
     *   $$("@panel").toggleAttr("data-open", isOpen);
     *
     * .attr("data-open", false) だと文字列 "false" が入ってしまい
     * [data-open] セレクタに当たり続ける(= 閉じたのに開いて見える)。その罠を避けるための API。
     */
    toggleAttr(name, condition) {
      const read2 = readerOf(condition);
      if (read2) return this._bind("toggleAttr", (el) => setPresence(el, name, !!read2()));
      this.els.forEach(
        (el) => setPresence(el, name, condition === void 0 ? !el.hasAttribute(name) : !!condition)
      );
      return this;
    }
    // --- UI 状態 -------------------------------------------------------------
    //
    // 「クラスを付ける」ではなく「UI がどういう状態か」を書く。
    //   $$("@tab").addClass("active")      → 何が active なのか誰も知らない
    //   $$("@tab").selected(cond)          → 選択中であることが CSS にも支援技術にも伝わる
    //
    // 出力は2系統ペアで入る:
    //   ・ARIA 属性  … スクリーンリーダー・自動テスト・Lighthouse が読む
    //   ・data 属性  … CSS が [data-selected] で受ける(class のタイポ事故が消える)
    //
    // レガシー現場のアクセシビリティは大抵壊滅している。UI の意味で書けば無料で付いてくる。
    // (公共・大企業案件では要件になるので、導入の理由にもなる)
    /** 選択中( .active の正しい表現 )。 aria-selected + [data-selected] */
    selected(condition) {
      if (condition === void 0) return this.el?.getAttribute("aria-selected") === "true";
      return this._uiState("selected", condition, (el, on) => {
        setAria(el, "aria-selected", on, false);
        setPresence(el, "data-selected", on);
      });
    }
    /** 開いている(アコーディオン・ドロップダウンのトリガー)。 aria-expanded は false も明示する */
    expanded(condition) {
      if (condition === void 0) return this.el?.getAttribute("aria-expanded") === "true";
      return this._uiState("expanded", condition, (el, on) => {
        setAria(el, "aria-expanded", on, true);
        setPresence(el, "data-expanded", on);
      });
    }
    /** 入力エラー。 aria-invalid + [data-invalid] */
    invalid(condition) {
      if (condition === void 0) return this.el?.getAttribute("aria-invalid") === "true";
      return this._uiState("invalid", condition, (el, on) => {
        setAria(el, "aria-invalid", on, false);
        setPresence(el, "data-invalid", on);
      });
    }
    /** 読み込み中。 aria-busy + [data-busy]  ($$.resource の loading をそのまま渡せる) */
    busy(condition) {
      if (condition === void 0) return this.el?.getAttribute("aria-busy") === "true";
      return this._uiState("busy", condition, (el, on) => {
        setAria(el, "aria-busy", on, false);
        setPresence(el, "data-busy", on);
      });
    }
    /**
     * 操作不可。ネイティブに disabled があれば本物の disabled を使い、
     * 無ければ aria-disabled で伝える(a や div をボタンにしている現場のため)。
     *   $$("@save").disabled(save.running);   // 二重送信対策がこれ1行
     */
    disabled(condition) {
      if (condition === void 0) {
        const el = this.el;
        if (!el) return false;
        return supportsDisabled(el) ? !!el.disabled : el.getAttribute("aria-disabled") === "true";
      }
      return this._uiState("disabled", condition, (el, on) => {
        if (supportsDisabled(el)) el.disabled = on;
        else setAria(el, "aria-disabled", on, false);
        setPresence(el, "data-disabled", on);
      });
    }
    /** UI 状態の共通処理(静的な値でも state でも同じ書き味にする)。 */
    _uiState(method, condition, apply2) {
      const read2 = readerOf(condition);
      if (read2) return this._bind(method, (el) => apply2(el, !!read2()));
      this.els.forEach((el) => apply2(el, !!condition));
      return this;
    }
    /**
     * CSS カスタムプロパティに値を流す。見た目の決定権は CSS に残る。
     *   $$("@bar").vars({ progress: () => `${percent()}%` });
     *   → style="--progress: 60%"    CSS: .bar__fill { width: var(--progress) }
     *
     *   $$("@card").vars({ "--x": () => `${x()}px`, "--y": () => `${y()}px` });
     */
    vars(map) {
      const entries = Object.entries(map);
      const dynamic = entries.filter(([, v]) => readerOf(v) !== null);
      for (const [key, value] of entries) {
        if (readerOf(value) !== null) continue;
        this.els.forEach((el) => el.style.setProperty(varName(key), String(value)));
      }
      if (dynamic.length === 0) return this;
      return this._bind("vars", (el) => {
        for (const [key, value] of dynamic) {
          el.style.setProperty(varName(key), String(readerOf(value)()));
        }
      });
    }
    data(key, value) {
      if (value === void 0) return this.el?.dataset[key];
      const read2 = readerOf(value);
      if (read2) return this._bind("data", (el) => el.dataset[key] = String(read2()));
      this.els.forEach((el) => el.dataset[key] = String(value));
      return this;
    }
    append(content) {
      const nodes = toNodes(content);
      this.els.forEach((el, i) => {
        if (nodes) nodes.forEach((n) => el.appendChild(i === 0 ? n : n.cloneNode(true)));
        else el.insertAdjacentHTML("beforeend", String(content));
      });
      return this;
    }
    empty() {
      this.els.forEach((el) => {
        for (const child of [...el.children]) disposeTree(child);
        el.innerHTML = "";
      });
      return this;
    }
    remove() {
      this.els.forEach((el) => {
        disposeTree(el);
        el.remove();
      });
      this.els = [];
      return this;
    }
    // focus() / blur() は下の SHORTCUTS で生成する(引数ありでバインド、無しで実行)。
    // --- リスト描画 ----------------------------------------------------------
    /**
     * 一覧を描く。行は使い回すので、入力中の文字・スクロール・フォーカスが飛ばない。
     *
     * ① テンプレートを HTML に置く(推奨)
     *   <ul id="list"></ul>
     *   <template id="row-tpl"><li><span class="title"></span></li></template>
     *
     *   $$("#list").repeat(todos, {
     *     key: (t) => t.id,
     *     tpl: "#row-tpl",
     *     render: ($row, t) => $row.find(".title").text(t.title),
     *   });
     *
     * ② サーバーが既に出力している一覧を乗っ取る(HTML を1文字も変えない)
     *   $$("#list").repeat(rows, { from: "li", key: r => r.id, render: … });
     *
     * ③ 簡単な行なら文字列で(短縮形)
     *   $$("#list").repeat(todos, (t) => `<li>${t.title}</li>`);
     */
    repeat(items, options) {
      if (!this._requireElements("repeat")) return this;
      const opts = typeof options === "function" ? { html: options } : options;
      const read2 = readerOf(items) ?? (() => items);
      for (const parent of this.els) {
        const makeRow = rowFactory(parent, opts);
        let rows = /* @__PURE__ */ new Map();
        const renderInto = (row, item, index) => {
          row.item = item;
          row.scope = new Scope(null);
          row.scope.run(() => {
            if (opts.render) opts.render(new _Bridgey(row.node), item, index);
          });
        };
        scopeOf(parent).add(
          effect(() => {
            const list = read2() ?? [];
            const keys = list.map((item, index) => opts.key ? opts.key(item, index) : index);
            const duplicate = findDuplicateKey(keys);
            if (duplicate !== null && warnEnabled2) {
              warnSink3(
                `[bridgey] repeat() のキーが重複しています: ${String(duplicate)}
  同じキーの行が2つあると、更新のたびに片方が消えるなど説明のつかない動きになります。
  → key には必ず一意な値(id など)を指定してください。`
              );
            }
            rows = reconcile({
              parent,
              keys,
              existing: rows,
              create: (key, index) => {
                const node = makeRow(list[index], index);
                const row = {
                  key,
                  node,
                  item: list[index],
                  scope: new Scope(null),
                  dispose() {
                    this.scope.dispose();
                    disposeTree(this.node);
                  }
                };
                if (opts.render) renderInto(row, list[index], index);
                return row;
              },
              update: (row, index) => {
                const item = list[index];
                if (Object.is(row.item, item)) return;
                if (opts.render) {
                  row.scope.dispose();
                  renderInto(row, item, index);
                } else {
                  const fresh = makeRow(item, index);
                  row.node.replaceWith(fresh);
                  row.node = fresh;
                  row.item = item;
                }
              }
            });
          })
        );
      }
      return this;
    }
    // --- 表示 ---------------------------------------------------------------
    /**
     * 条件表示({#if} の代わり)。
     *   $$("@error").when(hasError)                    … display の出し入れ
     *   $$("@modal").when(open, { detach: true })      … 偽なら DOM から外す
     */
    when(condition, options) {
      const read2 = readerOf(condition) ?? (() => condition);
      if (!this._requireElements("when")) return this;
      const detach = options?.detach === true;
      for (const el of this.els) {
        if (detach) {
          const anchor = el.ownerDocument.createComment("brg:when");
          el.parentNode?.insertBefore(anchor, el);
          scopeOf(el).add(
            effect(() => {
              if (read2()) {
                if (!el.isConnected) anchor.parentNode?.insertBefore(el, anchor);
              } else if (el.isConnected) {
                el.remove();
              }
            })
          );
        } else {
          const original = el.style.display;
          scopeOf(el).add(
            effect(() => {
              el.style.display = read2() ? original === "none" ? "" : original : "none";
            })
          );
        }
      }
      return this;
    }
    // --- state ---------------------------------------------------------------
    /**
     * この要素に結びついた state を作る。
     *   const count = $$("@count").state(0);        … 側面は自動推論
     *   const name  = $$("@name").state("", "value");  … 明示
     *   const done  = $$("@chk").state(false, "checked");
     *   const src   = $$("@img").state(url, "attr:src");
     *   const n     = $$("@count").state();         … DOM の現在値を初期値にする
     *
     * value / checked は双方向(ユーザー入力で state が動く)。それ以外は state → DOM の一方向。
     */
    state(initial, aspect) {
      this._requireElements("state");
      const side = aspect ?? inferAspect(this.el);
      const start = initial === void 0 ? readAspect(this.el, side) : initial;
      const handle = toHandle(signal(start));
      if (side === "value" || side === "checked") {
        this.prop(side, handle);
      } else if (side === "text") {
        this.text(handle);
      } else if (side === "html") {
        this.html(handle);
      } else if (side.startsWith("attr:")) {
        this.attr(side.slice(5), handle);
      } else if (side.startsWith("class:")) {
        this.toggleClass(side.slice(6), handle);
      } else if (side.startsWith("css:")) {
        this.css(side.slice(4), handle);
      } else {
        throw new Error(`[bridgey] 未知の側面 "${side}" です(value/checked/text/html/attr:名/class:名/css:名)`);
      }
      return handle;
    }
    /**
     * ラジオ/チェックボックス群をまとめて1つの state にする。
     *   const plan    = $$("@plan").group<string>();     … ラジオ群 → 選ばれている value
     *   const options = $$("@option").group<string[]>(); … チェックボックス群 → value の配列
     *
     * 【なぜ要るか】
     *   jQuery 現場では選択状態が「input:checked」と「.active クラス」で二重管理され、
     *   初期化処理と更新処理が別に書かれてズレる(=選べない/数値計算が合わない)。
     *   選択を1つの state にすれば、見た目も金額もそこから導出できる。
     */
    group() {
      this._requireElements("group");
      const inputs = this.els;
      const single = inputs.length > 0 && inputs.every((el) => el.type === "radio");
      const bound = /* @__PURE__ */ new WeakMap();
      const claim = (el) => {
        const previous = bound.get(el);
        if (previous && !previous._disposed) return false;
        bound.set(el, scopeOf(el));
        return true;
      };
      if (single) {
        const current = inputs.find((el) => el.checked);
        const handle2 = toHandle(signal(current ? current.value : ""));
        const bind3 = (el, added = false) => {
          if (!claim(el)) return;
          if (added && el.checked && handle2() !== el.value) handle2(el.value);
          scopeOf(el).add(
            effect(() => {
              el.checked = handle2() === el.value;
            })
          );
          this._listen(el, "change", () => {
            if (el.checked) handle2(el.value);
          });
        };
        for (const el of inputs) bind3(el);
        this._watchAdded((el) => bind3(el, true));
        return handle2;
      }
      const handle = toHandle(
        signal(inputs.filter((el) => el.checked).map((el) => el.value))
      );
      const bind2 = (el, added = false) => {
        if (!claim(el)) return;
        if (added && el.checked && !handle().includes(el.value)) {
          handle((list) => [...list, el.value]);
        }
        scopeOf(el).add(
          effect(() => {
            el.checked = handle().includes(el.value);
          })
        );
        this._listen(el, "change", () => {
          const value = el.value;
          const on = el.checked;
          handle(
            (list) => on ? list.includes(value) ? list : [...list, value] : list.filter((v) => v !== value)
          );
        });
      };
      for (const el of inputs) bind2(el);
      this._watchAdded((el) => bind2(el, true));
      return handle;
    }
    /**
     * 同じセレクタの要素が**後から DOM に足されたとき**にも同じ束縛を掛ける。
     *
     * 【なぜ要るか】
     *   jQuery 現場で最も多い事故が「Ajax や JS で足した行にだけハンドラが付いていない」。
     *   数値計算が合わない・チェックが効かない、しかも**例外は出ない**ので気付けない。
     *   引いた時点の要素だけを見ていると、bridgey でも同じ事故を起こしてしまう。
     *
     * $$(要素) のように直接渡された場合はセレクタが無いので、拾い直しはしない。
     */
    _watchAdded(onAdd) {
      if (!this.selector || typeof MutationObserver === "undefined") return;
      const sel = resolveSelector(this.selector);
      const roots = this.roots.length ? this.roots : [document.documentElement];
      for (const root of roots) {
        if (!root || typeof root.querySelectorAll !== "function") continue;
        const observer2 = new MutationObserver((records) => {
          for (const record of records) {
            for (const node of record.addedNodes) {
              if (node.nodeType !== 1) continue;
              const el = node;
              if (el.matches(sel)) onAdd(el);
              for (const found of el.querySelectorAll(sel)) onAdd(found);
            }
          }
        });
        observer2.observe(root, { childList: true, subtree: true });
        scopeOf(root).add(() => observer2.disconnect());
      }
    }
    /** リスナを張り、要素の片付け単位に解除を登録する。 */
    _listen(el, type, listener) {
      el.addEventListener(type, listener);
      scopeOf(el).add(() => el.removeEventListener(type, listener));
    }
    /** input/change を state に流し込む(双方向の片側)。 */
    _syncFromInput(handle, prop) {
      for (const el of this.els) {
        const pull = () => handle(el[prop]);
        const listener = () => {
          if (isComposing(el)) return;
          pull();
        };
        for (const type of ["input", "change"]) {
          el.addEventListener(type, listener);
          scopeOf(el).add(() => el.removeEventListener(type, listener));
        }
        watchComposition(el);
        scopeOf(el).add(onCompositionEnd(el, pull));
      }
    }
    // --- イベント ------------------------------------------------------------
    // 名前空間(click.myui)は削除。後片付けは scope() で行う(上位互換)。
    /**
     *   on("click", fn)              直接
     *   on("click", "@row", fn)      委譲(後から追加された要素にも効く)
     *   on("click input", fn)        複数
     */
    on(events, selectorOrHandler, maybeHandler) {
      const delegated = typeof selectorOrHandler === "string";
      const sel = delegated ? resolveSelector(selectorOrHandler) : null;
      const handler = delegated ? maybeHandler : selectorOrHandler;
      if (typeof handler !== "function") return this;
      for (const type of split(events)) {
        for (const el of this.els) {
          const wrapped = sel ? (e) => {
            const t = e.target?.closest(sel);
            if (t && el.contains(t)) handler.call(t, e);
          } : handler;
          el.addEventListener(type, wrapped);
          listenersOf(el).push({ type, handler, wrapped });
          scopeOf(el).add(() => el.removeEventListener(type, wrapped));
        }
      }
      return this;
    }
    /** off() 全解除 / off("click") 種別 / off("click", fn) 個別 */
    off(events, handler) {
      const types = events ? split(events) : null;
      for (const el of this.els) {
        const list = listenersOf(el);
        const keep = list.filter((L) => {
          const hit = (!types || types.includes(L.type)) && (!handler || L.handler === handler);
          if (hit) el.removeEventListener(L.type, L.wrapped);
          return !hit;
        });
        el.__brgListeners = keep;
      }
      return this;
    }
    /**
     * フォームの検証を状態にする。
     *
     *   const f = $$("@signup").form();          // HTML の required / type=email を読む
     *   const f = $$("@signup").form({           // JS 側でルールを足す(HTMLの分と合成される)
     *     company: { required: true, when: () => plan() === "corp" },
     *     confirm: { same: "password" },
     *   });
     *
     *   $$("@submit").disabled(f.submitting);    // 既定では未入力で無効化しない(CV優先)
     *   f.submit(async (values) => { … });       // 二重送信は自動で防がれる
     *
     * 見えていないフィールドは検証されないので、「押せないのに理由が出ない」が起きない。
     */
    form(rules, options) {
      const el = this.el;
      if (!el) {
        this._requireElements("form");
        return form(document.createElement("form"), {}, options);
      }
      const fromHtml = rulesFromHtml(el);
      const merged = { ...fromHtml };
      for (const [name, rule] of Object.entries(rules ?? {})) {
        merged[name] = { ...fromHtml[name], ...rule };
      }
      return form(el, merged, options);
    }
    /**
     * 登録済みの部品を明示的に適用する(HTML に data-component を書けない場合の逃げ道)。
     *   $$("@tabs").component("tabs", { start: 2 });
     */
    component(name, props) {
      if (!this._requireElements("component")) return this;
      this.els.forEach((el) => mountOne(el, name, props));
      return this;
    }
    /** この要素に張った購読・リスナを全部解放する(要素は残す)。 */
    dispose() {
      this.els.forEach((el) => {
        const holder = el;
        holder.__brgScope?.dispose();
        holder.__brgScope = void 0;
      });
      return this;
    }
  };
  var SHORTCUTS = [
    "click",
    "dblclick",
    "change",
    "submit",
    "input",
    "keydown",
    "keyup",
    "focus",
    "blur",
    "mousedown",
    "mouseup",
    "mouseenter",
    "mouseleave",
    "scroll"
  ];
  for (const ev of SHORTCUTS) {
    Bridgey.prototype[ev] = function(handler) {
      if (handler) return this.on(ev, handler);
      if (ev === "focus" || ev === "blur") {
        this.els.forEach((el) => el[ev]());
        return this;
      }
      this.els.forEach(
        (el) => el.dispatchEvent(new CustomEvent(ev, { bubbles: true, cancelable: true }))
      );
      return this;
    };
  }
  function listenersOf(el) {
    const host = el;
    if (!host.__brgListeners) host.__brgListeners = [];
    return host.__brgListeners;
  }
  function rowFactory(parent, opts) {
    if (opts.html) {
      const build = opts.html;
      return (item, index) => parseRow(parent, build(item, index));
    }
    let template = null;
    if (opts.tpl) {
      const el = typeof opts.tpl === "string" ? parent.ownerDocument.querySelector(resolveSelector(opts.tpl)) : opts.tpl;
      if (!el) {
        throw new Error(`[bridgey] repeat(): tpl "${String(opts.tpl)}" が見つかりません。`);
      }
      const content = el.content;
      template = content ? content.firstElementChild : el;
      if (!template) {
        throw new Error(`[bridgey] repeat(): <template> の中身が空です。`);
      }
    } else {
      const found = opts.from ? parent.querySelector(resolveSelector(opts.from)) : parent.firstElementChild;
      if (!found) {
        throw new Error(
          `[bridgey] repeat(): 行の雛形がありません。
  次のどれかを指定してください:
    tpl: "#テンプレートのid"     … <template> を雛形にする(推奨)
    from: "li"                   … すでにある子要素を雛形にする
    (item) => \`<li>…</li>\`      … 文字列で返す短縮形`
        );
      }
      template = found;
      for (const child of [...parent.children]) {
        disposeTree(child);
        child.remove();
      }
    }
    const base = template;
    return () => base.cloneNode(true);
  }
  function parseRow(parent, html) {
    const tpl = parent.ownerDocument.createElement("template");
    tpl.innerHTML = html.trim();
    const node = tpl.content.firstElementChild;
    if (!node) {
      throw new Error(`[bridgey] repeat(): 行の HTML が空です: ${JSON.stringify(html)}`);
    }
    return node;
  }
  function looksLikeList(html) {
    if (html.length > 1500) return false;
    for (const tag of ["<li", "<tr", "<option", "<article"]) {
      let count = 0;
      let index = html.indexOf(tag);
      while (index !== -1) {
        if (++count >= 3) return true;
        index = html.indexOf(tag, index + tag.length);
      }
    }
    return false;
  }
  function formatter(format, template) {
    const transform = typeof format === "function" ? format : null;
    const shape = typeof format === "string" ? format : template;
    const wrap3 = (value) => {
      const text = String(value);
      if (shape === void 0) return text;
      return shape.includes("{}") ? shape.split("{}").join(text) : text + shape;
    };
    return transform ? (value) => wrap3(transform(value)) : wrap3;
  }
  function setModeValue(el, name, value) {
    if (value === false || value === null || value === void 0 || value === "") {
      el.removeAttribute(name);
    } else {
      el.setAttribute(name, value === true ? "" : String(value));
    }
  }
  function setAria(el, name, on, keepFalse) {
    if (on) el.setAttribute(name, "true");
    else if (keepFalse) el.setAttribute(name, "false");
    else el.removeAttribute(name);
  }
  var DISABLEABLE = /* @__PURE__ */ new Set([
    "BUTTON",
    "INPUT",
    "SELECT",
    "TEXTAREA",
    "FIELDSET",
    "OPTGROUP",
    "OPTION"
  ]);
  function supportsDisabled(el) {
    return DISABLEABLE.has(el.tagName);
  }
  function setPresence(el, name, on) {
    if (on) el.setAttribute(name, "");
    else el.removeAttribute(name);
  }
  function varName(key) {
    return key.startsWith("--") ? key : `--${key}`;
  }
  function split(value) {
    return (value || "").split(/\s+/).filter(Boolean);
  }
  function collect(input) {
    if (input == null) return [];
    if (typeof window !== "undefined" && input === window) return [window];
    if (input.nodeType === 9) return [input];
    if (typeof input === "string") {
      const s = input.trim();
      if (s[0] === "<" && s[s.length - 1] === ">") {
        const tpl = document.createElement("template");
        tpl.innerHTML = s;
        return [...tpl.content.childNodes].filter((n) => n.nodeType === 1);
      }
      return [...document.querySelectorAll(resolveSelector(s))];
    }
    if (input instanceof Bridgey) return input.els.slice();
    if (input.nodeType === 1) return [input];
    if (typeof input.length === "number") {
      return Array.from(input).filter(
        (n) => n && n.nodeType === 1
      );
    }
    return [];
  }
  function toNodes(content) {
    if (content instanceof Bridgey) return content.els.slice();
    if (Array.isArray(content)) return content.flatMap((c) => toNodes(c) ?? []);
    if (content && content.nodeType) return [content];
    return null;
  }
  function inferAspect(el) {
    if (!el) return "text";
    const tag = el.tagName;
    if (tag === "INPUT") {
      const type = el.type;
      return type === "checkbox" || type === "radio" ? "checked" : "value";
    }
    if (tag === "TEXTAREA" || tag === "SELECT") return "value";
    return "text";
  }
  function readAspect(el, aspect) {
    if (!el) return void 0;
    if (aspect === "value") return el.value;
    if (aspect === "checked") return el.checked;
    if (aspect === "text") return el.textContent ?? "";
    if (aspect === "html") return el.innerHTML;
    if (aspect.startsWith("attr:")) return el.getAttribute(aspect.slice(5));
    if (aspect.startsWith("class:")) return el.classList.contains(aspect.slice(6));
    if (aspect.startsWith("css:")) return el.style.getPropertyValue(aspect.slice(4));
    return void 0;
  }
  function create(input) {
    if (typeof input === "function") {
      const fn = input;
      if (document.readyState !== "loading") fn();
      else document.addEventListener("DOMContentLoaded", () => fn());
      return new Bridgey();
    }
    return new Bridgey(input, typeof input === "string" ? input : null);
  }
  var $$ = create;
  $$.state = (initial) => toHandle(signal(initial));
  $$.computed = (fn) => toHandle(computed(fn));
  $$.effect = effect;
  $$.scope = (fn) => {
    const s = new Scope(currentScope());
    if (fn) s.run(fn);
    return s;
  };
  $$.tick = tick;
  $$.batch = batch;
  $$.untrack = untrack;
  $$.resource = resource;
  $$.action = action;
  $$.component = component;
  $$.mount = mount;
  $$.unmount = unmount;
  $$.componentAttr = componentAttr;
  $$.bind = bind;
  configureComponents({
    wrap: (el) => new Bridgey(el),
    warn: (message) => warnSink3(message)
  });
  configureDirectives({
    wrap: (el) => new Bridgey(el),
    prefix: () => dataAttr,
    warn: (message) => warnSink3(message),
    enabled: () => warnEnabled2
  });
  scheduleUnboundCheck();
  $$.each = function(collection, fn) {
    if (!collection) return collection;
    if (Array.isArray(collection) || typeof collection.length === "number") {
      const list = collection;
      for (let i = 0; i < list.length; i++) {
        if (fn.call(list[i], i, list[i]) === false) break;
      }
    } else {
      const record = collection;
      for (const key of Object.keys(record)) {
        if (fn.call(record[key], key, record[key]) === false) break;
      }
    }
    return collection;
  };
  $$.map = function(collection, fn) {
    const out = [];
    if (!collection) return out;
    if (Array.isArray(collection) || typeof collection.length === "number") {
      const list = collection;
      for (let i = 0; i < list.length; i++) {
        const result = fn(list[i], i);
        if (result !== null && result !== void 0) out.push(result);
      }
    } else {
      const record = collection;
      for (const key of Object.keys(record)) {
        const result = fn(record[key], key);
        if (result !== null && result !== void 0) out.push(result);
      }
    }
    return out;
  };
  $$.extend = function(...args) {
    let deep = false;
    let index = 0;
    if (typeof args[0] === "boolean") {
      deep = args[0];
      index = 1;
    }
    const target = args[index] ?? {};
    for (index += 1; index < args.length; index++) {
      const source = args[index];
      if (!source) continue;
      for (const key of Object.keys(source)) {
        const value = source[key];
        if (deep && value && typeof value === "object" && !Array.isArray(value)) {
          const base = target[key] && typeof target[key] === "object" ? target[key] : {};
          target[key] = $$.extend(true, base, value);
        } else {
          target[key] = value;
        }
      }
    }
    return target;
  };
  $$.money = (value) => {
    const num = typeof value === "number" ? value : Number(String(value).replace(/,/g, ""));
    return Number.isNaN(num) ? String(value) : num.toLocaleString();
  };
  $$.fn = Bridgey.prototype;
  $$.version = true ? "2.0.0-beta.1" : "dev";
  Object.defineProperty($$, "hints", {
    get: () => hintsEnabled,
    set: (v) => {
      hintsEnabled = v;
      if (v) hinted.clear();
    },
    enumerable: true
  });
  Object.defineProperty($$, "attr", {
    get: () => dataAttr,
    set: (v) => {
      dataAttr = v;
    },
    enumerable: true
  });
  Object.defineProperty($$, "warn", {
    get: () => warnEnabled2,
    set: (v) => {
      warnEnabled2 = v;
    },
    enumerable: true
  });
  Object.defineProperty($$, "warnUnknownClass", {
    get: () => warnUnknownClass,
    set: (v) => {
      warnUnknownClass = v;
      knownClasses = null;
      warnedClasses.clear();
    },
    enumerable: true
  });
  Object.defineProperty($$, "warnSink", {
    get: () => warnSink3,
    set: (v) => {
      warnSink3 = v;
    },
    enumerable: true
  });
  installCompat(Bridgey, $$, {
    hint,
    resolveSelector
  });

  // src/attach-global.ts
  var DEFAULT_NAME = "$$";
  var VALID_NAME = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
  var NAMESPACE = "bridgey";
  function attachGlobal(api, options = {}) {
    const target = api;
    const warn = options.warn ?? ((m) => console.warn(m));
    const scope = options.scope ?? (typeof window !== "undefined" ? window : null);
    target.globalNames = [];
    target.noConflict = () => target;
    target.as = () => false;
    if (!scope) return target;
    const saved = /* @__PURE__ */ new Map();
    const remember = (name) => {
      if (!saved.has(name)) saved.set(name, scope[name]);
    };
    const occupied = (name) => name in scope && scope[name] !== void 0;
    const requested = resolveRequestedNames(options, scope, warn);
    const names = [];
    if (requested.length > 0) {
      for (const name of requested) {
        if (occupied(name) && scope[name] !== api) {
          warn(
            `[bridgey] window.${name} を bridgey で上書きしました(data-global で明示されているため)。
  元に戻すには bridgey.noConflict() を呼んでください。`
          );
        }
        remember(name);
        scope[name] = api;
        names.push(name);
      }
    } else if (!occupied(DEFAULT_NAME) || scope[DEFAULT_NAME] === api) {
      remember(DEFAULT_NAME);
      scope[DEFAULT_NAME] = api;
      names.push(DEFAULT_NAME);
    } else {
      warn(
        `[bridgey] window.${DEFAULT_NAME} は既に使われているため、グローバルに公開しませんでした。
  使いたい名前を指定してください:
     <script src="…/bridgey" data-global="$$$"><\/script>
  (名前は自由です: $ / $$$ / $_$ / brg など。window.${NAMESPACE} からは常に使えます)`
      );
    }
    remember(NAMESPACE);
    scope[NAMESPACE] = api;
    target.globalNames = names;
    target.noConflict = (all) => {
      for (const [name, prev] of saved) {
        if (!all && name === NAMESPACE) continue;
        if (prev === void 0) delete scope[name];
        else scope[name] = prev;
      }
      if (all) saved.clear();
      target.globalNames = [];
      return api;
    };
    target.as = (name) => {
      if (!VALID_NAME.test(name)) {
        warn(`[bridgey] "${name}" はグローバル名に使えません(識別子として書けない文字が含まれています)。`);
        return false;
      }
      if (occupied(name) && scope[name] !== api) {
        warn(`[bridgey] window.${name} は既に使われているため別名を追加しませんでした。`);
        return false;
      }
      remember(name);
      scope[name] = api;
      if (!target.globalNames.includes(name)) target.globalNames.push(name);
      return true;
    };
    return target;
  }
  function resolveRequestedNames(options, scope, warn) {
    const raw = options.name ?? readScriptAttribute(options.script) ?? (typeof scope.BRIDGEY_GLOBAL === "string" ? scope.BRIDGEY_GLOBAL : null);
    if (!raw) return [];
    const names = [];
    for (const part of raw.split(",")) {
      const name = part.trim();
      if (!name) continue;
      if (!VALID_NAME.test(name)) {
        warn(
          `[bridgey] data-global="${name}" は使えません(識別子として書ける文字だけにしてください)。
  例: $$ / $ / $$$ / $_$ / brg`
        );
        continue;
      }
      if (!names.includes(name)) names.push(name);
    }
    return names;
  }
  function readScriptAttribute(script) {
    const el = script ?? (typeof document !== "undefined" && document.currentScript ? document.currentScript : null);
    return el ? el.getAttribute("data-global") : null;
  }

  // src/global.ts
  attachGlobal($$);
})();
