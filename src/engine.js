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
//   ゆくゆくは「npm install bridge → フレームワーク選択(svelte/vue)」でこれを自動配線する。
// ────────────────────────────────────────────────────────

// 既定エンジンは静的importしない。
// → こうすることで、import "bridge" が特定エンジン(svelte)を巻き込まなくなり、
//   svelte / vue を optional peer にできる(選んだ方だけ npm install すればよい)。
//   利用者は起動時に useEngine(svelteEngine | vueEngine) を一度だけ呼ぶ。
//   (グローバル配布版 src/global.js は既定でsvelteを配線して <script> 用途を保つ)
let current = null;

/** 使用するエンジンを選択/差し替える。アプリ起動時に一度だけ呼ぶ。 */
export function useEngine(adapter) {
  if (!adapter || typeof adapter.state !== "function") {
    throw new Error("[bridge] 不正なエンジン: state(initial) を実装してください");
  }
  current = adapter;
}

/** 現在のエンジンを取得(表側APIが内部利用)。 */
export function engine() {
  if (!current) {
    throw new Error(
      "[bridge] エンジン未選択です。起動時に useEngine(...) を呼んでください。\n" +
        '  import { svelteEngine } from "bridgeway/engines/svelte.js"; useEngine(svelteEngine);\n' +
        '  または import { vueEngine } from "bridgeway/engines/vue.js"; useEngine(vueEngine);'
    );
  }
  return current;
}
