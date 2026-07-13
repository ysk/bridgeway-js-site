<!-- Todo.svelte — 本物のSvelteコンポーネント。
     一覧描画・{#if}/{#each}・DOM差分は全部ここ(Svelte)の担当。bridgeは関与しない。
     旧実装(bindListでinnerHTML総入れ替え)との違い:
       keyed each {#each visible as t (t.id)} → 差分更新。トグル/削除しても
       他行のDOMは作り直されない = チェックボックスのフォーカスや途中状態が飛ばない(②解消)。 -->
<script>
  // 周辺グルー(bridge/jQuery側)へ残り件数を渡すコールバック。
  // propなので初期化時から在り、初回の派生値も取りこぼさない(イベントのレースを回避)。
  export let onRemaining = () => {};

  let todos = [
    { id: 1, text: "bridge.js を試す", done: true },
    { id: 2, text: "レガシー脳のまま Todo を書く", done: false },
    { id: 3, text: "モダンJSに移行する", done: false },
  ];
  let nextId = 4;
  let draft = "";
  let filter = "all"; // "all" | "active" | "done"

  // 派生値。Svelteのリアクティブ宣言(式はビルド時コンパイル=eval無し=③)
  $: visible =
    filter === "active" ? todos.filter((t) => !t.done)
    : filter === "done" ? todos.filter((t) => t.done)
    : todos;
  $: remaining = todos.filter((t) => !t.done).length;

  // 残り件数が変わるたび、外の世界(bridge/jQuery側)へ通知。周辺の命令的表示に使える。
  $: onRemaining(remaining);

  function add() {
    const text = draft.trim();
    if (!text) return;
    todos = [...todos, { id: nextId++, text, done: false }];
    draft = "";
  }
  const toggle = (id) =>
    (todos = todos.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  const remove = (id) => (todos = todos.filter((t) => t.id !== id));
  const clearDone = () => (todos = todos.filter((t) => !t.done));
</script>

<div class="input-row">
  <!-- bind:value と on:keydown はSvelteが結線。入力途中の値は差分更新で保持される -->
  <input placeholder="やることを入力して Enter" autofocus
    bind:value={draft} on:keydown={(e) => e.key === "Enter" && add()} />
  <button on:click={add}>追加</button>
</div>

{#if visible.length === 0}
  <p class="empty">やることがありません 🎉</p>
{:else}
  <ul class="todos">
    {#each visible as t (t.id)}
      <li class:done={t.done} data-id={t.id}>
        <input class="toggle" type="checkbox" checked={t.done} on:change={() => toggle(t.id)} />
        <span class="text">{t.text}</span>
        <button class="del" title="削除" on:click={() => remove(t.id)}>✕</button>
      </li>
    {/each}
  </ul>
{/if}

<div class="bar">
  <span>残り {remaining} 件</span>
  <span class="filters">
    <button class:active={filter === "all"} on:click={() => (filter = "all")}>すべて</button>
    <button class:active={filter === "active"} on:click={() => (filter = "active")}>未完了</button>
    <button class:active={filter === "done"} on:click={() => (filter = "done")}>完了</button>
  </span>
  <button id="clear" on:click={clearDone}>完了を削除</button>
</div>
