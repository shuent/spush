# WordPress import example

Use this when WordPress already exists on the remote server, for example after a
hosting provider's easy install flow.

```bash
spush init --template wordpress-import
spush import --dry-run --json
spush import --write-manifest --json
```

`--write-manifest` records the imported file hashes in the remote
`.spush/manifest.json`, so the next `spush push` uploads only files changed
locally after the import.
