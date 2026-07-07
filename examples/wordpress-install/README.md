# WordPress manual install example

Use this when WordPress core files live in a local `wordpress/` directory and
you want to upload them before running the browser installer.

```bash
spush init --template wordpress
spush push --dry-run --json
spush push --env-file .env
```

This example does not include WordPress core files. Download WordPress and place
the extracted files under `wordpress/` before pushing.
