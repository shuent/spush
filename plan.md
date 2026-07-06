# spush — 実装計画 (plan.md)

> AI が生成した静的 Web プロジェクトを、その場から FTP / FTPS / SFTP で公開する CLI。
> `npx spush push` で完結する UX を最優先にする。

## 0. idea.md からの変更点(要件見直し)

idea.md の方針(TypeScript / ESM / npx 配布 / runtime schema validation / protocol transport 抽象)は妥当なので踏襲する。そのうえで以下を判断・変更した。

| 項目 | idea.md | 本計画 | 理由 |
|---|---|---|---|
| パッケージ名 | `rentpush` | **`spush`** | ディレクトリ名と一致。短く npx 向き(npm 上の空き確認は公開前タスク) |
| コマンド | `init` / `push` | `init` / `push` / **`check`** を追加 | AI エージェントが「設定が正しいか・接続できるか」をデプロイ前に検証できる。config validation + 接続テストのみで転送しない |
| 差分アップロード | 言及なし | **リモートマニフェスト方式で MVP から入れる** | 毎回全転送は共有レンタルサーバーの FTP では遅すぎて実用にならない。`.spush/manifest.json` をリモートに置き、ローカルの hash と比較して差分のみ転送 |
| remote delete | interface から外す案 | **`--delete` フラグで opt-in、デフォルト無効** | マニフェストがあれば「前回 push したが今回消えたファイル」を安全に特定できる。マニフェスト外のファイルには絶対に触れない(既存サイト破壊防止) |
| JSON 出力 | error 例のみ | **`--json` で全コマンドの結果を構造化出力** | 主要ユーザーが AI エージェントなので、成功時も機械可読な結果(転送数・スキップ数・URL 等)を返す |
| exit code | 言及なし | **体系化する**(下記 §4) | エージェントの分岐処理に必須 |
| `.env` | 思想の選択として保留 | **暗黙読み込みしない。`--env-file` / config の `env_file` で明示指定のみ** | idea.md の警戒が正しい。credential CLI が project の `.env` を勝手に読む挙動は避ける |
| HTTP verify | verify.ts あり | **MVP では `push --verify [url]` の簡易実装(200 チェック)に縮小** | deploy 後検証は価値があるが、まずは「転送が正しくできる」ことに集中 |
| presets | sakura.yaml / xserver.yaml | **維持**(`init --provider sakura` 等) | 日本のレンタルサーバー文脈に合致。preset は host のテンプレと remote_dir の慣習を埋めるだけの薄い YAML |
| postinstall | 使わない | 維持(pure JS、install script なし) | credential を扱う CLI として信頼性の要 |

## 1. スコープ

### MVP でやること
- `spush init [--provider <name>]` — 対話 or preset で `spush.yaml` 生成
- `spush check` — config validation + 接続テスト + remote_dir 存在確認
- `spush push [--dry-run] [--delete] [--verify [url]] [--json] [--verbose]` — 差分計画 → 転送 → マニフェスト更新 → 任意の HTTP smoke verify
- FTP / FTPS(同一 transport、オプション差)/ SFTP(password / private key)
- glob ベースの include/exclude
- 構造化エラー(code + path + message)

### やらないこと
- 並列アップロード(逐次で開始。transport interface は将来対応可能な形にする)
- watch モード、rollback、リモート側バックアップ
- FTP proxy、鍵の passphrase 対話入力以外の高度な認証

## 2. CLI 仕様

```bash
npx spush init                      # 対話形式で spush.yaml 生成
npx spush init --provider sakura    # preset から生成
npx spush check                     # 設定検証 + 接続テスト(転送なし)
npx spush push --dry-run            # 転送計画の表示のみ
npx spush push                      # 差分アップロード
npx spush push --delete             # 消えたファイルをリモートからも削除
npx spush push --verify             # config の url に HTTP 200 smoke check
npx spush push --verify <url>       # 指定 URL に HTTP 200 smoke check
npx spush push --json               # 機械可読出力(AI エージェント向け)
```

共通オプション: `--config <path>`(default: `spush.yaml`)、`--env-file <path>`、`--json`、`--verbose`

`--verify` は軽い smoke test に限定する。HTTP 200 を確認するだけで、ページ内容・asset 欠落・SPA routing の完全性までは保証しない。

## 3. 設定ファイル (`spush.yaml`)

