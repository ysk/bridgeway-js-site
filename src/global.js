// global.js — 配布版(bridgey)のエントリ。
//
// <script src="bridgey.js"></script> を読み込むと、$$ / state / computed / mount /
// useEngine がグローバル(window)で使える。ライブラリ本体は index.js(window非依存)。
//
// 注意: mount() は「コンパイル済みコンポーネント」を渡す前提なので、実運用では
// 利用者側のビルド(.svelte/.vue のコンパイル)と併用する。$$ / state / computed は
// 素の <script> でもそのまま使える。

import { $$, Bridgey, state, computed } from "./bridgey.js";
import { mount } from "./mount.js";
import { useEngine, engine } from "./engine.js";
import { svelteEngine } from "./engines/svelte.js";
import { attachGlobal } from "./attach-global.js";

// グローバル配布版は「読み込むだけで使える」利便性を優先し、既定でSvelteを配線。
// (ESMの import "bridgey" 経路はエンジンを巻き込まない = optional peer を保つ)
useEngine(svelteEngine);

const api = { $$, Bridgey, state, computed, mount, useEngine, engine, svelteEngine };

// window へ公開(衝突退避 + noConflict/alias 付き)
attachGlobal(api);
