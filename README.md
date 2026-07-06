# spush

Publish a static web project from the current directory to FTP, FTPS, or SFTP hosting.

```bash
npx spush init
npx spush check --env-file .env
npx spush push --dry-run --json
npx spush push --env-file .env --verify
```

## Config

`spush` reads `spush.yaml` by default.

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

Secrets are read from environment variables. `spush` does not implicitly load `.env`; pass `--env-file .env` or set `env_file` in `spush.yaml`.

## Commands

```bash
spush init
spush init --provider sakura
spush check --env-file .env
spush push --dry-run
spush push --delete
spush push --verify
spush push --verify https://example.com/
spush push --json
```

`push --dry-run` validates config and scans local files without connecting to the remote server.

`push --delete` only deletes files previously tracked in the remote `.spush/manifest.json`; untracked remote files are never deleted.

`push --verify` performs a lightweight HTTP 200 check against `url` from config or an explicit URL. It is a smoke check, not full page or asset validation.

## JSON Output

Use `--json` when calling from an AI agent or script.

```json
{"ok":true,"command":"push","uploaded":2,"skipped":4,"deleted":0,"bytes":1821,"durationMs":920,"remoteDir":"/home/myuser/www"}
```

Expected failure exit codes:

| Exit | Meaning |
|---|---|
| 0 | success |
| 1 | unexpected internal error |
| 2 | config or secret error |
| 3 | connect/auth error |
| 4 | transfer error |
| 5 | verify error |

## Development

```bash
npm install
npm run build
npm test
npm run lint
```