```yaml
source: dist              # アップロード元ディレクトリ
include: ["**/*"]         # 省略可
exclude: [".DS_Store", "*.map"]

connection:
  protocol: sftp          # ftp | ftps | sftp
  host: example.sakura.ne.jp
  port: 22                # 省略時: protocol 別 default (21/21/22)
  user: myuser
  password: { env: SPUSH_PASSWORD }   # 環境変数参照のみ。平文も書けるが init が警告コメントを出す
  # private_key: { path: ~/.ssh/id_ed25519 }   # sftp のみ

remote_dir: /home/myuser/www
url: https://example.sakura.ne.jp/   # push --verify 用(任意)
# env_file: .env                     # 明示指定時のみ読む
```

- Zod discriminated union で runtime validation(idea.md の方針どおり)
- secret は `{ env: NAME }` 参照を第一級に。エラー時は `SECRET_ENV_MISSING` + 変数名を返す
- validation エラーは `{ ok: false, code: "CONFIG_INVALID", issues: [{ path, message }] }` 形式

## 4. 出力と exit code

| code | 意味 |
|---|---|
| 0 | 成功(dry-run 含む) |
| 1 | 予期しない内部エラー |
| 2 | config 不正 (`CONFIG_INVALID`, `SECRET_ENV_MISSING`) |
| 3 | 接続・認証失敗 (`CONNECT_FAILED`, `AUTH_FAILED`) |
| 4 | 転送中の失敗 (`TRANSFER_FAILED` — 何が完了し何が失敗したかを列挙) |
| 5 | verify 失敗 (`VERIFY_FAILED`) |

`--json` 時の成功出力例:

```json
{
  "ok": true,
  "uploaded": 12,
  "skipped": 34,
  "deleted": 0,
  "bytes": 183204,
  "durationMs": 4210,
  "remoteDir": "/home/myuser/www"
}
```

## 5. アーキテクチャ

```
src/
  cli.ts                 # commander 定義のみ。ロジックは持たない
  commands/
    init.ts
    check.ts
    push.ts
  config/
    schema.ts            # Zod schema + ConfigError
    load.ts              # YAML 読み込み → validate → secret 解決 → NormalizedConfig
  deploy/
    scan.ts              # ローカル走査 + hash (sha256, glob 適用)
    manifest.ts          # リモートマニフェストの読み書き (.spush/manifest.json)
    plan.ts              # local scan × manifest → {upload, skip, delete} の純粋関数
    execute.ts           # plan を transport で実行、進捗イベント発行
    verify.ts            # HTTP 200 チェック(fetch)
  transports/
    types.ts             # PublishTransport interface
    factory.ts           # createTransport(config)
    ftp.ts               # basic-ftp (FTP/FTPS 共通)
    sftp.ts              # ssh2-sftp-client
  output/
    reporter.ts          # human / json の出し分け、進捗表示
  presets/
    sakura.yaml
    xserver.yaml
    lolipop.yaml
```

原則(idea.md 踏襲):
- 依存ライブラリの API を `transports/` の外に漏らさない
- `plan.ts` は I/O を持たない純粋関数にする(テストの主対象)
- `PublishTransport` は publish に必要な操作のみ(汎用 FS 抽象にしない):

```ts
interface PublishTransport {
  connect(): Promise<void>
  upload(localPath: string, remotePath: string): Promise<void>
  downloadToString(remotePath: string): Promise<string | null>  // manifest 用
  uploadFromString(remotePath: string, content: string): Promise<void>
  remove(remotePath: string): Promise<void>                     // --delete 用
  ensureDir(remotePath: string): Promise<void>
  close(): Promise<void>
}
```

### 差分アップロードの仕組み
1. ローカル: `source` を glob 走査し `{ path, sha256, size }` のリストを作る
2. リモート: `remote_dir/.spush/manifest.json` を取得(なければ初回 = 全転送)
3. `plan()`: hash 比較で upload / skip / delete を決定
4. 転送成功後にマニフェストを更新アップロード(途中失敗時はマニフェストを更新しないことで、次回 push が自動リトライになる)

## 6. 技術選定

