# Third-Party Notices

bridge.js 本体は MIT License です（`LICENSE` 参照）。

配布ビルド（`dist/`）には、選択に応じて以下のソフトウェアが**同梱**されます。
これらはそれぞれの権利者に帰属し、各ライセンス（いずれもMIT）に従います。

- `dist/bridge.js` … Svelte を同梱
- `dist/bridge.vue.js` … Vue を同梱

npm 版（`import "bridge"`）を使う場合、Svelte / Vue は利用者が自身で
`npm install` した各パッケージが使われます（bridge には同梱されません）。

---

## Svelte

`dist/bridge.js` に同梱。

```
Copyright (c) 2016-23 the Svelte contributors
https://github.com/sveltejs/svelte/graphs/contributors

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in the
Software without restriction, including without limitation the rights to use, copy,
modify, merge, publish, distribute, sublicense, and/or sell copies of the Software,
and to permit persons to whom the Software is furnished to do so, subject to the
following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF
CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE
OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

## Vue.js

`dist/bridge.vue.js` に同梱。

```
The MIT License (MIT)

Copyright (c) 2018-present, Yuxi (Evan) You

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

---

## 商標・関連プロジェクトについて

bridge.js は独立した非公式プロジェクトです。以下のプロジェクト／団体とは
提携・後援・承認の関係にありません。名称は各所有者の商標です。

- **jQuery** — OpenJS Foundation の商標。bridge.js は jQuery の書き味に着想を得ていますが、
  jQuery のコードは含みません（API を独自に再実装したものです）。
- **Svelte** — Svelte プロジェクト／contributors。
- **Vue.js** — Yuxi (Evan) You および Vue.js プロジェクト。
