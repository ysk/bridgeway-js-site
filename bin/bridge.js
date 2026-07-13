#!/usr/bin/env node
// bin/bridge.js — bridge の CLI。
//
// 究極ビジョンの入口:
//   npm install bridge
//   npx bridge init my-app
//     ? フレームワークを選択:  ❯ svelte   vue
//   → 選んだエンジンに配線済みのスタータ一式を生成する。
//
// 依存ゼロ(Node標準のみ)。対話選択、または --framework で非対話。
//
// 生成コードは常に公開パッケージ名 "bridge" を import する(=そのまま npm install で解決)。
//   import { $$, state, mount, useEngine } from "bridge";
//   import { svelteEngine } from "bridge/engines/svelte.js";  // or vue
//
// 使い方:
//   bridge init [dir] [--framework svelte|vue] [--bridge-dep <spec>]
//     dir           生成先(既定: bridge-app)
//     --framework   省略時は対話選択
//     --bridge-dep  生成package.jsonが依存するbridgeの指定(既定: "^1.0.0")。
//                   未公開のローカル検証時は t>gz への file: 指定も可
//                   例) --bridge-dep "file:../bridge-1.0.0.tgz"
//
// エンジンはプロジェクト作成時に一度だけ選ぶ(後から切り替える機能は持たない)。
// 別エンジンを試すなら別プロジェクトを作る。利用者コード($$/state/mount)は共通。

import { mkdir, writeFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve, basename } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

const FRAMEWORKS = ["svelte", "vue"];
const PKG = "bridgeway"; // 公開パッケージ名

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--framework" || a === "-f") args.framework = argv[++i];
    else if (a.startsWith("--framework=")) args.framework = a.split("=")[1];
    else if (a === "--bridge-dep") args.bridgeDep = argv[++i];
    else if (a.startsWith("--bridge-dep=")) args.bridgeDep = a.split("=")[1];
    else args._.push(a);
  }
  return args;
}

async function promptFramework() {
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    stdout.write("\nフレームワークを選択:\n");
    FRAMEWORKS.forEach((f, i) => stdout.write(`  ${i + 1}) ${f}\n`));
    while (true) {
      const ans = (await rl.question("番号または名前 [1]: ")).trim() || "1";
      const byNum = FRAMEWORKS[Number(ans) - 1];
      const pick = byNum || (FRAMEWORKS.includes(ans) ? ans : null);
      if (pick) return pick;
      stdout.write("  ↳ svelte か vue を選んでください\n");
    }
  } finally {
    rl.close();
  }
}

// ── テンプレート(フレームワーク別) ─────────────────────────────
// 生成物はどれも「利用者コードは $$/state/mount で共通、違いはエンジン選択と部品の書式だけ」。

function filesFor(framework, name, bridgeDep) {
  const common = {
    "index.html": `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${name} — bridge.js (${framework})</title>
</head>
<body>
  <h1>${name} <small>engine: ${framework}</small></h1>
  <div id="app"></div>
  <div><button id="reset">リセット</button> 状態: <span id="log"></span></div>
  <script src="./bundle.js"></script>
</body>
</html>
`,
    ".gitignore": "node_modules\nbundle.js\n",
  };

  if (framework === "svelte") {
    return {
      ...common,
      "App.svelte": `<script>
  export let name = "world";
  let count = 0;
  $: doubled = count * 2;
</script>

<p>こんにちは {name} — 本物のSvelte。</p>
<button on:click={() => count--}>−</button>
<strong>{count}</strong>
<button on:click={() => count++}>＋</button>
<span>(2倍: {doubled})</span>
{#if count >= 10}<p>🔥 10以上</p>{/if}
`,
      "main.js": `// bridge本体はエンジン非依存。起動時に一度だけエンジンを選ぶ。
import { $$, state, mount, useEngine } from "${PKG}";
import { svelteEngine } from "${PKG}/engines/svelte.js";
import App from "./App.svelte";

useEngine(svelteEngine);

const app = mount(App, { target: "#app", props: { name: "${name}" } });

const log = state("mounted ✅");
$$("#log").bindText(log);
$$("#reset").on("click", () => { app.set({ name: "world" }); log.value = "reset"; });
`,
      "build.mjs": buildMjs("svelte"),
      "package.json": pkgJson(name, "svelte", bridgeDep, { svelte: "^4" }, {
        rollup: "^4",
        "@rollup/plugin-node-resolve": "^16",
        "rollup-plugin-svelte": "^7",
      }),
    };
  }

  // vue
  return {
    ...common,
    "App.js": `export default {
  props: { name: { type: String, default: "world" } },
  data: () => ({ count: 0 }),
  computed: { doubled() { return this.count * 2; } },
  template: \`
    <p>こんにちは {{ name }} — 本物のVue。</p>
    <button @click="count--">−</button>
    <strong>{{ count }}</strong>
    <button @click="count++">＋</button>
    <span>(2倍: {{ doubled }})</span>
    <p v-if="count >= 10">🔥 10以上</p>
  \`,
};
`,
    "main.js": `// Vueを選んだので、useEngine(vueEngine) を一度だけ呼ぶ。
// これ以降の $$/state/mount はSvelte版と同じ書き味。
import { $$, state, mount, useEngine } from "${PKG}";
import { vueEngine } from "${PKG}/engines/vue.js";
import App from "./App.js";

useEngine(vueEngine);

const app = mount(App, { target: "#app", props: { name: "${name}" } });

const log = state("mounted ✅");
$$("#log").bindText(log);
$$("#reset").on("click", () => { app.set({ name: "world" }); log.value = "reset"; });
`,
    "build.mjs": buildMjs("vue"),
    "package.json": pkgJson(name, "vue", bridgeDep, { vue: "^3" }, {
      rollup: "^4",
      "@rollup/plugin-node-resolve": "^16",
      "@rollup/plugin-alias": "^5",
    }),
  };
}

