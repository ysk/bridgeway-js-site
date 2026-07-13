// mount.js — 薄いライフサイクル。⑤「薄いヘルパー+最小ライフサイクル」の核。
//
// 【重要: エンジンに委譲する】
//   mount はSvelte決め打ちにしない。現在のエンジン(engine())の mount() に委ねる。
//   → 将来 Vue エンジンに差し替えても、利用者の mount(Component,...) は変えなくていい。
//     これが「もう新しいフレームワークに翻弄されない」の実体。
//
// 使い方(利用者から見たAPIはエンジンに依らず一定):
//   const app = mount(App, { target: "#app", props: { name: "bridge" } });
//   app.set({ name: "world" });   // props更新
//   app.on("submit", (e) => ...); // コンポーネントのイベント購読
//   app.destroy();                // 購読もDOMもエンジンが自動片付け(④/⑤が消える)

import { engine } from "./engine.js";

export function mount(Component, options = {}) {
  const eng = engine();
  if (typeof eng.mount !== "function") {
    throw new Error(
      `[bridge] 現在のエンジン(${eng.name || "?"})は mount() 未対応です`
    );
  }
  const target =
    typeof options.target === "string"
      ? document.querySelector(options.target)
      : options.target || document.body;

  return eng.mount(Component, { ...options, target });
}
