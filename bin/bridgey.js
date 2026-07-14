#!/usr/bin/env node
// bin/bridgey.js — bridgey の CLI。
//
// 究極ビジョンの入口:
//   npm install bridgey
//   npx brg init my-app
//     ? フレームワークを選択:  > svelte   vue
//     ? 言語を選択:            > js       ts
//   → 選んだエンジン + 言語に配線済みのスタータ一式を生成する。
//
// 依存ゼロ(Node標準のみ)。対話選択、または --framework / --lang で非対話。
//
// 生成コードは常に公開パッケージ名 "bridgey" を import する(=そのまま npm install で解決)。
//   import { $$, state, mount, useEngine } from "bridgey";
//   import { svelteEngine } from "bridgey/engines/svelte.js";  // or vue
//
// 使い方:
//   brg init [dir] [--framework svelte|vue] [--lang js|ts] [--bridgey-dep <spec>]
//     dir           生成先(省略時は対話で入力。既定 bridgey-app / "." で現在のフォルダに生成)
//     --framework   省略時は対話選択
//     --lang        省略時は対話選択(js|ts)
//     --bridgey-dep  生成package.jsonが依存するbridgeの指定(既定: "^1.0.0")。
//                   未公開のローカル検証時は tgz への file: 指定も可
//                   例) --bridgey-dep "file:../bridgey-1.0.0.tgz"
//
// エンジン・言語はプロジェクト作成時に一度だけ選ぶ(後から切り替える機能は持たない)。
// 別の組み合わせを試すなら別プロジェクトを作る。利用者コード($$/state/mount)は共通。
//
// ※ TS を選ぶと bridgey 本体のアンビエント型宣言(bridgey-env.d.ts)と tsconfig.json も
//    生成する。bridgey 本体が型定義を同梱するまでのつなぎとして、これで型が効く。

import { mkdir, writeFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve, basename } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

const FRAMEWORKS = ["svelte", "vue"];
const LANGUAGES = ["js", "ts"];
const PKG = "bridgey"; // 公開パッケージ名

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--framework" || a === "-f") args.framework = argv[++i];
    else if (a.startsWith("--framework=")) args.framework = a.split("=")[1];
    else if (a === "--lang" || a === "-l") args.lang = argv[++i];
    else if (a.startsWith("--lang=")) args.lang = a.split("=")[1];
    else if (a === "--bridgey-dep") args.bridgeyDep = argv[++i];
    else if (a.startsWith("--bridgey-dep=")) args.bridgeyDep = a.split("=")[1];
    else args._.push(a);
  }
  return args;
}

// 番号 or 名前で1つ選ばせる汎用プロンプト(既定は先頭)。
// choices は文字列 or { value, label }。表示は label、戻り値は value(js/ts等の内部値)。
// 入力は番号・value・label のいずれでも(大文字小文字問わず)受け付ける。
// readline インターフェイスは呼び出し側で1つ作って使い回す(複数回 close すると
// パイプ入力の stdin が EOF 扱いになり2問目以降がハングするため)。
async function promptChoice(rl, label, choices) {
  const norm = choices.map((c) => (typeof c === "string" ? { value: c, label: c } : c));
  stdout.write(`\n${label}:\n`);
  norm.forEach((c, i) => stdout.write(`  ${i + 1}) ${c.label}\n`));
  while (true) {
    const ans = (await rl.question("番号または名前 [1]: ")).trim() || "1";
    const lower = ans.toLowerCase();
    const pick =
      norm[Number(ans) - 1] ||
      norm.find((c) => c.value.toLowerCase() === lower || c.label.toLowerCase() === lower);
    if (pick) return pick.value;
    stdout.write(`  ↳ ${norm.map((c) => c.label).join(" か ")} を選んでください\n`);
  }
}

// ── テンプレート(フレームワーク別 × 言語別) ────────────────────
// 生成物はどれも「利用者コードは $$/state/mount で共通、違いはエンジン選択・部品の書式・
// 言語(js/ts)だけ」。ts では App/main の拡張子と型注釈、tsconfig と型宣言が加わる。

