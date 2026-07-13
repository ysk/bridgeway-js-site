// main.js — カウンター。エンジンを選んで、コンポーネントを載せるだけ。
import { mount, useEngine } from "../../src/index.js";
import { svelteEngine } from "../../src/engines/svelte.js";
import App from "./App.svelte";

useEngine(svelteEngine);

mount(App, { target: "#app", props: { name: "bridge.js" } });
