import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { config as loadDotenv } from "dotenv";
import { parse } from "yaml";
import { type ErrorIssue, SpushError } from "../errors.js";
import {
  type NormalizedConfig,
  type RawConfig,
  type RawConnectionConfig,
  type SecretConfig,
  rawConfigSchema,
} from "./schema.js";

export type LoadConfigOptions = {
  configPath?: string;
  envFile?: string;
  cwd?: string;
};

export async function loadConfig(options: LoadConfigOptions = {}): Promise<NormalizedConfig> {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const configPath = path.resolve(cwd, options.configPath ?? "spush.yaml");
  let content: string;

  try {
    content = await fs.readFile(configPath, "utf8");
  } catch (error) {
    throw new SpushError("CONFIG_INVALID", `Config file not found: ${configPath}`, [
      { path: options.configPath ?? "spush.yaml", message: getErrorMessage(error) },
    ]);
  }

  let parsed: unknown;
  try {
    parsed = parse(content);
  } catch (error) {
    throw new SpushError("CONFIG_INVALID", "Config YAML is invalid", [
      { path: configPath, message: getErrorMessage(error) },
    ]);
  }

  const schemaResult = rawConfigSchema.safeParse(parsed);
  if (!schemaResult.success) {
    throw new SpushError(
      "CONFIG_INVALID",
      "Config is invalid",
      schemaResult.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    );
  }

  const rawConfig = schemaResult.data;
  const envFile = options.envFile ?? rawConfig.env_file;
  if (envFile) {
    const envFilePath = path.resolve(path.dirname(configPath), envFile);
    const result = loadDotenv({ path: envFilePath });
    if (result.error) {
      throw new SpushError("CONFIG_INVALID", `Env file not found: ${envFilePath}`, [
        { path: "env_file", message: result.error.message },
      ]);
    }
  }

  return normalizeConfig(rawConfig, configPath, cwd);
}

function normalizeConfig(rawConfig: RawConfig, configPath: string, cwd: string): NormalizedConfig {
  const baseDir = path.dirname(configPath);
  const remoteDir = normalizeRemotePath(rawConfig.remote_dir, "remote_dir");
  const manifestPath = normalizeRemotePath(rawConfig.manifest.path, "manifest.path", {
    allowRelative: true,
  });

  return {
    configPath,
    cwd,
    source: path.resolve(baseDir, rawConfig.source),
    include: rawConfig.include,
    exclude: rawConfig.exclude,
    connection: resolveConnection(rawConfig.connection, baseDir),
    remoteDir,
    url: rawConfig.url,
    manifestPath,
  };
}

function resolveConnection(
  connection: RawConnectionConfig,
  baseDir: string,
): NormalizedConfig["connection"] {
  if (connection.protocol === "ftp") {
    return {
      protocol: "ftp",
      host: connection.host,
      port: connection.port,
      user: connection.user,
      password: resolveSecret(connection.password, "connection.password"),
    };
  }

  if (connection.protocol === "ftps") {
    return {
      protocol: "ftps",
      host: connection.host,
      port: connection.port,
      user: connection.user,
      password: resolveSecret(connection.password, "connection.password"),
      rejectUnauthorized: connection.reject_unauthorized,
    };
  }

  return {
    protocol: "sftp",
    host: connection.host,
    port: connection.port,
    user: connection.user,
    password: connection.password
      ? resolveSecret(connection.password, "connection.password")
      : undefined,
    privateKeyPath: connection.private_key?.path
      ? resolveLocalPath(baseDir, connection.private_key.path)
      : undefined,
  };
}

function resolveSecret(secret: SecretConfig, issuePath: string): string {
  if (typeof secret === "string") {
    return secret;
  }

  if ("value" in secret) {
    return secret.value;
  }

  const value = process.env[secret.env];
  if (value === undefined) {
    const issues: ErrorIssue[] = [
      { path: issuePath, message: `Environment variable ${secret.env} is not set` },
    ];
    throw new SpushError("SECRET_ENV_MISSING", `Missing secret: ${secret.env}`, issues);
  }

  return value;
}

export function normalizeRemotePath(
  remotePath: string,
  issuePath = "remote_path",
  options: { allowRelative?: boolean } = {},
): string {
  const normalized = remotePath.replaceAll("\\", "/").replace(/\/+/g, "/");
  const withoutTrailingSlash = normalized.length > 1 ? normalized.replace(/\/$/, "") : normalized;

  if (!withoutTrailingSlash || withoutTrailingSlash === ".") {
    if (options.allowRelative) {
      return ".";
    }
    throw new SpushError("CONFIG_INVALID", "Remote path is invalid", [
      { path: issuePath, message: "Remote path must not be empty" },
    ]);
  }

  if (
    withoutTrailingSlash === "/" ||
    withoutTrailingSlash.includes("/../") ||
    withoutTrailingSlash.startsWith("../") ||
    withoutTrailingSlash.endsWith("/..")
  ) {
    throw new SpushError("CONFIG_INVALID", "Remote path is invalid", [
      { path: issuePath, message: "Remote path must not target root or contain .. segments" },
    ]);
  }

  return withoutTrailingSlash;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function resolveLocalPath(baseDir: string, localPath: string): string {
  if (localPath === "~") {
    return os.homedir();
  }

  if (localPath.startsWith("~/")) {
    return path.join(os.homedir(), localPath.slice(2));
  }

  return path.resolve(baseDir, localPath);
}
