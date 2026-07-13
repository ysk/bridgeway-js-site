<script>
  export let name = "world";

  let count = 0;
  let text = "";

  $: doubled = count * 2;
</script>

<div class="card">
  <p>こんにちは、<strong>{name}</strong>。</p>

  <div class="row">
    <button on:click={() => (count -= 1)}>−</button>
    <span class="num" class:big={count >= 10}>{count}</span>
    <button on:click={() => (count += 1)}>＋</button>
    <span class="muted">2倍: {doubled}</span>
  </div>

  {#if count > 10}
    <p class="hot">10を超えました</p>
  {:else if count < 0}
    <p class="cold">マイナスです</p>
  {:else}
    <p class="muted">0 〜 10</p>
  {/if}

  <p class="proof">
    <label>
      文字を入力しながら「＋」を押しても、
      <input bind:value={text} placeholder="ここに入力したまま試す" />
    </label>
    <br />
    <small>入力中の文字（「{text}」）もカーソルも消えません。</small>
  </p>
</div>

<style>
  .card { background: #fafafa; border: 1px solid #eee; border-radius: 8px; padding: 16px; }
  .row { display: flex; align-items: center; gap: 12px; margin: 8px 0; }
  button { font-size: 16px; padding: 4px 12px; cursor: pointer; }
  .num { font-size: 28px; font-weight: bold; min-width: 2em; text-align: center; }
  .num.big { color: crimson; }
  .muted { color: #888; }
  .hot { color: crimson; }
  .cold { color: #2b7; }
  .proof { margin-top: 12px; }
  input { font-size: 15px; padding: 4px 8px; }
</style>
