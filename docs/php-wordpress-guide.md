# PHP / WordPress guide

`spush` treats PHP and WordPress as normal files transferred over FTP, FTPS, or SFTP.
It does not create databases, edit hosting control panels, or back up WordPress
content stored in MySQL / MariaDB.

## Plain PHP site

Use the PHP template when the project root is the publishable site.

```bash
spush init --template php
spush check --env-file .env
spush push --dry-run --json
spush push --env-file .env --verify
```

The generated config starts from:

```yaml
source: .
include: ["**/*"]
exclude:
  - ".DS_Store"
  - ".spush/**"
  - ".git/**"
  - "node_modules/**"
  - "spush.yaml"
  - "spush.yml"
  - ".env"
  - ".env.*"
```

Keep `vendor/**` only if your PHP site does not need Composer dependencies on the
server. Many shared-hosting PHP sites do need `vendor/`, so the PHP template does
not exclude it by default.

## WordPress manual install

Use this when you want to upload WordPress core files yourself and finish the
installer in a browser.

```bash
spush init --template wordpress
spush push --dry-run --json
spush push --env-file .env
```

Typical flow:

1. Create a MySQL / MariaDB database in the hosting control panel.
2. Create or choose a database user and grant access.
3. Put WordPress core files in the local `wordpress/` directory.
4. Upload with `spush push`.
5. Open the public WordPress URL and complete the install wizard.

The WordPress template excludes local project metadata and cache directories:

```yaml
exclude:
  - ".DS_Store"
  - ".spush/**"
  - ".git/**"
  - "node_modules/**"
  - "vendor/**"
  - "wp-content/cache/**"
```

For a first manual install, do not exclude `wp-content/uploads/**` unless you are
sure uploads are managed elsewhere.

## WordPress easy install import

Use this when the hosting provider's "easy WordPress install" has already created
the site on the server and you want to bring the files into a local project.

```bash
spush init --template wordpress-import
spush import --dry-run --json
spush import --write-manifest --json
```

`import --write-manifest` downloads the files and writes the imported baseline to
the remote `.spush/manifest.json`. The next `spush push` compares local files to
that baseline, so it uploads only files you changed after the import.

By default, import refuses to overwrite local files. Use `--force` only after
reviewing the dry-run or when the local directory is disposable.

## WordPress remote file drift

WordPress can change PHP files on the server after the manifest was written. This
can happen through the theme/plugin file editor in wp-admin, plugin or theme
updates, manual FTP edits, or provider-side maintenance.

Normal `spush push` compares local files with the remote manifest. It does not
download every remote file to detect server-side drift. When PHP files may have
changed outside spush, choose the winning side explicitly:

```bash
# Remote server wins: refresh local files and record a new baseline.
spush import --force --write-manifest --json

# Local project wins: upload all local files even when manifest hashes match.
spush push --force --json
```

For WordPress theme or plugin work, the safest routine is to disable wp-admin
file editing for managed code, or to re-import before editing locally when you
know someone may have changed files on the server.

## Provider path examples

These are starting points. Confirm the exact path in your hosting control panel.

```text
Xserver manual WordPress: /home/<server-id>/<domain>/public_html/wp
Xserver import existing site: /home/<server-id>/<domain>/public_html

Sakura manual WordPress: /home/<account>/www/wp
Sakura import existing site: /home/<account>/www

Lolipop examples vary by contract. The generated preset uses web or web/wp;
check the FTP account's initial directory and public directory before pushing.
```

## WordPress Git ignore example

This is a project choice, not built-in behavior.

```gitignore
.env
.spush/
wp-config.php
wp-content/uploads/
wp-content/cache/
```

For migration or file-level backup tasks you may intentionally include
`wp-config.php` or `uploads/`, but remember that WordPress posts, users, menus,
and settings live in the database, not in files visible to FTP/SFTP.
