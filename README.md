# Nexiary → はてなブログ移行キット

Nexiaryの全84記事を、はてなブログにそのまま貼り付けられるHTMLに変換し、
AtomPub APIで自動投稿するためのスクリプト一式です。

## フォルダ構成

```
hatena-export/
├── posts/                  # 記事ごとのHTML（84件）。手動投稿ならこれをコピペするだけ
├── manifest.json           # 全記事のタイトル・タグ・日付・HTMLファイルの一覧
├── hatena-style.css        # 記事内の見た目（カード・図解など）を再現するCSS
├── scripts/
│   ├── post-to-hatena.js   # 自動投稿スクリプト（AtomPub API使用）
│   └── posted-log.json     # 投稿済み記事の記録（自動更新される）
├── .github/workflows/
│   └── auto-post-hatena.yml # GitHub Actionsで定期自動投稿する設定
└── README.md
```

## 1. まずデザインを反映する（1回だけ）

1. はてなブログの管理画面 →「デザイン」→「カスタマイズ」→「CSS」を開く
2. `hatena-style.css` の中身を全部コピーして貼り付け、保存

これで記事中のアフィリエイトカードや図解（SVG）が、元サイトに近い見た目で表示されます。
（フォントは元サイトが使っている `--font-display` 等の変数を参照していますが、
はてな側にはその変数が無いため、自動的に游明朝／メイリオ等のシステムフォントにフォールバックします。
気になる場合は `hatena-style.css` 冒頭に `@font-face` や `:root { --font-display: "游明朝"; }` を追記してください。）

## 2. 手動で1記事だけ試してみる場合

1. `posts/` の中から好きな記事のHTMLファイルを開く
2. はてなブログの新規投稿画面で「編集モードをHTML編集に切り替える」
3. 中身をコピペして投稿（まずは下書き保存して見た目を確認するのがおすすめ）

## 3. 自動投稿を設定する（本題）

はてなブログの「AtomPub」機能を使って、記事を自動で下書き投稿するスクリプトです。
公式APIを使うので、通常のブログ編集画面から投稿するのと同じ扱いになります。

### 3-1. はてな側でAPIキーを取得する

1. はてなブログの管理画面 →「設定」→「詳細設定」を開く
2. ページ下部の「AtomPub」欄にある **APIキー** をコピー（表示ボタンを押す必要がある場合があります）
3. あわせて次の3つをメモしておく
   - `HATENA_ID`：はてなのログインID（例: `your-hatena-id`）
   - `HATENA_BLOG_ID`：ブログのドメイン（例: `your-blog.hatenablog.com`）
   - `HATENA_API_KEY`：手順2でコピーしたAPIキー

### 3-2. 手元のPCで試す（任意・推奨）

Node.js 18以上がインストールされている環境で:

```bash
cd hatena-export
HATENA_ID="your-hatena-id" \
HATENA_BLOG_ID="your-blog.hatenablog.com" \
HATENA_API_KEY="xxxxxxxxxxxx" \
POSTS_PER_RUN=1 \
DRAFT=true \
node scripts/post-to-hatena.js
```

- `POSTS_PER_RUN` … 1回の実行で投稿する件数（デフォルト1件）
- `DRAFT=true` … 下書き保存（`false`にすると即公開なので、慣れるまでは`true`推奨）
- 投稿に成功すると `scripts/posted-log.json` に記録され、次回実行時はその続きから投稿されます
- まず内容だけ確認したい場合は `DRY_RUN=true` を付けると、実際には送信せずログだけ表示します

### 3-3. GitHub Actionsで完全自動化する（放置でOK）

このフォルダをそのままGitHubリポジトリにpushし、以下を設定してください。

1. リポジトリの「Settings」→「Secrets and variables」→「Actions」で、次の3つを **Repository secrets** として登録
   - `HATENA_ID`
   - `HATENA_BLOG_ID`
   - `HATENA_API_KEY`
2. `.github/workflows/auto-post-hatena.yml` はそのままでOK（毎日09:00 JSTに1件ずつ自動投稿する設定）
   - 投稿件数や時間を変えたい場合は、ファイル内の `cron` と `POSTS_PER_RUN` を編集してください
3. 「Actions」タブから `はてなブログ自動投稿` を選び、「Run workflow」で手動実行も可能

投稿はデフォルトで **下書き** として作成されます（`DRAFT: "true"`）。
内容を確認しながら公開したい場合はこのままにし、確認不要なら
`auto-post-hatena.yml` の `DRAFT: "true"` を `"false"` に変更すれば即公開になります。

全84記事が投稿し終わると、`posted-log.json` に84件記録され、以後は
「投稿する記事がありません」というログだけが出て何も投稿されなくなります
（無限に空実行されるだけなので、終わったらworkflowを無効化してOKです）。

## 4. 注意点

- 各記事の末尾に「この記事は [元サイト名] に掲載した記事の転載です」というリンクを自動で入れています（検索エンジンからの重複コンテンツ評価を避けるため）。不要であれば `posts/*.html` の末尾の `<p class="hatena-canonical-note">...` を削除してください。
- 記事本文中の内部リンク（`/posts/xxx` など）は、元サイト（Nexiary）への絶対URLに自動変換済みです。
- アフィリエイトリンク（楽天アフィリエイト等）はそのまま埋め込まれています。ASP側の規約で「転載時の再登録」が必要な場合があるので、各ASPの規約もあわせてご確認ください。
- `manifest.json` の順番は記事の公開日が古い順になっています（自動投稿もこの順番で進みます）。
