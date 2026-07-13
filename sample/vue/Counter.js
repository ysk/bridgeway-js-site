// Counter.js — Vue 3コンポーネント(template文字列)。sample/deep と同じ画面をVueで。
export default {
  name: "Counter",
  props: { name: { type: String, default: "world" } },
  data() {
    return { count: 0, text: "" };
  },
  computed: {
    doubled() {
      return this.count * 2;
    },
  },
  template: `
    <div class="card">
      <p>こんにちは、<strong>{{ name }}</strong>。</p>

      <div class="row">
        <button @click="count--">−</button>
        <span class="num" :class="{ big: count >= 10 }">{{ count }}</span>
        <button @click="count++">＋</button>
        <span class="muted">2倍: {{ doubled }}</span>
      </div>

      <p v-if="count > 10" class="hot">10を超えました</p>
      <p v-else-if="count < 0" class="cold">マイナスです</p>
      <p v-else class="muted">0 〜 10</p>

      <p class="proof">
        <label>
          文字を入力しながら「＋」を押しても、
          <input v-model="text" placeholder="ここに入力したまま試す" />
        </label>
        <br />
        <small>入力中の文字（「{{ text }}」）もカーソルも消えません。</small>
      </p>
    </div>
  `,
};
