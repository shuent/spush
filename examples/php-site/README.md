# PHP site example

This example publishes the project root as a small PHP site.

```bash
spush init --template php
spush push --dry-run
```

Edit `spush.yaml` before use:

- `connection.host`
- `connection.user`
- `remote_dir`
- `url`

Set `SPUSH_PASSWORD` in the environment or pass an `.env` file with
`spush push --env-file .env`.
