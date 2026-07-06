## 前提

* 配布体験は `npx <pkg> ...` を重視
* Node.js が入っている環境を前提にしてよい
* シングルバイナリ配布は不要
* FTP / FTPS / SFTP の3系統を扱う
* AI や開発者がローカルプロジェクト内で使う CLI
* 初期は性能より、実装速度・保守性・CLI UX を優先

この前提なら、**Node.js / TypeScript が一番自然**だと思います。

## 結論

私は **TypeScript で npm package として作る**のを選びます。

利用形は、

```bash
npx rentpush push --dry-run
```

または package manager の新しい書き方も含めて、

```bash
npm exec rentpush -- push
```

。

継続利用する人は、

```bash
npm install -D rentpush
```

して、

```bash
npx rentpush push
```

。

Python や Go にする明確な理由が今の要件にはあまりないです。

---

## Node が合う最大の理由

このCLIの主な利用地点が、

```text
AIがHTML/CSS/JSを生成した直後のproject directory
```

だからです。

典型的には、

```text
project/
  index.html
  assets/
  package.json
  publish.yaml
```

または、

```text
project/
  src/
  dist/
  package.json
  publish.yaml
```

になる。

その場で、

```bash
npx rentpush push
```

が打てる。

これはかなり強いです。

Pythonだと、

```bash
pipx install rentpush
```

や、

```bash
uvx rentpush
```

の世界になる。

`uvx` は良いですが、このプロダクトの対象文脈は明らかにNode寄りです。

Goだと、

```bash
brew install rentpush
```

や GitHub Releases から binary install になる。

CLI単体としては良いですが、

> AIが作ったWeb projectのディレクトリで即実行

というUXでは `npx` の方が説明が短い。

---

## 実装上もNodeで困らない

必要なものは基本、

```text
YAML parsing
.env loading
glob / filesystem traversal
hash
FTP
FTPS
SFTP
HTTP verify
JSON output
CLI parsing
```

です。

全部Nodeが普通に得意です。

構成は例えば、

```text
src/
  cli.ts

  commands/
    init.ts
    push.ts

  config/
    load.ts
    schema.ts

  deploy/
    plan.ts
    execute.ts
    verify.ts

  transports/
    types.ts
    ftp.ts
    sftp.ts

  presets/
    sakura.yaml
    xserver.yaml
```

程度。

FTPS と FTP は同じ transport implementation で connection option を変える可能性が高い。

概念上は、

```ts
interface Transport {
  connect(): Promise<void>
  list(path: string): Promise<RemoteEntry[]>
  upload(localPath: string, remotePath: string): Promise<void>
  download?(remotePath: string): Promise<Buffer>
  mkdir(path: string): Promise<void>
  close(): Promise<void>
}
```

。

ただし、CLIの内部interfaceに `delete` を最初から持たせるかは少し考えます。

MVPが remote delete 非対応なら、

```ts
interface PublishTransport {
  connect(): Promise<void>
  stat(path: string): Promise<RemoteStat | null>
  list(path: string): Promise<RemoteEntry[]>
  upload(localPath: string, remotePath: string): Promise<void>
  ensureDirectory(path: string): Promise<void>
  close(): Promise<void>
}
```

くらいでいい。

「汎用filesystem interface」にしないことが大事です。

---

## Pythonとの比較

Pythonにする利点はあります。

特に、

```text
CLI実装が素直
標準ライブラリが強い
paramiko等のSSH系資産
uvxでone-shot execution可能
```

。

CLIだけを見ればPythonでもかなり良い。

ただ今回、利用者に、

```bash
uvx rentpush push
```

を説明するより、

```bash
npx rentpush push
```

の方がプロダクトの文脈に合っています。

また、AI coding agent はWeb開発プロジェクトでNode runtimeを既に使っている可能性が高い。

私なら Python を選ぶのは、

> このCLIをインフラ運用者向けに売る

場合です。

今の定義は、

> AIが作ったサイトを公開する

なのでNode。

---

## Goとの比較

Goの利点は明確です。

```text
single binary
起動が速い
runtime不要
cross compileしやすい
CLIとして配布がきれい
```

。

普通のインフラCLIならGoはかなり有力。

ただ、今回最大のメリットであるsingle binaryを必要としていない。

逆に配布が、

```bash
brew install ...
```

```bash
curl ... | sh
```

```bash
go install ...
```

になりやすい。

もちろん npm package から platform binary を配る方法もありますが、それなら配布基盤が余計に複雑になる。

このプロジェクトは転送処理そのものがCPU intensiveでもない。

ファイル一覧取得やhash計算はありますが、大半はnetwork I/O。

Goの性能メリットも重要ではないです。

なので現時点ではGoはoverkill寄り。

---

## ただしNodeで一つ注意がある

**依存ライブラリのAPIをそのまま設計に漏らさない方がいい。**

