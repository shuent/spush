import fs from "node:fs/promises";
import path from "node:path";
import posixPath from "node:path/posix";
import { input, select } from "@inquirer/prompts";
import { SpushError, toSpushError } from "../errors.js";
import { createReporter } from "../output/reporter.js";

type Provider = "sakura" | "xserver" | "lolipop";
type Template = "static" | "php" | "wordpress" | "wordpress-import";
type Protocol = "ftp" | "ftps" | "sftp";
type InitArtifacts = {
  config: string;
  envExample: string;
};

const envExampleFileName = ".env.spush.example";

const providers: Record<Provider, { hostHint: string; remoteDirHint: string; protocol: Protocol }> =
  {
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
    exclude: [".DS_Store", ".spush/**", "spush.yaml", "spush.yml", ".env", ".env.*"],
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
      "spush.yaml",
      "spush.yml",
      ".env",
      ".env.*",
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

    const artifacts =
      options.provider || options.template || options.preset
        ? artifactsFromPreset(options)
        : await promptForArtifacts();

    await fs.writeFile(configPath, artifacts.config, "utf8");
    await writeEnvExample(configPath, artifacts.envExample, Boolean(options.force));
    reporter.success({ ok: true, command: "init", durationMs: 0 });
  } catch (error) {
    const spushError = toSpushError(error);
    reporter.error(spushError);
    process.exitCode = spushError.exitCode;
  }
}

async function promptForArtifacts(): Promise<InitArtifacts> {
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
  const envNames = envNamesForProtocol(protocol);
  const passwordEnv = await input({
    message: "Password env var",
    default: envNames.passwordEnv,
  });
  const remoteDir = await input({ message: "Remote directory" });
  const url = await input({ message: "Public URL (optional)" });

  return renderArtifacts({
    source,
    protocol: protocol as Protocol,
    host,
    user,
    passwordEnv,
    remoteDir,
    url: url || undefined,
  });
}

function artifactsFromPreset(options: InitOptions): InitArtifacts {
  const provider = resolveProvider(options.provider);
  const template = resolveTemplate(options.template, options.preset);
  const preset = provider ? providers[provider] : genericPresetFor(template);
  const templateConfig = templates[template];
  const envNames = envNamesForProtocol(preset.protocol);

  return renderArtifacts({
    source: templateConfig.source,
    exclude: templateConfig.exclude,
    protocol: preset.protocol,
    host: preset.hostHint,
    user: "your-user",
    passwordEnv: envNames.passwordEnv,
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
  protocol: Protocol;
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

function renderArtifacts(options: {
  source: string;
  exclude?: string[];
  protocol: Protocol;
  host: string;
  user: string;
  passwordEnv: string;
  remoteDir: string;
  url?: string;
}): InitArtifacts {
  const envNames = envNamesForProtocol(options.protocol);

  return {
    config: renderConfig({
      ...options,
      hostEnv: envNames.hostEnv,
      userEnv: envNames.userEnv,
    }),
    envExample: renderEnvExample({
      protocol: options.protocol,
      host: options.host,
      user: options.user,
      hostEnv: envNames.hostEnv,
      userEnv: envNames.userEnv,
      passwordEnv: options.passwordEnv,
    }),
  };
}

function renderConfig(options: {
  source: string;
  exclude?: string[];
  protocol: Protocol;
  hostEnv: string;
  userEnv: string;
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
  host: { env: ${options.hostEnv} }
  port: ${port}
  user: { env: ${options.userEnv} }
  password: { env: ${options.passwordEnv} }

remote_dir: ${options.remoteDir}
${options.url ? `url: ${options.url}\n` : ""}# env_file: .env.spush
`;
}

function renderEnvExample(options: {
  protocol: Protocol;
  host: string;
  user: string;
  hostEnv: string;
  userEnv: string;
  passwordEnv: string;
}): string {
  const label = options.protocol === "sftp" ? "SFTP" : "FTP/FTPS";
  return `# Copy this file to .env.spush and fill in the values.
# Then run spush with --env-file .env.spush or uncomment env_file in spush.yaml.

# ${label} connection
${options.hostEnv}=${options.host}
${options.userEnv}=${options.user}
${options.passwordEnv}=
`;
}

function envNamesForProtocol(protocol: Protocol): {
  hostEnv: string;
  userEnv: string;
  passwordEnv: string;
} {
  const prefix = protocol === "sftp" ? "SFTP" : "FTP";
  return {
    hostEnv: `${prefix}_HOST`,
    userEnv: `${prefix}_USER`,
    passwordEnv: `${prefix}_PASSWORD`,
  };
}

async function writeEnvExample(configPath: string, content: string, force: boolean): Promise<void> {
  const envExamplePath = path.join(path.dirname(configPath), envExampleFileName);
  if (!force && (await exists(envExamplePath))) {
    return;
  }

  await fs.writeFile(envExamplePath, content, "utf8");
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
