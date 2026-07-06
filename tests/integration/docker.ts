import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { runCheck } from "../../src/commands/check.js";
import { type PushOptions, runPush } from "../../src/commands/push.js";
import { loadConfig } from "../../src/config/load.js";
import { createTransport } from "../../src/transports/factory.js";

const execFileAsync = promisify(execFile);
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const composeFile = path.join(repoRoot, "docker-compose.integration.yml");
const composeProjectName = "spush-integration";
const password = "password";

let servicesStarted = false;

export type IntegrationTarget = {
  name: string;
  protocol: "ftp" | "sftp";
  port: number;
  remoteBase: string;
};

export const integrationTargets: IntegrationTarget[] = [
  {
    name: "SFTP",
    protocol: "sftp",
    port: 2222,
    remoteBase: "/upload",
  },
  {
    name: "FTP",
    protocol: "ftp",
    port: 2121,
    remoteBase: "/ftp/spush/upload",
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
      await ensureRemoteDir(project.configPath);
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

export async function createProject(
  target: IntegrationTarget,
  files: Record<string, string>,
): Promise<TestProject> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "spush-integration-"));
  const distDir = path.join(dir, "dist");
  const remoteDir = `${target.remoteBase}/site-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}`;

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
  password: { value: ${password} }
remote_dir: ${remoteDir}
`,
  );

  return { dir, distDir, configPath, remoteDir };
}

export async function ensureRemoteDir(configPath: string): Promise<void> {
  const config = await loadConfig({ configPath });
  const transport = createTransport(config);
  let connected = false;

  try {
    await transport.connect();
    connected = true;
    await transport.ensureDir(config.remoteDir);
  } finally {
    if (connected) {
      await transport.close();
    }
  }
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

export function runCheckJson(configPath: string): Promise<CheckJsonResult> {
  return captureCommandJson(() => runCheck({ config: configPath, json: true }));
}

export function runPushJson(
  configPath: string,
  options: Pick<PushOptions, "delete"> = {},
): Promise<PushJsonResult> {
  return captureCommandJson(() => runPush({ config: configPath, json: true, ...options }));
}

async function captureCommandJson<T>(fn: () => Promise<void>): Promise<T> {
  const originalStdoutWrite = process.stdout.write;
  const originalStderrWrite = process.stderr.write;
  const originalExitCode = process.exitCode;
  let stdout = "";
  let stderr = "";

  process.exitCode = undefined;
  process.stdout.write = ((chunk: string | Uint8Array) => {
    stdout += chunk.toString();
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: string | Uint8Array) => {
    stderr += chunk.toString();
    return true;
  }) as typeof process.stderr.write;

  try {
    await fn();
    if (process.exitCode && process.exitCode !== 0) {
      throw new Error(stderr.trim() || `Command failed with exit code ${process.exitCode}`);
    }

    const line = stdout.trim().split("\n").filter(Boolean).at(-1);
    if (!line) {
      throw new Error(`Command did not print JSON. stderr: ${stderr.trim()}`);
    }

    return JSON.parse(line) as T;
  } finally {
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
    process.exitCode = originalExitCode;
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
