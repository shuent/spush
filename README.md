# spush

`spush` は、静的なWebプロジェクトを **FTP / FTPS / SFTP のレンタルサーバーへ、そのプロジェクトディレクトリからそのまま公開する** ための npm CLI です。

AIが生成したHTML/CSS/JS、手元でビルドしたSPA、昔ながらのレンタルサーバーで動かす静的サイト。そういう「もうファイルはできている。あとはサーバーに置きたい」を、`spush push` で短く終わらせます。

```bash
npm install -g @shuent/spush
spush init
spush skill
spush check --env-file .env
spush push --dry-run
spush push --env-file .env --verify
```

## 使う場所

`spush` が向いているのは、アプリケーションサーバーを立てるほどではないけれど、FTP / FTPS / SFTP で公開できる場所にWeb成果物を置きたいときです。

- `index.html` と `assets/` だけの静的サイト
- Vite / React / Vue / Svelte などを `npm run build` したあとの `dist/`
- Astro / Next.js static export / Storybook など、最終的に静的ファイルになる出力先
- LP、キャンペーンページ、ドキュメント、プロトタイプ、社内ツールのフロントだけ
- さくらのレンタルサーバー、Xserver、ロリポップ、一般的なFTP対応ホスティング
- 人間がローカルから手元のサイトを公開する日常的なCLI操作
- AI coding agent が生成・修正したWebプロジェクトを、そのまま公開まで進めるワークフロー
- GitHub Actions などのCI/CDから、ビルド後の成果物をレンタルサーバーへ送るワークフロー

FTP / FTPS / SFTP の接続情報さえあれば、ホスティングごとの管理画面に依存せず、どんなレンタルサーバーでも同じコマンドで人間の作業、AIのワークフロー、CI/CDに組み込めます。

たとえばAIにサイトを作らせた直後のディレクトリで、

```text
project/
  index.html
  assets/
  spush.yaml
```

または、

```text
project/
  src/
  dist/
  package.json
  spush.yaml
```

となっていれば、その場で `spush push` できます。

## なぜ作るのか

AIでWebページを作る速度は上がりました。でも最後の公開だけは、まだ手作業のFTPクライアント、ホスティングごとの管理画面、曖昧なアップロード手順に戻りがちです。

`spush` は新しいホスティング基盤ではありません。すでにあるレンタルサーバーやSFTPサーバーを、Node.jsのプロジェクトとAIの自動化に接続する小さな橋です。

- npm からインストールして `spush` コマンドで実行できる
- 設定はプロジェクト内の `spush.yaml` に置ける
- 秘密情報は環境変数や明示した `.env` から読む
- `--dry-run` と `--json` でAIやスクリプトが扱いやすい
- `.spush/manifest.json` により、前回から変わったファイルだけをアップロードできる

## クイックスタート

必要なものは Node.js 24 以上です。

インストールします。

```bash
npm install -g @shuent/spush
```

設定ファイルを作ります。

```bash
spush init
```

よくあるレンタルサーバー向けの雛形から始めることもできます。

```bash
spush init --provider sakura
spush init --provider xserver
spush init --provider lolipop
```

接続情報と公開先ディレクトリを確認します。

```bash
spush check --env-file .env
```

まずはアップロード予定だけ見ます。

```bash
spush push --dry-run
```

問題なければ公開します。

```bash
spush push --env-file .env --verify
```

インストールせずに一度だけ実行したい場合は、package名を指定して実行できます。

```bash
npx @shuent/spush push
```

## 設定

`spush` はデフォルトで `spush.yaml` を読みます。

```yaml
source: dist
include: ["**/*"]
exclude: [".DS_Store", ".spush/**"]

connection:
  protocol: sftp
  host: example.com
  port: 22
  user: myuser
  password: { env: SPUSH_PASSWORD }
  # private_key: { path: ~/.ssh/id_ed25519 }

remote_dir: /home/myuser/www
url: https://example.com/
# env_file: .env
```

