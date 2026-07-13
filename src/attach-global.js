// attach-global.js — <script>版で window に公開する共通処理。名前衝突に配慮。
//
// 方針(jQuery流):
//   ・安定した名前空間 window.bridgeway は必ず残す。衝突が怖ければ常にこれ経由で使える。
//   ・利便性のため $$ / state / … も window に載せるが、上書き前の値は退避しておく。
//   ・bridgeway.noConflict() で元に戻して好きな名前に束ね直せる。
//   ・bridgeway.alias("名前") で任意名エイリアス(既存名は壊さない)。
//
// 現場が既に $$ を定義している場合(例: Prototype.js)への対策がこれ。

const NAMES = ["$$", "state", "computed", "mount", "useEngine", "engine"];

export function attachGlobal(api) {
  if (typeof window === "undefined") return api;

  // 上書き前の値を退避(衝突復元用)
  const prev = {};
  for (const k of NAMES) prev[k] = window[k];
  const prevNs = window.bridgeway;

  Object.assign(window, api);
  window.bridgeway = api; // ← 安定名前空間。window.bridgeway.$$ / bridgeway.state で常に届く

  const restore = (k, v) => {
    if (v === undefined) delete window[k];
    else window[k] = v;
  };

  /**
   * 衝突回避。
   *   const b$ = bridgeway.noConflict();      // $$ を元に戻し、bridgeway の $$ を戻り値で受ける
   *   const B  = bridgeway.noConflict(true);  // 触った全グローバルを元に戻し、api を返す
   */
  api.noConflict = function (all) {
    restore("$$", prev["$$"]);
    if (all) {
      NAMES.forEach((k) => restore(k, prev[k]));
      restore("bridgeway", prevNs);
    }
    return all ? api : api.$$;
  };

  /** 任意名エイリアス。既存名があれば壊さず警告のみ。 例) bridgeway.alias("jq") → window.jq */
  api.alias = function (name) {
    if (name in window && window[name] !== api.$$) {
      console.warn(`[bridgeway] window.${name} は既に使われています。alias を中止しました。`);
      return api.$$;
    }
    window[name] = api.$$;
    return api.$$;
  };

  return api;
}
