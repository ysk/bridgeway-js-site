// sync-bridgey.mjs — 隣のリポジトリで作った bridgey の配布物を、このサイトへ取り込む。
//
// 【なぜコピーするのか】
//   ・このサイトは bridgey 自身で動いている（ドッグフーディング）。だから配布物が必要。
//   ・Vercel でビルドするときは隣のリポジトリが存在しないので、
//     取り込んだファイルを **このリポジトリにコミットしておく**必要がある。
//   ・npm に bridgey@2 が公開されたら、この仕組みは CDN 参照に置き換えられる。
//
//   node sync-bridgey.mjs
//     隣にコアがあれば最新をコピーする。無ければ既にあるものをそのまま使う。

import { copyFile, mkdir, stat, readFile } from "node:fs/promises";

const CORE = new URL("../brigde-js-core/dist/", import.meta.url);
const HERE = new URL("./vendor/bridgey/", import.meta.url);

const FILES = ["bridgey.js", "bridgey.dev.js"];

await mkdir(HERE, { recursive: true });

let copied = 0;
for (const name of FILES) {
  const from = new URL(name, CORE);
  try {
    await stat(from);
  } catch {
    continue; // 隣のリポジトリが無い（Vercel 等）→ 既にあるものを使う
  }
  await copyFile(from, new URL(name, HERE));
  copied++;
}

if (copied > 0) {
  const pkg = JSON.parse(await readFile(new URL("../brigde-js-core/package.json", import.meta.url), "utf8"));
  console.log(`bridgey v${pkg.version} を vendor/bridgey/ に取り込みました（${copied}ファイル）`);
} else {
  try {
    await stat(new URL("bridgey.js", HERE));
    console.log("隣のコアが見つからないので、取り込み済みの vendor/bridgey/bridgey.js を使います");
  } catch {
    console.error(
      "bridgey の配布物がありません。\n" +
        "  ../brigde-js-core で `npm run build` を実行してから、もう一度お試しください。"
    );
    process.exit(1);
  }
}