function filesFor(framework, lang, name, bridgeyDep) {
  const isTs = lang === "ts";
  const entry = isTs ? "main.ts" : "main.js";

  const common = {
    "index.html": `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${name} — bridgey (${framework} · ${lang})</title>
</head>
<body>
  <h1>${name} <small>engine: ${framework} · ${lang}</small></h1>
  <div id="app"></div>
  <div><button id="reset">リセット</button> 状態: <span id="log"></span></div>
  <script src="./bundle.js"></script>
</body>
</html>
`,
    ".gitignore": "node_modules\nbundle.js\n" + (isTs ? "*.tsbuildinfo\n" : ""),
  };

  if (isTs) {
    common["tsconfig.json"] = tsconfigJson();
    common["bridgey-env.d.ts"] = envDts(framework);
  }

  if (framework === "svelte") {
    return {
      ...common,
      "App.svelte": svelteApp(isTs),
      [entry]: svelteMain(name),
      "build.mjs": buildMjs("svelte", lang),
      "package.json": pkgJson(name, "svelte", lang, bridgeyDep, { svelte: "^4" }, svelteDevDeps(isTs)),
    };
  }

  // vue
  return {
    ...common,
    [isTs ? "App.ts" : "App.js"]: vueApp(isTs),
    [entry]: vueMain(name, isTs),
    "build.mjs": buildMjs("vue", lang),
    "package.json": pkgJson(name, "vue", lang, bridgeyDep, { vue: "^3" }, vueDevDeps(isTs)),
  };
}

// ── Svelte 部品 ────────────────────────────────────────────────
function svelteApp(isTs) {
  const open = isTs ? `<script lang="ts">` : `<script>`;
  const nameDecl = isTs ? `export let name: string = "world";` : `export let name = "world";`;
  return `${open}
  ${nameDecl}
  let count = 0;
  $: doubled = count * 2;
</script>

<p>こんにちは {name} — 本物のSvelte。</p>
<button on:click={() => count--}>−</button>
<strong>{count}</strong>
<button on:click={() => count++}>＋</button>
<span>(2倍: {doubled})</span>
{#if count >= 10}<p>10以上</p>{/if}
`;
}

function svelteMain(name) {
  // 型は bridgey-env.d.ts(ts時)から効く。main の中身は js/ts で共通。
  return `// bridge本体はエンジン非依存。起動時に一度だけエンジンを選ぶ。
import { $$, state, mount, useEngine } from "${PKG}";
import { svelteEngine } from "${PKG}/engines/svelte.js";
import App from "./App.svelte";

useEngine(svelteEngine);

const app = mount(App, { target: "#app", props: { name: "${name}" } });

const log = state("mounted");
$$("#log").bindText(log);
$$("#reset").on("click", () => { app.set({ name: "world" }); log.value = "reset"; });
`;
}

// ── Vue 部品 ───────────────────────────────────────────────────
function vueApp(isTs) {
  if (isTs) {
    return `import { defineComponent } from "vue";

export default defineComponent({
  props: { name: { type: String, default: "world" } },
  data: () => ({ count: 0 }),
  computed: { doubled(): number { return this.count * 2; } },
  template: \`
    <p>こんにちは {{ name }} — 本物のVue。</p>
    <button @click="count--">−</button>
    <strong>{{ count }}</strong>
    <button @click="count++">＋</button>
    <span>(2倍: {{ doubled }})</span>
    <p v-if="count >= 10">10以上</p>
  \`,
});
`;
  }
  return `export default {
  props: { name: { type: String, default: "world" } },
  data: () => ({ count: 0 }),
  computed: { doubled() { return this.count * 2; } },
  template: \`
    <p>こんにちは {{ name }} — 本物のVue。</p>
    <button @click="count--">−</button>
    <strong>{{ count }}</strong>
    <button @click="count++">＋</button>
    <span>(2倍: {{ doubled }})</span>
    <p v-if="count >= 10">10以上</p>
  \`,
};
`;
}

