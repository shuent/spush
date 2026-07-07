import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const composeFile = path.join(repoRoot, "docker-compose.integration.yml");
const composeProjectName = "spush-integration";
const cliPath = path.join(repoRoot, "dist/cli.js");
const privateKeyPath = path.join(repoRoot, "tests/integration/fixtures/sftp_id_ed25519");
const password = "password";

let servicesStarted = false;

export type IntegrationTarget = {
  name: string;
  protocol: "ftp" | "sftp";
  port: number;
  remoteBase: string;
  auth: "password" | "privateKey";
};

export const integrationTargets: IntegrationTarget[] = [
  {
    name: "SFTP password",
    protocol: "sftp",
    port: 2222,
    remoteBase: "/upload",
    auth: "password",
  },
  {
    name: "SFTP private key",
    protocol: "sftp",
    port: 2222,
    remoteBase: "/upload",
    auth: "privateKey",
  },
  {
    name: "FTP",
    protocol: "ftp",
    port: 2121,
    remoteBase: "/ftp/spush/upload",
    auth: "password",
  },
];

export async function startIntegrationServices(): Promise<void> {
  await dockerCompose(["up", "-d", "--wait"]);
  servicesStarted = true;
}

export async function stopIntegrationServices(): Promise<void> {
  if (!servicesStarted) {
    return;
  }

  await dockerCompose(["down", "-v"]);
  servicesStarted = false;
}

export async function waitForTarget(target: IntegrationTarget): Promise<void> {
  const project = await createProject(target, {
    "index.html": "<h1>ready</h1>",
  });
  const deadline = Date.now() + 60_000;
  let lastError: unknown;

  while (Date.now() < deadline) {
    try {
      await runPushJson(project.configPath);
      const result = await runCheckJson(project.configPath);
      if (result.ok && result.remoteDir === project.remoteDir) {
        return;
      }
    } catch (error) {
      lastError = error;
    }

    await delay(1_000);
  }

  throw new Error(`${target.name} did not become ready: ${getErrorMessage(lastError)}`);
}

export type TestProject = {
  dir: string;
  distDir: string;
  configPath: string;
  remoteDir: string;
};

export type ImportProject = {
  dir: string;
  sourceDir: string;
  configPath: string;
  remoteDir: string;
};

export async function createProject(
  target: IntegrationTarget,
  files: Record<string, string>,
  options: { remoteDir?: string; manifestPath?: string } = {},
): Promise<TestProject> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "spush-integration-"));
  const distDir = path.join(dir, "dist");
  const remoteDir =
    options.remoteDir ??
    `${target.remoteBase}/site-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  for (const [relativePath, content] of Object.entries(files)) {
    const absolutePath = path.join(distDir, relativePath);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, content);
  }

  const configPath = path.join(dir, "spush.yaml");
  await fs.writeFile(
    configPath,
    `
source: dist
connection:
  protocol: ${target.protocol}
  host: 127.0.0.1
  port: ${target.port}
  user: spush
${connectionSecret(target)}
remote_dir: ${remoteDir}
${options.manifestPath ? `manifest:\n  path: ${options.manifestPath}\n` : ""}
`,
  );

  return { dir, distDir, configPath, remoteDir };
}

export async function createImportProject(
  target: IntegrationTarget,
  remoteDir: string,
  options: { source?: string; exclude?: string[] } = {},
): Promise<ImportProject> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "spush-import-integration-"));
  const source = options.source ?? "site";
  const sourceDir = path.join(dir, source);
  const configPath = path.join(dir, "spush.yaml");
  await fs.writeFile(
    configPath,
    `
source: ${source}
include: ["**/*"]
exclude: ${JSON.stringify(options.exclude ?? [".DS_Store", ".spush/**"])}
connection:
  protocol: ${target.protocol}
  host: 127.0.0.1
  port: ${target.port}
  user: spush
${connectionSecret(target)}
remote_dir: ${remoteDir}
`,
  );

  return { dir, sourceDir, configPath, remoteDir };
}

export type CheckJsonResult = {
  ok: true;
  command: "check";
  remoteDir: string;
};

export type PushJsonResult = {
  ok: true;
  command: "push";
  uploaded: number;
  skipped: number;
  deleted: number;
  remoteDir: string;
};

export type ImportJsonResult = {
  ok: true;
  command: "import";
  downloaded: number;
  skipped: number;
  bytes: number;
  remoteDir: string;
  dryRun?: boolean;
  manifestWritten?: boolean;
};

export async function runCheckJson(configPath: string): Promise<CheckJsonResult> {
  return runCliJson(["check", "--config", configPath, "--json"]);
}

export async function runPushJson(
  configPath: string,
  options: { delete?: boolean; force?: boolean } = {},
): Promise<PushJsonResult> {
  const args = ["push", "--config", configPath, "--json"];
  if (options.delete) {
    args.push("--delete");
  }
  if (options.force) {
    args.push("--force");
  }

  return runCliJson(args);
}

export async function runImportJson(
  configPath: string,
  options: { dryRun?: boolean; force?: boolean; writeManifest?: boolean } = {},
): Promise<ImportJsonResult> {
  const args = ["import", "--config", configPath, "--json"];
  if (options.dryRun) {
    args.push("--dry-run");
  }
  if (options.force) {
    args.push("--force");
  }
  if (options.writeManifest) {
    args.push("--write-manifest");
  }

  return runCliJson(args);
}

async function runCliJson<T>(args: string[]): Promise<T> {
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [cliPath, ...args], {
      cwd: repoRoot,
      maxBuffer: 10 * 1024 * 1024,
    });
    const line = stdout.trim().split("\n").filter(Boolean).at(-1);
    if (!line) {
      throw new Error(`Command did not print JSON. stderr: ${stderr.trim()}`);
    }

    return JSON.parse(line) as T;
  } catch (error) {
    if (isExecError(error)) {
      throw new Error(
        [
          `node ${path.relative(repoRoot, cliPath)} ${args.join(" ")} failed`,
          error.stdout.trim(),
          error.stderr.trim(),
        ]
          .filter(Boolean)
          .join("\n"),
      );
    }

    throw error;
  }
}

async function dockerCompose(args: string[]): Promise<void> {
  try {
    await execFileAsync("docker", ["compose", "-f", composeFile, ...args], {
      cwd: repoRoot,
      env: {
        ...process.env,
        COMPOSE_PROJECT_NAME: composeProjectName,
      },
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch (error) {
    throw new Error(`docker compose ${args.join(" ")} failed: ${getErrorMessage(error)}`);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function connectionSecret(target: IntegrationTarget): string {
  if (target.auth === "privateKey") {
    return `  private_key: { path: ${privateKeyPath} }`;
  }

  return `  password: { value: ${password} }`;
}

function isExecError(error: unknown): error is Error & { stdout: string; stderr: string } {
  return (
    error instanceof Error &&
    "stdout" in error &&
    typeof error.stdout === "string" &&
    "stderr" in error &&
    typeof error.stderr === "string"
  );
}
