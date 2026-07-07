export const skillGuide = `# spush AI Agent Guide

You are an AI coding agent helping publish file-based web projects with spush.
spush uploads and imports local static, PHP, and WordPress files over FTP,
FTPS, or SFTP using the project's spush.yaml.

## Default flow

1. Inspect the project and identify the source directory: dist, build, out,
   public, the project root for plain PHP/static sites, or a WordPress folder.
2. If spush.yaml is missing, create it with \`spush init\` or write the minimal
   config. \`spush init\` also writes \`.env.spush.example\`; copy it to
   \`.env.spush\` and fill it. Prefer \`FTP_HOST\`/\`FTP_USER\`/\`FTP_PASSWORD\`
   for FTP or FTPS, and \`SFTP_HOST\`/\`SFTP_USER\`/\`SFTP_PASSWORD\` for SFTP.
   Keep passwords and private keys in env vars or files, not inline.
3. Validate configuration and credentials with \`spush check --env-file .env.spush\`
   when using the generated env example.
4. Before a real upload, run \`spush push --dry-run --json\` and inspect
   uploaded, skipped, deleted, bytes, remoteDir, and warnings.
5. Run \`spush push --env-file .env.spush --verify --json\` only when the user has
   asked to publish, or deployment is clearly part of the requested task.

For an existing remote PHP or WordPress site, prefer \`spush import --dry-run
--json\` first. When importing a site that will be pushed back later, run
\`spush import --write-manifest --json\` so the fetched state becomes the remote
baseline and the next \`spush push\` uploads only local changes. WordPress can
modify PHP files through the admin editor, plugin/theme updates, or server-side
tools; when remote files may have drifted from the manifest, choose whether the
remote or local copy wins before pushing.

## Commands

- \`spush init [--provider sakura|xserver|lolipop] [--template static|php|wordpress|wordpress-import] [--force]\`
  creates spush.yaml.
- \`spush check [--env-file .env.spush] [--json]\`
  validates config and tests the remote directory.
- \`spush push [--dry-run] [--delete] [--force] [--verify [url]] [--env-file .env.spush] [--json]\`
  uploads changed files and optionally verifies the public URL.
- \`spush import [--dry-run] [--force] [--write-manifest] [--env-file .env.spush] [--json]\`
  downloads remote files into source. Without \`--force\`, existing local files
  stop the import. With \`--write-manifest\`, spush writes the imported baseline
  to the remote manifest used by future pushes.
- \`spush skill\`
  prints this guide.

## Output and errors

Prefer \`--json\` in automation. Successful JSON includes \`ok: true\`,
\`command\`, counts for changed files, \`remoteDir\`, and optional \`warnings\`.
\`import\` also reports \`downloaded\` and \`manifestWritten\`. Failed JSON
includes \`ok: false\`, \`code\`, \`message\`, and \`issues\`.

If a command fails, read \`issues[].message\` for the next action. Common fixes:
create or adjust spush.yaml, pass \`--env-file .env.spush\`, set the missing
environment variable, or check that \`remote_dir\` exists. \`remote_dir: /\`
is valid when the login directory is the publish root; \`/.\` normalizes to
\`/\`, and \`..\` traversal segments are rejected.

## Safety

Do not hard-code secrets in spush.yaml. Avoid \`--delete\` unless the user asked
for remote cleanup or the dry-run plan has been reviewed. \`--delete\` only
removes files tracked by spush's remote manifest, but it is still a real remote
change. \`import --write-manifest\` writes metadata to the remote server; use it
only when the imported state should become the push baseline. If WordPress or a
person changed PHP files on the server, use \`spush import --force
--write-manifest\` when the remote copy should become the new local baseline, or
\`spush push --force\` when the local copy should overwrite remote drift.
`;

export function runSkill(): void {
  process.stdout.write(`${skillGuide.trimEnd()}\n`);
}
