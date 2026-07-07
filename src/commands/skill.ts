export const skillGuide = `# spush AI Agent Guide

You are an AI coding agent helping publish static web files with spush.
spush uploads a local static output directory to FTP, FTPS, or SFTP using
the project's spush.yaml.

## Default flow

1. Inspect the project and identify the static output directory: dist, build,
   out, public, or the project root for plain static sites.
2. If spush.yaml is missing, create it with \`spush init\` or write the minimal
   config. Keep passwords and private keys in env vars or files, not inline.
3. Validate configuration and credentials with \`spush check --env-file .env\`
   when an env file is used.
4. Before a real upload, run \`spush push --dry-run --json\` and inspect
   uploaded, skipped, deleted, bytes, remoteDir, and warnings.
5. Run \`spush push --env-file .env --verify --json\` only when the user has
   asked to publish, or deployment is clearly part of the requested task.

## Commands

- \`spush init [--provider sakura|xserver|lolipop] [--force]\`
  creates spush.yaml.
- \`spush check [--env-file .env] [--json]\`
  validates config and tests the remote directory.
- \`spush push [--dry-run] [--delete] [--verify [url]] [--env-file .env] [--json]\`
  uploads changed files and optionally verifies the public URL.
- \`spush skill\`
  prints this guide.

## Output and errors

Prefer \`--json\` in automation. Successful JSON includes \`ok: true\`,
\`command\`, counts for changed files, \`remoteDir\`, and optional \`warnings\`.
Failed JSON includes \`ok: false\`, \`code\`, \`message\`, and \`issues\`.

If a command fails, read \`issues[].message\` for the next action. Common fixes:
create or adjust spush.yaml, pass \`--env-file .env\`, set the missing secret
environment variable, or check that \`remote_dir\` exists.

## Safety

Do not hard-code secrets in spush.yaml. Avoid \`--delete\` unless the user asked
for remote cleanup or the dry-run plan has been reviewed. \`--delete\` only
removes files tracked by spush's remote manifest, but it is still a real remote
change.
`;

export function runSkill(): void {
  process.stdout.write(`${skillGuide.trimEnd()}\n`);
}