| 用途 | ライブラリ | 備考 |
|---|---|---|
| CLI parsing | **commander** | Node CLI の標準的な選択 |
| schema | **zod** | discriminated union が要件に合う |
| YAML | **yaml** | メンテ活発、コメント保持可(init で使う) |
| FTP/FTPS | **basic-ftp** | デファクト。FTPS は secure option |
| SFTP | **ssh2-sftp-client** | ssh2 の標準 wrapper |
| glob | **tinyglobby** | 軽量・活発。fast-glob でも可 |
| .env | **dotenv** | `--env-file` 明示時のみ使用 |
| 色/表示 | **picocolors** | 依存最小 |
| 対話 (init) | **@inquirer/prompts** | commander と定番の組み合わせ |
| build | **tsup** | ESM 単一出力、shebang 対応 |
| test | **vitest** | coverage は v8 provider |
| lint/format | **biome** | 1 ツールで完結 |

runtime: Node >= 24 / ESM / `"bin": { "spush": "./dist/cli.js" }` / postinstall なし

## 7. 開発環境とリリース前提

- `mise.toml` は `node = "24"` に固定する。npm package の `engines.node` は `>=24`。
- package manager は npm を第一候補にする。`package-lock.json` を commit し、`npm ci` を CI の標準にする。
- npm package 名 `spush` の空き確認は足場作成前に行う。取れない場合は scoped package に寄せるが、bin name はできる限り `spush` を維持する。
- CI は最小で `npm ci` / `npm run build` / `npm test` / `npm run lint` を走らせる。
- publish 前に `files`、`bin`、`exports`、`engines`、license、README、npm provenance を確認する。
- install script は置かない。package install 時に network access や binary download をしない。

## 8. テスト方針(カバレッジ ~30%)

浅く広くではなく、壊れると被害が大きい箇所に集中する:

1. **`config/schema.ts` + `load.ts`**(最重要)
   - protocol 別の必須項目、port default、`{ env }` secret の解決と欠落エラー
   - 不正 YAML / ファイル欠落 → `CONFIG_INVALID` の issues 形式
2. **`deploy/plan.ts`**(純粋関数)
   - 初回(manifest なし)= 全 upload
   - hash 一致 = skip / 不一致 = upload / manifest にあってローカルにない = delete 候補
   - `--delete` off 時に delete が空になること
   - exclude glob の適用
3. **`deploy/manifest.ts`** — 壊れた JSON を初回扱いにフォールバックすること
4. **`transports/factory.ts`** — protocol → 実装のマッピング
5. **`commands/push.ts` の統合テスト 1 本** — mock transport を注入し、dry-run が転送 0 で計画を JSON 出力すること

実サーバーへの接続テストは書かない(transport は薄い adapter なので mock 境界とする)。目安: statements 30% 前後、`plan.ts` / `schema.ts` は 90%+。

## 9. examples/

```
examples/
  basic-static/        # index.html + assets/ + spush.yaml (ftp preset)
  vite-project/        # source: dist の例。build → push の README 付き
  sftp-with-key/       # 鍵認証 + env_file の例
```

各 example に README.md(実行手順 + `--dry-run` の出力例)を置く。CI では examples の spush.yaml を `spush check` の schema validation に通す。

## 10. 実装順序

1. **足場**: `mise.toml` の Node 固定、package.json / package-lock.json / tsconfig / tsup / vitest / biome、`cli.ts` に commander の骨組み
2. **config**: schema.ts → load.ts + テスト
3. **scan / manifest / plan** + テスト(この時点で `push --dry-run` が transport なしで動く)
4. **transports**: ftp.ts → sftp.ts → factory
5. **push 本体**: execute + reporter(human/json)+ exit code
6. **check / init**: 接続テスト、preset、対話生成
7. **仕上げ**: `--delete`、`--verify`、examples/、README、npm publish 準備(`files` フィールド、provenance)

## 11. 完了条件

- `npm run build` で ESM CLI が生成され、`dist/cli.js` の shebang が維持される
- `npm test` / `npm run lint` が通る
- mock transport で `spush push --dry-run --json` が転送 0 件の計画を返す
- examples の `spush.yaml` が schema validation を通る
- README に `init` / `check` / `push` / `--env-file` / `--delete` / `--verify` / `--json` の使い方がある
- `npm pack --dry-run` で意図したファイルだけが含まれる

## 12. 未決事項(実装中に判断)

- npm 上で `spush` が取れない場合の代替名(scoped `@<org>/spush` か)
- FTPS の `rejectUnauthorized` を config で緩和可能にするか(レンタルサーバーの証明書事情次第。入れるなら明示フラグ + 警告表示)
- マニフェストの置き場所をリモートではなくローカル `.spush/` にする選択肢(リモート書き込み最小化 vs 複数マシンからの push 整合性)→ MVP はリモート置き、config で無効化可
