jQueryライクな書き味を残しつつ、本物のモダンフレームワーク（Svelte、将来はVue等）の恩恵を、限りなく楽に受けられるOSS。

キャッチコピー（全面に出す）
・jQueryでできる、モダン開発。（覚えるのは $ を $$ にすることだけ）

コンセプト（一言）
・モダンな技術を、限りなく楽に。＝ 学習コストの削減。

ターゲット
・レガシー環境で日々jQueryの保守作業を行っていたり、WordPressなどのweb制作の現場で、なかなかモダンフレームワークを導入する機会がない人へ
・jQueryならわかる人

必須要件
・書き味はjQueryと同じ（$$ / state / mount の薄い皮）。
・裏側は「なんちゃって」ではなく本物のフレームワークが機能する（DOM差分・リアクティビティ・後片付けはエンジンに委譲）。
・エンジンは差し替え式。利用者の $$ / state / mount は下がSvelteでもVueでも不変。

将来的な要件
・一旦Svelteだが、将来的にはVueや他フレームワークにもできる限り対応させたい。
・究極像: 「npm install bridge → フレームワーク選択(svelte / vue)」でエンジンを対話的に選び自動配線。
・対象はHTML-firstなFW(Svelte/Vue)に限定。React等の宣言的JSX系は思想が逆(命令的DOM操作を避ける/単体リアクティブ原子が無い/JSX前提)で「jQuery脳のまま」と噛み合わないため対象外（2026-07-13決定）。

究極的には
【もう新しいフロントエンドフレームワークに翻弄されない】

方針転換の記録（2026-07-13）— 詳細は memory/deep-svelte-pivot.md
・「深いSvelte移行」を採用。自前擬似テンプレ(旧 src/template.js / new Function)・innerHTML総入れ替え・jQuery共存の島機構は撤去済み。
・これにより地雷が解消: ①看板倒れ→本物Svelte / ②innerHTML総替え→差分更新 / ③eval→コンパイル(CSPセーフ) / ④購読漏れ→destroyで自動片付け。
・⑤は「薄いヘルパー＋最小ライフサイクル(mount/destroy)」に留める（router/scoped CSSは入れない）。
・代償: 本物Svelte＝コンパイラ＝ビルド必須（script1本・ビルド不要は失う）。
・jQuery共存は「サポートしない」（機能として売らない）。ただし領域分離（例: カルーセル=jQuery / フォーム=Svelte、ノードを分ける）なら自己責任で可能。禁止は同一ノード相乗りのみ。

主要構成
・src/engine.js … エンジン契約 {state, computed, mount} のレジストリ（useEngineで差し替え）
・src/engines/svelte.js … 既定エンジン（本物のSvelte）
・src/mount.js … mount()はエンジンのmountへ委譲
・src/bridge.js … $$（命令的グルー）＋ state/computed（束縛はdispose()で購読解除）
・src/index.js（ESM）/ src/global.js（IIFEグローバル）
・sample/deep, sample/todoapp … 本物の.svelte実証（node build.demo.mjs でバンドル）

背景思想
・自分がフロントエンドエンジニアだったころjQueryからVueの移行が難しく、とん挫した。
・その時の自分を救うようなフレームワークを作りたい。
・いまでもモダン技術に触れず焦りつつ、日々の業務はレガシーってひと多いと思う。
