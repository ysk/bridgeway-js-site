<script>
  import { createEventDispatcher } from "svelte";

  // bridgey の state() / computed() をそのまま props で受け取る。
  // これらは Svelteストア互換(.subscribe を持つ)なので $query / $items で読める。
  export let query;
  export let items;

  const dispatch = createEventDispatcher();
</script>

<div class="island">
  <p class="hd">Svelteの領域（描画担当）</p>
  <p>検索語: <strong>{$query || "(未入力)"}</strong> — {$items.length}件</p>
  <ul>
    {#each $items as it}
      <li><button on:click={() => dispatch("pick", it)}>{it}</button></li>
    {/each}
  </ul>
</div>

<style>
  .island { background: #f6f9ff; border: 1px solid #dbe6ff; border-radius: 8px; padding: 4px 16px 12px; }
  .hd { font-size: 12px; color: #4361ee; font-weight: 700; margin: 8px 0 4px; }
  ul { list-style: none; padding: 0; display: flex; flex-wrap: wrap; gap: 6px; }
  button { font: inherit; padding: 4px 10px; border: 1px solid #cdd7ff; border-radius: 6px; background: #fff; cursor: pointer; }
  button:hover { background: #eef3ff; }
</style>