`source` にはアップロードしたいディレクトリを指定します。静的サイトなら `.`、Viteなどのビルド成果物なら `dist`、static export なら `out` のように、実際に公開したいファイルが入っている場所を指定してください。

`connection.protocol` は `ftp`、`ftps`、`sftp` に対応しています。`remote_dir` はサーバー上の公開先ディレクトリです。

## 秘密情報

パスワードや秘密鍵のような値は、できるだけ `spush.yaml` に直書きせず、環境変数から参照してください。

```yaml
connection:
  protocol: sftp
  host: example.com
  user: myuser
  password: { env: SPUSH_PASSWORD }
```

```bash
SPUSH_PASSWORD=secret spush push
```

`.env` を使う場合、`spush` は暗黙には読みません。コマンドで明示するか、`spush.yaml` に `env_file` を指定します。

```bash
spush push --env-file .env
```

```yaml
env_file: .env
```

既存のNodeプロジェクトには `DATABASE_URL` や `OPENAI_API_KEY` なども入っていることがあります。`spush` は「必要な秘密情報だけを、名前で参照する」形を基本にしています。

## コマンド

```bash
spush init
spush init --provider sakura
spush init --provider xserver
spush init --provider lolipop

spush skill

spush check --env-file .env

spush push --dry-run
spush push --delete
spush push --verify
spush push --verify https://example.com/
spush push --json
```

`push --dry-run` は設定を検証し、ローカルファイルをスキャンして、アップロード予定を表示します。リモートサーバーには接続しません。

`push --delete` は、過去に `spush` が管理用マニフェストへ記録したファイルだけを削除対象にします。サーバー上にある未追跡のファイルは削除しません。

`push --verify` は、設定の `url` または明示したURLに対して軽量なHTTP 200確認を行います。ページ全体や全アセットの検証ではなく、公開後のスモークチェックです。

## skill

`spush` は Agent Skills 向けの `SKILL.md` を使えます。

```bash
mkdir -p .agents/skills/spush
curl -fsSL https://raw.githubusercontent.com/shuent/spush/main/.agents/skills/spush/SKILL.md \
  -o .agents/skills/spush/SKILL.md
```

配置先は `<project>/.agents/skills/spush/SKILL.md` です。

## 自動化から使う

AI coding agent、GitHub Actions、自作スクリプトから呼ぶときは `--json` が便利です。成功時も失敗時も機械が読みやすい出力になります。

```bash
spush push --dry-run --json
```

```json
{"ok":true,"command":"push","dryRun":true,"uploaded":2,"skipped":4,"deleted":0,"bytes":1821,"durationMs":920,"remoteDir":"/home/myuser/www","warnings":[]}
```

終了コードは以下の通りです。

| Exit | 意味 |
|---|---|
| 0 | 成功 |
| 1 | 予期しない内部エラー |
| 2 | 設定または秘密情報のエラー |
| 3 | 接続または認証エラー |
| 4 | 転送エラー |
| 5 | verifyエラー |

## できること / しないこと

`spush` は「静的ファイルを安全に置く」ことに集中しています。

できること:

- ローカルの静的ファイルをFTP / FTPS / SFTPへアップロードする
- 前回から変わったファイルだけを転送する
- 明示した場合だけ、追跡済みの削除差分を反映する
- 公開URLの簡単な疎通確認をする
- 人間がローカルから実行する公開CLIとして使う
- GitHub Actions などのCI/CDに組み込む
- JSON出力で自動化に組み込む

しないこと:

- SSRアプリや常駐サーバーのデプロイ
- Docker / systemd / process manager の操作
- DNS、SSL証明書、データベースの管理
- ホスティング管理画面の自動操作

## 開発

```bash
npm install
npm run build
npm test
npm run test:integration
npm run lint
```

`npm run test:integration` builds the CLI, starts local FTP/SFTP Docker services,
and exercises the real transports through `node dist/cli.js`. The default
`npm test` suite does not require Docker.