function pkgJson(name, framework, bridgeDep, deps, devDeps) {
  return (
    JSON.stringify(
      {
        name,
        private: true,
        type: "module",
        scripts: { build: "node build.mjs" },
        dependencies: { [PKG]: bridgeDep, ...deps }, // bridge本体 + 選んだFW
        devDependencies: devDeps,
        bridge: { framework }, // 選択したエンジンの記録
      },
      null,
      2
    ) + "\n"
  );
}

function buildMjs(framework) {
  if (framework === "svelte") {
    return `import { rollup } from "rollup";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import svelte from "rollup-plugin-svelte";

const bundle = await rollup({
  input: "main.js",
  plugins: [svelte({ emitCss: false }), nodeResolve({ browser: true, dedupe: ["svelte"] })],
});
await bundle.write({ file: "bundle.js", format: "iife", name: "App" });
await bundle.close();
console.log("built: bundle.js");
`;
  }
  return `import { rollup } from "rollup";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import alias from "@rollup/plugin-alias";

// Vue: 実行時テンプレコンパイラ同梱のフルビルドへ寄せる(SFC不要)
const bundle = await rollup({
  input: "main.js",
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

// ── init コマンド ──────────────────────────────────────────────
async function init(args) {
  const dir = args._[1] || "bridge-app";
  const target = resolve(process.cwd(), dir);
  const name = basename(dir).replace(/[^\w.-]/g, "-") || "bridge-app";
  const bridgeDep = args.bridgeDep || "^1.0.0";

  if (existsSync(target) && (await readdir(target)).length > 0) {
    stdout.write(`✗ ${dir} は空ではありません。別の場所を指定してください。\n`);
    process.exit(1);
  }

  let framework = args.framework;
  if (framework && !FRAMEWORKS.includes(framework)) {
    stdout.write(`✗ 未対応のフレームワーク: ${framework}（svelte|vue）\n`);
    process.exit(1);
  }
  if (!framework) framework = await promptFramework();

  const files = filesFor(framework, name, bridgeDep);
  await mkdir(target, { recursive: true });
  for (const [rel, content] of Object.entries(files)) {
    await writeFile(join(target, rel), content);
  }

  stdout.write(`\n✓ ${framework} スタータを生成: ${dir}/\n`);
  Object.keys(files).sort().forEach((f) => stdout.write(`    ${f}\n`));
  stdout.write(
    `\n次の手順:\n` +
      `  cd ${dir}\n` +
      `  npm install\n` +
      `  npm run build      # main.js(+部品) → bundle.js\n` +
      `  # index.html を静的サーバーで開く (例: npx serve .)\n\n` +
      `エンジン(${framework})はこのプロジェクトの選択です。別エンジンを試すなら別プロジェクトを作ってください。\n` +
      `利用者コード($$ / state / mount)は共通なので、知識はそのまま移せます。\n`
  );
}

// ── エントリ ───────────────────────────────────────────────────
const args = parseArgs(process.argv.slice(2));
const cmd = args._[0];

if (cmd === "init") {
  await init(args);
} else {
  stdout.write(
    `bridge — jQueryの書き味で本物のモダンFWを、限りなく楽に\n\n` +
      `使い方:\n` +
      `  bridge init [dir] [--framework svelte|vue] [--bridge-dep <spec>]\n\n` +
      `例:\n` +
      `  bridge init my-app                 # 対話でフレームワーク選択\n` +
      `  bridge init my-app -f vue          # 非対話でVue\n`
  );
  process.exit(cmd ? 1 : 0);
}
