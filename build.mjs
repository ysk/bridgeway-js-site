// build.mjs — サイトの配布物を dist/ に出す。
//
// v1 では bridgey 本体（Svelte / Vue 同梱版）もここでビルドしていたが、
// v2 では本体は隣のリポジトリで作り、sync-bridgey.mjs で vendor/ に取り込む。
// ここが作るのはサイト自身のコードだけ。
//
//   dist/bridgey.js   … 本体（vendor から複製。サイト自身も bridgey で動いている）
//   dist/site.js      … サイトのルーター（ソースは site.js）
//   dist/styles.css   … サイトのスタイル（ソースは styles.css）
//
//   node build.mjs

import { build } from "esbuild";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";

await mkdir(new URL("./dist/", import.meta.url), { recursive: true });

// ビューを1ファイルに埋め込む。
//   ・file:// で直接開いても動く（fetch は file:// では CORS でブロックされる）
//   ・ページ切り替えのたびに通信しない
//   ・「ビルド不要」を看板にしているサイトが、閲覧にサーバーを要求しないようにする
const VIEWS = ["home", "docs", "tutorial", "examples"];
const embedded = {};
for (const name of VIEWS) {
  embedded[name] = await readFile(new URL(`./views/${name}.html`, import.meta.url), "utf8");
}
// サンプルの「HTML + JS」を抜き出して埋め込む。
//   ・JS は site.js の**元のソース**から取る（バンドル後のコードを見せると
//     変数名が変わったり 30000 が 3e4 になったりして、サンプルとして読めない）
//   ・HTML は view の <!-- sample:名前:start / end --> の間
// こうしておくと、実装を直したらサンプルの表示も必ず一緒に変わる。
const siteSource = await readFile(new URL("./site.js", import.meta.url), "utf8");

function extractFunctionBody(source, name) {
  const head = `function ${name}($el) {`;
  const start = source.indexOf(head);
  if (start === -1) throw new Error(`関数が見つかりません: ${name}`);
  const bodyStart = start + head.length;
  const bodyEnd = source.indexOf("\n  }\n", bodyStart);
  const body = source.slice(bodyStart, bodyEnd);
  const lines = body.replace(/\t/g, "  ").split("\n");
  const indent = Math.min(
    ...lines.filter((line) => line.trim()).map((line) => line.match(/^ */)[0].length)
  );
  return lines.map((line) => line.slice(indent)).join("\n").trim();
}

function extractMarkup(views, name) {
  for (const html of Object.values(views)) {
    const start = html.indexOf(`<!-- sample:${name}:start -->`);
    if (start === -1) continue;
    const end = html.indexOf(`<!-- sample:${name}:end -->`);
    const raw = html.slice(html.indexOf("\n", start) + 1, end);
    const lines = raw.replace(/\t/g, "  ").replace(/\s+$/, "").split("\n");
    const indent = Math.min(
      ...lines.filter((line) => line.trim()).map((line) => line.match(/^ */)[0].length)
    );
    return lines.map((line) => line.slice(indent)).join("\n").trim();
  }
  return "";
}

const SAMPLES = ["homeDemo", "counter", "exampleForm", "cart", "todo"];
const MARKUP_OF = {
  counter: "counter",
  cart: "cart",
  todo: "todo",
  homeDemo: "home-demo",
  exampleForm: "form",
};
const samples = {};
for (const name of SAMPLES) {
  samples[name] = {
    js: extractFunctionBody(siteSource, name),
    html: extractMarkup(embedded, MARKUP_OF[name] ?? name),
  };
}
await writeFile(
  new URL("./dist/samples.js", import.meta.url),
  `/*! bridgey site samples (build 時に site.js と views から生成) */\n` +
    `window.__BRIDGEY_SAMPLES = ${JSON.stringify(samples)};\n`
);

await writeFile(
  new URL("./dist/views.js", import.meta.url),
  `/*! bridgey site views (build 時に views/*.html から生成) */\n` +
    `window.__BRIDGEY_VIEWS = ${JSON.stringify(embedded)};\n`
);

// 本体は vendor から複製する（ビルドしない。中身は隣のリポジトリの成果物そのまま）
await copyFile(
  new URL("./vendor/bridgey/bridgey.js", import.meta.url),
  new URL("./dist/bridgey.js", import.meta.url)
);

// site.js は minify しない。
// このサイトは「実際に動いている関数をそのまま表示する」ので、
// minify すると読めないコードを見せることになる（3.5kB の節約より読めることを取る）。
await build({
  entryPoints: ["site.js"],
  outfile: "dist/site.js",
  bundle: true,
  format: "iife",
  minify: false,
  platform: "browser",
  target: "es2020",
  charset: "utf8",
  banner: { js: "/*! bridgey site — サイト自身も bridgey で動いています。MIT License */" },
});

await build({
  entryPoints: ["styles.css"],
  outfile: "dist/styles.css",
  minify: true,
  bundle: false, // 相対 url()/@import は無いのでパスをそのまま維持
  banner: { css: "/*! bridgey site styles. MIT License */" },
});

const KB = (n) => `${(n / 1024).toFixed(1)}kB`;
console.log("\n出力:");
for (const file of ["dist/bridgey.js", "dist/views.js", "dist/samples.js", "dist/site.js", "dist/styles.css"]) {
  const code = await readFile(new URL(`./${file}`, import.meta.url));
  console.log(`  ${file.padEnd(18)} ${KB(code.length).padStart(8)}  gzip ${KB(gzipSync(code).length).padStart(8)}`);
}
console.log("");