function vueMain(name, isTs) {
  const appImport = isTs ? "./App" : "./App.js"; // ts は拡張子なしで App.ts を解決
  return `// Vueを選んだので、useEngine(vueEngine) を一度だけ呼ぶ。
// これ以降の $$/state/mount はSvelte版と同じ書き味。
import { $$, state, mount, useEngine } from "${PKG}";
import { vueEngine } from "${PKG}/engines/vue.js";
import App from "${appImport}";

useEngine(vueEngine);

const app = mount(App, { target: "#app", props: { name: "${name}" } });

const log = state("mounted");
$$("#log").bindText(log);
$$("#reset").on("click", () => { app.set({ name: "world" }); log.value = "reset"; });
`;
}

// ── devDependencies(言語別に上乗せ) ───────────────────────────
const TS_DEVDEPS = {
  typescript: "^5",
  "@rollup/plugin-typescript": "^12",
  tslib: "^2",
};

function svelteDevDeps(isTs) {
  const base = {
    rollup: "^4",
    "@rollup/plugin-node-resolve": "^16",
    "rollup-plugin-svelte": "^7",
  };
  return isTs ? { ...base, "svelte-preprocess": "^6", ...TS_DEVDEPS } : base;
}

function vueDevDeps(isTs) {
  const base = {
    rollup: "^4",
    "@rollup/plugin-node-resolve": "^16",
    "@rollup/plugin-alias": "^5",
  };
  return isTs ? { ...base, ...TS_DEVDEPS } : base;
}

function pkgJson(name, framework, lang, bridgeyDep, deps, devDeps) {
  return (
    JSON.stringify(
      {
        name,
        private: true,
        type: "module",
        scripts: { build: "node build.mjs" },
        dependencies: { [PKG]: bridgeyDep, ...deps }, // bridge本体 + 選んだFW
        devDependencies: devDeps,
        bridgey: { framework, lang }, // 選択したエンジンと言語の記録
      },
      null,
      2
    ) + "\n"
  );
}

function buildMjs(framework, lang) {
  const isTs = lang === "ts";
  const input = isTs ? "main.ts" : "main.js";

  if (framework === "svelte") {
    if (!isTs) {
      return `import { rollup } from "rollup";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import svelte from "rollup-plugin-svelte";

const bundle = await rollup({
  input: "${input}",
  plugins: [svelte({ emitCss: false }), nodeResolve({ browser: true, dedupe: ["svelte"] })],
});
await bundle.write({ file: "bundle.js", format: "iife", name: "App" });
await bundle.close();
console.log("built: bundle.js");
`;
    }
    return `import { rollup } from "rollup";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import svelte from "rollup-plugin-svelte";
import sveltePreprocess from "svelte-preprocess";
import typescript from "@rollup/plugin-typescript";

// <script lang="ts"> は svelte-preprocess が、main.ts は @rollup/plugin-typescript が担当。
const bundle = await rollup({
  input: "${input}",
  plugins: [
    svelte({ preprocess: sveltePreprocess(), emitCss: false }),
    typescript({ tsconfig: "./tsconfig.json" }),
    nodeResolve({ browser: true, dedupe: ["svelte"], extensions: [".mjs", ".js", ".ts", ".svelte"] }),
  ],
});
await bundle.write({ file: "bundle.js", format: "iife", name: "App" });
await bundle.close();
console.log("built: bundle.js");
`;
  }

  // vue
  if (!isTs) {
    return `import { rollup } from "rollup";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import alias from "@rollup/plugin-alias";

// Vue: 実行時テンプレコンパイラ同梱のフルビルドへ寄せる(SFC不要)
const bundle = await rollup({
  input: "${input}",
  plugins: [
    alias({ entries: [{ find: /^vue$/, replacement: "vue/dist/vue.esm-browser.prod.js" }] }),
    nodeResolve({ browser: true, dedupe: ["vue"] }),
  ],
  onwarn(w, warn) { if (!/__VUE|CIRCULAR/.test(w.code + w.message)) warn(w); },
});
await bundle.write({ file: "bundle.js", format: "iife", name: "App" });
await bundle.close();
console.log("built: bundle.js");
`;
  }
  return `import { rollup } from "rollup";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import alias from "@rollup/plugin-alias";
import typescript from "@rollup/plugin-typescript";

// Vue: 実行時テンプレコンパイラ同梱のフルビルドへ寄せる(SFC不要)。TSは @rollup/plugin-typescript で。
const bundle = await rollup({
  input: "${input}",
  plugins: [
    alias({ entries: [{ find: /^vue$/, replacement: "vue/dist/vue.esm-browser.prod.js" }] }),
    typescript({ tsconfig: "./tsconfig.json" }),
    nodeResolve({ browser: true, dedupe: ["vue"], extensions: [".mjs", ".js", ".ts"] }),
  ],
  onwarn(w, warn) { if (!/__VUE|CIRCULAR/.test(w.code + w.message)) warn(w); },
});
await bundle.write({ file: "bundle.js", format: "iife", name: "App" });
await bundle.close();
console.log("built: bundle.js");
`;
}

