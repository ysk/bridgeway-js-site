// main.js — Vue版カウンター。
// sample/deep(Svelte)と同じ利用者コード。違いは useEngine(vueEngine) の1行だけ。
import { $$, state, mount, useEngine } from "../../src/index.js";
import { vueEngine } from "../../src/engines/vue.js";
import Counter from "./Counter.js";

useEngine(vueEngine);

// state も $$ もエンジンに依らず同じ書き味で動く
const engineLabel = state("vue");
$$("#engine").bindText(engineLabel);

mount(Counter, { target: "#app", props: { name: "bridgey" } });
