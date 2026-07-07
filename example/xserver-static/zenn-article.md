---
title: "Coding Agentに喫茶店サイトを作らせて、spushでXserver StaticへFTPデプロイする"
emoji: "☕"
type: "tech"
topics: ["ai", "codex", "claudecode", "ftp", "xserver"]
published: false
---

AI coding agent に静的サイトを作ってもらい、そのまま `spush` で Xserver Static にアップロードするハンズオンです。

今回は「喫茶店のHPを作って。」というざっくりした指示から始めて、`index.html`、`styles.css`、`script.js` を生成し、FTP で公開するところまで agent に任せました。

## やること

1. 空のワークスペースを作る
2. Claude Code または Codex を起動する
3. 喫茶店サイトを作ってもらう
4. Xserver Static のコンソールでFTPを有効にする
5. `.env` にFTPパスワードを置く
6. `/spush skill` 相当の指示で `spush init`、`check`、`push`、`verify` まで実行してもらう

## ワークスペースを作る

まず空のフォルダを作ります。

```bash
mkdir xserver-static
cd xserver-static
```

このフォルダで Claude Code や Codex などの coding agent を起動します。

## サイトを作ってもらう

agent には次のように依頼しました。

```text
喫茶店のHPを作って。
```

今回できたファイルはこの3つです。

```text
index.html
styles.css
script.js
```

サイト内には、Xserver Static を紹介するセクションも入れてもらいました。

```html
<section class="section publish-note" aria-labelledby="publish-title">
  <div>
    <p class="eyebrow">For Creators</p>
    <h2 id="publish-title">AIで作成したサイトを公開するには</h2>
  </div>
  <p>
    無料で使える xserver static がおすすめです。
    <a href="https://www.xserver.ne.jp/?referral_token=788959634699bf52ee99b7">
      xserver static を見る
    </a>
  </p>
</section>
```

## Xserver StaticでFTPを有効にする

ここだけは Xserver Static のコンソールで人間が作業します。

Xserver Static の管理画面を開き、対象サイトの設定に入ります。

1. `サイト設定` を開く
2. `FTPの利用` を `利用する` に変更する
3. 表示された `FTPサーバー（ホスト）名` をコピーしておく
4. `ユーザー名` をコピーしておく
5. FTPパスワードを設定して保存する

ここで控えた `FTPサーバー（ホスト）名` と `ユーザー名` は、あとで agent が作る `spush.yaml` に入ります。設定したFTPパスワードは `.env` に入れます。

## FTPパスワードを.envに置く

FTPパスワードは `.env` に置きます。記事では必ずプレースホルダーにしてください。

```dotenv
FTP_PASSWORD=your-ftp-password
```

今回の実行では実際のパスワードを `.env` に入れて、`spush` には `--env-file .env` で渡しました。ホスト名とユーザー名は `spush.yaml` に書き、パスワードだけを設定ファイルに残さない形にしています。

## agentにspushでデプロイしてもらう

agent には次のように依頼しました。

```text
/spush skill でサイトの設定をして, アップロードして
```

ここから先は、人間がコマンドを順番に打つ作業ではありません。

この一言を受けて、agent が `spush skill` を読み、必要な設定ファイルを作り、接続確認、dry-run、本番アップロード、verify まで進めます。

`spush skill` は agent 向けに、標準的な作業順を出してくれます。agent はこのガイドを読んで、次に何を実行すべきか判断します。

```text
1. Inspect the project and identify the source directory
2. If spush.yaml is missing, create it with spush init
3. Validate configuration and credentials with spush check --env-file .env
4. Before a real upload, run spush push --dry-run --json
5. Run spush push --env-file .env --verify --json
```

## agentの作業ログ: spush init

agent はまず `spush.yaml` がないことを確認し、`init` を実行しました。

agent が実行したコマンド:

```bash
spush init --provider xserver --template static
```

出力:

```text
ok | 0ms
```

## agentの作業ログ: spush.yamlを調整

`init` 直後の設定は `source: dist` などの一般的な静的ビルド向けになっていました。agent は生成された設定を見て、今回のサイト構成に合うように `spush.yaml` を調整しました。