// ── TS サポートファイル ────────────────────────────────────────
function tsconfigJson() {
  return (
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2020",
          module: "ESNext",
          moduleResolution: "bundler",
          lib: ["ES2020", "DOM", "DOM.Iterable"],
          strict: true,
          skipLibCheck: true,
          esModuleInterop: true,
          forceConsistentCasingInFileNames: true,
          noEmit: true,
          types: [],
        },
        include: ["**/*.ts", "**/*.d.ts"],
        exclude: ["node_modules", "bundle.js"],
      },
      null,
      2
    ) + "\n"
  );
}

// bridgey 本体がまだ型定義を同梱していないためのアンビエント宣言。
// (本体が .d.ts を配るようになったらこのファイルは不要になる)
function envDts(framework) {
  const svelteModule =
    framework === "svelte"
      ? `
declare module "*.svelte" {
  import type { SvelteComponent } from "svelte";
  const component: typeof SvelteComponent;
  export default component;
}
`
      : "";

  return `// bridgey(${PKG}) の暫定型宣言。本体が .d.ts を同梱したら削除してよい。
declare module "${PKG}" {
  export interface State<T> {
    value: T;
    subscribe(run: (v: T) => void): () => void;
    update(fn: (v: T) => T): void;
  }
  export interface Computed<T> {
    readonly value: T;
    subscribe(run: (v: T) => void): () => void;
  }
  export function state<T>(initial: T): State<T>;
  export function computed<T>(fn: () => T): Computed<T>;
  export function computed<T>(deps: unknown, fn: (...vals: any[]) => T): Computed<T>;

  export interface BridgeyInstance {
    text(v?: string): string | BridgeyInstance;
    html(v?: string): string | BridgeyInstance;
    val(v?: string): string | BridgeyInstance;
    attr(name: string, v?: string): string | null | BridgeyInstance;
    addClass(c: string): BridgeyInstance;
    removeClass(c?: string): BridgeyInstance;
    on(events: string, handler: (this: Element, e: Event) => void): BridgeyInstance;
    on(events: string, selector: string, handler: (this: Element, e: Event) => void): BridgeyInstance;
    off(events?: string, handler?: (e: Event) => void): BridgeyInstance;
    bindText<T>(st: State<T> | Computed<T>, format?: (v: T) => unknown): BridgeyInstance;
    bindClass<T>(className: string, st: State<T> | Computed<T>, predicate?: (v: T) => boolean): BridgeyInstance;
    bindAttr<T>(name: string, st: State<T> | Computed<T>, format?: (v: T) => unknown): BridgeyInstance;
    bindValue(st: State<string>): BridgeyInstance;
    dispose(): BridgeyInstance;
    [key: string]: any;
  }
  export interface Dollar {
    (selector: unknown): BridgeyInstance;
    ajax(url: string, options?: Record<string, any>): Promise<any>;
    get(url: string, ...args: any[]): Promise<any>;
    post(url: string, ...args: any[]): Promise<any>;
    [key: string]: any;
  }
  export const $$: Dollar;
  export class Bridgey {}
  export interface MountInstance {
    set(props: Record<string, unknown>): void;
    destroy?(): void;
    [key: string]: any;
  }
  export function mount(
    Component: unknown,
    options?: { target?: string | Element; props?: Record<string, unknown> }
  ): MountInstance;
  export function useEngine(adapter: unknown): void;
  export function engine(): unknown;
}
declare module "${PKG}/engines/svelte.js" {
  export const svelteEngine: unknown;
}
declare module "${PKG}/engines/vue.js" {
  export const vueEngine: unknown;
}
${svelteModule}`;
}

