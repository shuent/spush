import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { config as loadDotenv } from "dotenv";
import { parse } from "yaml";
import { type ErrorIssue, SpushError } from "../errors.js";
import {
  type ConnectionStringConfig,
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
    allowRoot: false,
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
      host: resolveConnectionString(connection.host, "connection.host"),
      port: connection.port,
      user: resolveConnectionString(connection.user, "connection.user"),
      password: resolveSecret(connection.password, "connection.password"),
    };
  }

  if (connection.protocol === "ftps") {
    return {
      protocol: "ftps",
      host: resolveConnectionString(connection.host, "connection.host"),
      port: connection.port,
      user: resolveConnectionString(connection.user, "connection.user"),
      password: resolveSecret(connection.password, "connection.password"),
      rejectUnauthorized: connection.reject_unauthorized,
    };
  }

  return {
    protocol: "sftp",
    host: resolveConnectionString(connection.host, "connection.host"),
    port: connection.port,
    user: resolveConnectionString(connection.user, "connection.user"),
    password: connection.password
      ? resolveSecret(connection.password, "connection.password")
      : undefined,
    privateKeyPath: connection.private_key?.path
      ? resolveLocalPath(baseDir, connection.private_key.path)
      : undefined,
  };
}

function resolveConnectionString(value: ConnectionStringConfig, issuePath: string): string {
  if (typeof value === "string") {
    return value;
  }

  return resolveEnv(value.env, issuePath, { secret: false, allowEmpty: false });
}

function resolveSecret(secret: SecretConfig, issuePath: string): string {
  if (typeof secret === "string") {
    return secret;
  }

  if ("value" in secret) {
    return secret.value;
  }

  return resolveEnv(secret.env, issuePath, { secret: true, allowEmpty: true });
}

function resolveEnv(
  envName: string,
  issuePath: string,
  options: { secret: boolean; allowEmpty: boolean },
): string {
  const value = process.env[envName];
  if (value === undefined) {
    const issues: ErrorIssue[] = [
      { path: issuePath, message: `Environment variable ${envName} is not set` },
    ];
    if (options.secret) {
      throw new SpushError("SECRET_ENV_MISSING", `Missing secret: ${envName}`, issues);
    }

    throw new SpushError("CONFIG_INVALID", `Missing environment variable: ${envName}`, issues);
  }

  if (!options.allowEmpty && value.length === 0) {
    throw new SpushError("CONFIG_INVALID", `Empty environment variable: ${envName}`, [
      { path: issuePath, message: `Environment variable ${envName} must not be empty` },
    ]);
  }

  return value;
}

export function normalizeRemotePath(
  remotePath: string,
  issuePath = "remote_path",
  options: { allowRelative?: boolean; allowRoot?: boolean } = {},
): string {
  const normalized = remotePath.replaceAll("\\", "/").replace(/\/+/g, "/");
  const isAbsolute = normalized.startsWith("/");
  const segments: string[] = [];

  for (const segment of normalized.split("/")) {
    if (segment === "" || segment === ".") {
      continue;
    }

    if (segment === "..") {
      throwRemotePathError(issuePath, "Remote path must not contain .. segments");
    }

    segments.push(segment);
  }

  if (segments.length === 0) {
    if (isAbsolute) {
      if (options.allowRoot === false) {
        throwRemotePathError(issuePath, "Remote path must not target root");
      }

      return "/";
    }

    if (options.allowRelative) {
      return ".";
    }

    throwRemotePathError(issuePath, "Remote path must not be empty");
  }

  return `${isAbsolute ? "/" : ""}${segments.join("/")}`;
}

function throwRemotePathError(issuePath: string, message: string): never {
  throw new SpushError("CONFIG_INVALID", "Remote path is invalid", [{ path: issuePath, message }]);
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
