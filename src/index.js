// index.js — bridge.js の ESM ライブラリ・エントリ(window汚染なし)。
//
// 【新方針: 深いSvelte移行】
//   構造・制御構文・リスト描画は本物の .svelte に委ねる(コンパイラが外科手術的に更新)。
//   → 自前テンプレ(旧 template.js)と innerHTML 総入れ替えは廃止。CSPセーフ。
//   bridge が担うのは「jQueryの書き味(命令的グルー)」と「薄いライフサイクル」だけ。
//
//   $$      … jQuery風のDOM操作(イベント/クラス/テキスト、既存の手が動く部分)
//   state   … Svelteストア(writable)の薄いハンドル
//   computed… Svelteストア(derived)。依存自動追跡
//   mount   … Svelteコンポーネントを載せる/破棄する(destroyで購読もDOMも自動片付け)

export { $$, Bridge, state, computed } from "./bridge.js";
export { mount } from "./mount.js";
export { useEngine, engine } from "./engine.js";