例えばFTP library Aを使って、

```ts
client.uploadFrom(...)
```

をdeploy code中に散らすと、後で辛い。

必ず、

```text
deploy
   ↓
PublishTransport
   ↓
FTPTransport / SFTPTransport
   ↓
third-party library
```

にする。

理由は、FTP / FTPS / SFTP はライブラリが分かれる可能性が高いからです。

例えば概念上、

```ts
function createTransport(
  config: ConnectionConfig
): PublishTransport {
  switch (config.protocol) {
    case "ftp":
    case "ftps":
      return new FtpTransport(config)

    case "sftp":
      return new SftpTransport(config)
  }
}
```

。

runtime provider adapterはない。

ただしprotocol adapterは当然ある。

これは要件と矛盾しません。

---

## config validation は TypeScript type ではなく runtime schema

ここは重要です。

```ts
type Config = {
  source: string
  connection: ...
}
```

だけでは駄目。

YAMLは外部入力なので、

```text
YAML
 ↓
runtime schema validation
 ↓
normalized config
 ↓
deploy
```

にする。

例えば Zod 系のschemaで、

```ts
const connectionSchema = z.discriminatedUnion("protocol", [
  z.object({
    protocol: z.literal("sftp"),
    host: z.string().min(1),
    port: z.number().int().positive().default(22),
    user: z.string().min(1),
    private_key: privateKeySchema.optional(),
    password: secretSchema.optional(),
  }),

  z.object({
    protocol: z.enum(["ftp", "ftps"]),
    host: z.string().min(1),
    port: z.number().int().positive().optional(),
    user: z.string().min(1),
    password: secretSchema,
  }),
])
```

みたいにする。

AI向けCLIでは、config errorが、

```text
Cannot read property 'host' of undefined
```

になるのは最悪。

```json
{
  "ok": false,
  "code": "CONFIG_INVALID",
  "issues": [
    {
      "path": "connection.host",
      "message": "Required"
    }
  ]
}
```

を返せる方が重要。

TypeScriptはここが作りやすいです。

---

## npm packageとしての形

私は最初から ESM にします。

```json
{
  "name": "rentpush",
  "type": "module",
  "bin": {
    "rentpush": "./dist/cli.js"
  },
  "engines": {
    "node": ">=20"
  }
}
```

CLI source:

```ts
#!/usr/bin/env node
```

build後、

```text
dist/cli.js
```

をbinにする。

Node versionはあまり広く背負わない方がいい。

AI利用前提の新規CLIなら、古いNodeとの互換性維持に時間を使う必要は薄いです。

---

## `npx` 前提なら package install script は使わない

これは設計方針として強く推します。

```json
{
  "scripts": {
    "postinstall": "..."
  }
}
```

みたいなことはしない。

FTP credentialを扱うCLIなので、ユーザーから見るとかなりsensitiveです。

理想は、

```text
npm package install
↓
ただのJS
↓
明示的にpushした時だけnetwork access
```

。

`postinstall` でbinary download等もしない。

これはGo binary wrapper方式を避ける理由にもなる。

---

## `.env` の扱いだけ少し考えたい

Nodeだから自然に、

```text
.env
```

を読む、という設計はできます。

ただ、私は**CLIが暗黙に `.env` を読む仕様を少し警戒します**。

例えば、

```yaml
password:
  env: FTP_PASSWORD
```

ならまず、

```ts
process.env.FTP_PASSWORD
```

を見る。

`.env` loadingは、

```bash
rentpush push --env-file .env
```

か、

```yaml
env_file: .env
```

を明示させてもよい。

理由は、Node projectには既に `.env` があって、

```text
DATABASE_URL
STRIPE_SECRET_KEY
OPENAI_API_KEY
```

などが入っている可能性があるから。

rentpushが全部読むこと自体は即危険ではありませんが、credential-sensitive CLIとしては、

> 必要なsecretだけ環境変数名で参照する

というモデルを明確にした方がいい。

ただUX優先なら、

```text
1. process.env
2. project/.env
```

でも現実的です。

ここは思想の選択。

---

## 私なら今こう決める

```text
Language: TypeScript
Runtime: Node.js >= 20
Package: npm
Execution: npx
Module: ESM
Config: YAML
Schema validation: runtime schema
Architecture: protocol transports
Distribution: pure JS package
```

CLI:

```bash
npx rentpush init
npx rentpush init --provider sakura

npx rentpush push --dry-run
npx rentpush push
```

package local installも可能。

```bash
npm install -D rentpush
```

これで十分です。

**Node前提でOKという条件なら、PythonやGoと比較して積極的にNodeを選んでよい案件**だと思います。特にこれは「汎用インフラCLI」ではなく、「Web制作プロジェクトの隣に置くpublish CLI」なので、`npx` で起動できること自体がプロダクトUXの一部です。

