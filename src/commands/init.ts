import fs from "node:fs/promises";
import path from "node:path";
import posixPath from "node:path/posix";
import { input, select } from "@inquirer/prompts";
import { SpushError, toSpushError } from "../errors.js";
import { createReporter } from "../output/reporter.js";

type Provider = "sakura" | "xserver" | "lolipop";
type Template = "static" | "php" | "wordpress" | "wordpress-import";

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
    remoteDirHint: "web",
    protocol: "ftp",
  },
};

const templates: Record<Template, { source: string; exclude: string[] }> = {
  static: {
    source: "dist",
    exclude: [".DS_Store", ".spush/**"],
  },
  php: {
    source: ".",
    exclude: [
      ".DS_Store",
      ".spush/**",
      ".git/**",
      "node_modules/**",
      "spush.yaml",
      "spush.yml",
      ".env",
      ".env.*",
    ],
  },
  wordpress: {
    source: "wordpress",
    exclude: [
      ".DS_Store",
      ".spush/**",
      ".git/**",
      "node_modules/**",
      "vendor/**",
      "wp-content/cache/**",
    ],
  },
  "wordpress-import": {
    source: ".",
    exclude: [
      ".DS_Store",
      ".spush/**",
      ".git/**",
      "spush.yaml",
      "spush.yml",
      ".env",
      ".env.*",
      "wp-content/cache/**",
    ],
  },
};

export type InitOptions = {
  config?: string;
  provider?: string;
  template?: string;
  preset?: string;
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

    const config =
      options.provider || options.template || options.preset
        ? configFromPreset(options)
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

function configFromPreset(options: InitOptions): string {
  const provider = resolveProvider(options.provider);
  const template = resolveTemplate(options.template, options.preset);
  const preset = provider ? providers[provider] : genericPresetFor(template);
  const templateConfig = templates[template];

  return renderConfig({
    source: templateConfig.source,
    exclude: templateConfig.exclude,
    protocol: preset.protocol,
    host: preset.hostHint,
    user: "your-user",
    passwordEnv: "SPUSH_PASSWORD",
    remoteDir: remoteDirForTemplate(preset.remoteDirHint, template),
    url: "https://example.com/",
  });
}

function resolveProvider(value: string | undefined): Provider | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === "sakura" || value === "xserver" || value === "lolipop") {
    return value;
  }

  throw new SpushError("CONFIG_INVALID", `Unknown provider preset: ${value}`, [
    { path: "provider", message: "Use sakura, xserver, or lolipop" },
  ]);
}

function resolveTemplate(template: string | undefined, preset: string | undefined): Template {
  if (template && preset && template !== preset) {
    throw new SpushError("CONFIG_INVALID", "Conflicting init templates", [
      { path: "template", message: "--template and --preset must match when both are set" },
    ]);
  }

  const value = template ?? preset ?? "static";
  if (
    value === "static" ||
    value === "php" ||
    value === "wordpress" ||
    value === "wordpress-import"
  ) {
    return value;
  }

  throw new SpushError("CONFIG_INVALID", `Unknown template preset: ${value}`, [
    { path: "template", message: "Use static, php, wordpress, or wordpress-import" },
  ]);
}

function genericPresetFor(template: Template): {
  hostHint: string;
  remoteDirHint: string;
  protocol: string;
} {
  return {
    hostHint: "example.com",
    remoteDirHint:
      template === "wordpress" || template === "wordpress-import"
        ? "/home/myuser/example.com/public_html"
        : "/home/myuser/www",
    protocol: "sftp",
  };
}

function remoteDirForTemplate(remoteDirHint: string, template: Template): string {
  if (template !== "wordpress") {
    return remoteDirHint;
  }

  return posixPath.join(remoteDirHint, "wp");
}

function renderConfig(options: {
  source: string;
  exclude?: string[];
  protocol: string;
  host: string;
  user: string;
  passwordEnv: string;
  remoteDir: string;
  url?: string;
}): string {
  const port = options.protocol === "sftp" ? 22 : 21;
  const exclude = options.exclude ?? templates.static.exclude;
  return `source: ${options.source}
include: ["**/*"]
exclude: [${exclude.map((item) => JSON.stringify(item)).join(", ")}]

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