// ── init コマンド ──────────────────────────────────────────────
async function init(args) {
  const bridgeyDep = args.bridgeyDep || "^1.0.0";

  let framework = args.framework;
  if (framework && !FRAMEWORKS.includes(framework)) {
    stdout.write(`Error: 未対応のフレームワーク: ${framework}（svelte|vue）\n`);
    process.exit(1);
  }
  let lang = args.lang;
  if (lang && !LANGUAGES.includes(lang)) {
    stdout.write(`Error: 未対応の言語: ${lang}（js|ts）\n`);
    process.exit(1);
  }

  let dir = args._[1]; // 位置引数があれば優先(なければ対話で尋ねる)

  // 未指定の項目だけ対話で尋ねる。readline は1つだけ作って使い回す。
  if (!dir || !framework || !lang) {
    const rl = createInterface({ input: stdin, output: stdout });
    try {
      if (!dir)
        dir = (await rl.question(`\nプロジェクト名(. で現在のフォルダに生成) [bridgey-app]: `)).trim();
      if (!framework) framework = await promptChoice(rl, "フレームワークを選択", FRAMEWORKS);
      if (!lang)
        lang = await promptChoice(rl, "言語を選択", [
          { value: "js", label: "JavaScript" },
          { value: "ts", label: "TypeScript" },
        ]);
    } finally {
      rl.close();
    }
  }
  if (!dir) dir = "bridgey-app"; // 未指定(空Enter含む)は既定名

  // "." は現在のフォルダに直接生成(新規フォルダを作らない)。
  const useCwd = dir === ".";
  const target = useCwd ? process.cwd() : resolve(process.cwd(), dir);
  const name = basename(target).replace(/[^\w.-]/g, "-") || "bridgey-app";

  // 新規フォルダ生成時のみ「空でないと拒否」。"." は既存カレントへ載せるのでスキップ。
  if (!useCwd && existsSync(target) && (await readdir(target)).length > 0) {
    stdout.write(`Error: ${dir} は空ではありません。別の場所を指定してください。\n`);
    process.exit(1);
  }

  const files = filesFor(framework, lang, name, bridgeyDep);
  if (!useCwd) await mkdir(target, { recursive: true });
  for (const [rel, content] of Object.entries(files)) {
    await writeFile(join(target, rel), content);
  }

  stdout.write(`\nOK: ${framework} · ${lang} スタータを生成: ${useCwd ? "現在のフォルダ" : dir + "/"}\n`);
  Object.keys(files).sort().forEach((f) => stdout.write(`    ${f}\n`));
  stdout.write(
    `\n次の手順:\n` +
      (useCwd ? "" : `  cd ${dir}\n`) +
      `  npm install\n` +
      `  npm run build      # ${lang === "ts" ? "main.ts" : "main.js"}(+部品) → bundle.js\n` +
      `  # index.html を静的サーバーで開く (例: npx serve .)\n`
  );
}

// ── エントリ ───────────────────────────────────────────────────
const args = parseArgs(process.argv.slice(2));
const cmd = args._[0];

if (cmd === "init") {
  await init(args);
} else {
  stdout.write(
    `brg — jQueryの書き味で本物のモダンFWを、限りなく楽に\n\n` +
      `使い方:\n` +
      `  brg init [dir] [--framework svelte|vue] [--lang js|ts] [--bridgey-dep <spec>]\n\n` +
      `例:\n` +
      `  brg init my-app                 # 対話でフレームワーク・言語を選択\n` +
      `  brg init my-app -f vue          # Vue(言語は対話)\n` +
      `  brg init my-app -f svelte -l ts # Svelte + TypeScript(非対話)\n`
  );
  process.exit(cmd ? 1 : 0);
}
