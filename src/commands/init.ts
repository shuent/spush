import fs from "node:fs/promises";
import path from "node:path";
import { input, select } from "@inquirer/prompts";
import { SpushError, toSpushError } from "../errors.js";
import { createReporter } from "../output/reporter.js";

type Provider = "sakura" | "xserver" | "lolipop";

const providers: Record<Provider, { hostHint: string; remoteDirHint: string; protocol: string }> = {
  sakura: {
    hostHint: "example.sakura.ne.jp",
    remoteDirHint: "/home/account/www",
    protocol: "sftp",
  },
  xserver: {
    hostHint: "sv0000.xserver.jp",
    remoteDirHint: "/home/account/example.com/public_html",
    protocol: "sftp",
  },
  lolipop: {
    hostHint: "ftp.lolipop.jp",
    remoteDirHint: "/",
    protocol: "ftp",
  },
};

export type InitOptions = {
  config?: string;
  provider?: Provider;
  force?: boolean;
  json?: boolean;
};

export async function runInit(options: InitOptions): Promise<void> {
  const reporter = createReporter(Boolean(options.json));

  try {
    const configPath = path.resolve(process.cwd(), options.config ?? "spush.yaml");
    if (!options.force && (await exists(configPath))) {
      throw new SpushError("CONFIG_INVALID", `Config already exists: ${configPath}`, [
        { path: configPath, message: "Pass --force to overwrite" },
      ]);
    }

    const config = options.provider
      ? configFromProvider(options.provider)
      : await promptForConfig();

    await fs.writeFile(configPath, config, "utf8");
    reporter.success({ ok: true, command: "init", durationMs: 0 });
  } catch (error) {
    const spushError = toSpushError(error);
    reporter.error(spushError);
    process.exitCode = spushError.exitCode;
  }
}

async function promptForConfig(): Promise<string> {
  const protocol = await select({
    message: "Protocol",
    choices: [
      { name: "SFTP", value: "sftp" },
      { name: "FTPS", value: "ftps" },
      { name: "FTP", value: "ftp" },
    ],
  });
  const source = await input({ message: "Source directory", default: "dist" });
  const host = await input({ message: "Host" });
  const user = await input({ message: "User" });
  const passwordEnv = await input({ message: "Password env var", default: "SPUSH_PASSWORD" });
  const remoteDir = await input({ message: "Remote directory" });
  const url = await input({ message: "Public URL (optional)" });

  return renderConfig({
    source,
    protocol,
    host,
    user,
    passwordEnv,
    remoteDir,
    url: url || undefined,
  });
}

function configFromProvider(provider: Provider): string {
  const preset = providers[provider];
  return renderConfig({
    source: "dist",
    protocol: preset.protocol,
    host: preset.hostHint,
    user: "your-user",
    passwordEnv: "SPUSH_PASSWORD",
    remoteDir: preset.remoteDirHint,
    url: "https://example.com/",
  });
}

function renderConfig(options: {
  source: string;
  protocol: string;
  host: string;
  user: string;
  passwordEnv: string;
  remoteDir: string;
  url?: string;
}): string {
  const port = options.protocol === "sftp" ? 22 : 21;
  return `source: ${options.source}
include: ["**/*"]
exclude: [".DS_Store", ".spush/**"]

connection:
  protocol: ${options.protocol}
  host: ${options.host}
  port: ${port}
  user: ${options.user}
  password: { env: ${options.passwordEnv} }

remote_dir: ${options.remoteDir}
${options.url ? `url: ${options.url}\n` : ""}# env_file: .env
`;
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