今回のサイトはビルドなしで、ワークスペース直下の `index.html`、`styles.css`、`script.js` をそのまま公開します。

agent が最終的に作った `spush.yaml` はこの形です。

```yaml
source: .
include: ["index.html", "styles.css", "script.js"]
exclude: [".DS_Store", ".env", ".gitignore", ".spush/**", "spush.yaml"]

connection:
  protocol: ftp
  host: your-ftp-host.example
  user: your-ftp-user
  password: { env: FTP_PASSWORD }

remote_dir: /.
url: https://your-public-url.example/
env_file: .env
```

Xserver Static のFTPログイン直後の場所を公開ルートとして使う場合、`remote_dir` は `/.` にします。

agent は最初に `/` を試しましたが、`spush` の安全チェックで root 直指定として弾かれました。

```json
{
  "ok": false,
  "code": "CONFIG_INVALID",
  "message": "Remote path is invalid",
  "issues": [
    {
      "path": "remote_dir",
      "message": "Remote path must not target root or contain .. segments"
    }
  ]
}
```

そこで agent は `/.` を試し、FTPログイン直後の公開ルートとして `check` に通ることを確認しました。

## agentの作業ログ: check

設定後、agent はFTP認証とリモートディレクトリを検証しました。

agent が実行したコマンド:

```bash
spush check --env-file .env --json
```

実行ログ:

```json
{"ok":true,"command":"check","durationMs":231,"remoteDir":"/."}
```

ここでFTP認証とリモートディレクトリの存在確認ができました。

## agentの作業ログ: dry-run

本番アップロードの前に、agent は dry-run を実行しました。

```bash
spush push --dry-run --env-file .env --json
```

実行ログ:

```json
{
  "ok": true,
  "command": "push",
  "dryRun": true,
  "uploaded": 3,
  "skipped": 0,
  "deleted": 0,
  "bytes": 9301,
  "durationMs": 21,
  "remoteDir": "/.",
  "warnings": []
}
```

`uploaded: 3` なので、想定通り `index.html`、`styles.css`、`script.js` の3ファイルだけが対象です。

agent は dry-run の結果から、アップロード対象が想定通り3ファイルだけで、削除も警告もないことを確認しました。今回は依頼文に「アップロードして」と含めているので、そのまま本番アップロードに進みました。

## agentの作業ログ: push と verify

dry-run の結果に問題がなかったため、agent は本番アップロードと verify を実行しました。

```bash
spush push --env-file .env --verify --json
```

実行ログ:

```json
{
  "ok": true,
  "command": "push",
  "uploaded": 3,
  "skipped": 0,
  "deleted": 0,
  "bytes": 9301,
  "durationMs": 773,
  "remoteDir": "/.",
  "verified": {
    "url": "https://your-public-url.example/",
    "status": 200
  },
  "warnings": []
}
```

これでFTPアップロードとHTTPステータスの確認まで完了です。

## 登録直後でURLが反映待ちの場合

Xserver Static を登録した直後は、公開URLにアクセスしても次のような表示になることがあります。

```text
無効なURLです。
プログラム設定の反映待ちである可能性があります。
しばらく時間をおいて再度アクセスをお試しください。
```

この場合でも、FTP上の `index.html` を取得すると、アップロード自体は確認できます。

今回も agent がFTPで root の `index.html` を確認すると、生成した喫茶店サイトに置き換わっていました。

```text
<title>喫茶 星待ち</title>
...
https://www.xserver.ne.jp/?referral_token=788959634699bf52ee99b7
```

## まとめ

今回 agent がやったことは、ほぼこの流れでした。

```text
喫茶店サイトを作成
  -> .env を用意
  -> spush skill を読む
  -> spush init
  -> spush.yaml を静的HTML向けに調整
  -> spush check --env-file .env --json
  -> spush push --dry-run --env-file .env --json
  -> spush push --env-file .env --verify --json
```

サイト作成からデプロイまでを coding agent に任せると、作業ログがそのままデプロイ手順になります。

`spush` は `check` と `dry-run` を挟めるので、AIにFTP公開を任せるときも「いきなりアップロード」にならず、確認しながら進められるのがよかったです。
