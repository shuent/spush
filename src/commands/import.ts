import fs from "node:fs/promises";
import path from "node:path";
import { loadConfig } from "../config/load.js";
import type { NormalizedConfig } from "../config/schema.js";
import { uploadManifest } from "../deploy/execute.js";
import { createManifest, serializeManifest } from "../deploy/manifest.js";
import { ensureConfigIsReserved, ensureManifestIsReserved } from "../deploy/reserved.js";
import { scanLocalFiles } from "../deploy/scan.js";
import { SpushError, toSpushError } from "../errors.js";
import { type ImportPlan, createImportPlan } from "../import/plan.js";
import { createReporter } from "../output/reporter.js";
import { createTransport as defaultCreateTransport } from "../transports/factory.js";
import type { PublishTransport } from "../transports/types.js";

export type ImportOptions = {
  config?: string;
  envFile?: string;
  json?: boolean;
  verbose?: boolean;
  dryRun?: boolean;
  force?: boolean;
  writeManifest?: boolean;
};

export type ImportDependencies = {
  createTransport?: (config: NormalizedConfig) => PublishTransport;
  now?: () => Date;
};

export async function runImport(
  options: ImportOptions,
  dependencies: ImportDependencies = {},
): Promise<void> {
  const startedAt = Date.now();
  const reporter = createReporter(Boolean(options.json));
  const warnings: string[] = [];

  try {
    const config = await loadConfig({ configPath: options.config, envFile: options.envFile });
    await ensureSourceCanReceiveImports(config.source);

    const createTransport = dependencies.createTransport ?? defaultCreateTransport;
    const transport = createTransport(config);
    let connected = false;

    try {
      await transport.connect();
      connected = true;

      const remoteEntries = await transport.list(config.remoteDir);
      const plan = await createImportPlan({
        remoteEntries,
        remoteDir: config.remoteDir,
        source: config.source,
        include: config.include,
        exclude: config.exclude,
        force: Boolean(options.force),
      });
      ensureManifestIsReserved(
        plan.downloads.map((download) => download.path),
        config.manifestPath,
      );
      ensureConfigIsReserved(
        plan.downloads.map((download) => download.path),
        config.source,
        config.configPath,
      );

      if (options.dryRun) {
        if (options.writeManifest) {
          warnings.push("Dry-run did not download files or write the remote manifest.");
        }

        reporter.success({
          ok: true,
          command: "import",
          dryRun: true,
          downloaded: plan.downloads.length,
          skipped: plan.skipped,
          bytes: plan.bytes,
          durationMs: Date.now() - startedAt,
          remoteDir: config.remoteDir,
          manifestWritten: false,
          warnings,
        });
        return;
      }

      await fs.mkdir(config.source, { recursive: true });
      await executeImportPlan(plan, transport, Boolean(options.verbose), (message) =>
        reporter.info(message),
      );

      const manifestWritten = options.writeManifest
        ? await writeRemoteManifest(
            config,
            transport,
            dependencies.now ?? (() => new Date()),
            plan.downloads.map((download) => download.path),
          )
        : false;

      reporter.success({
        ok: true,
        command: "import",
        downloaded: plan.downloads.length,
        skipped: plan.skipped,
        bytes: plan.bytes,
        durationMs: Date.now() - startedAt,
        remoteDir: config.remoteDir,
        manifestWritten,
        warnings,
      });
    } finally {
      if (connected) {
        await transport.close();
      }
    }
  } catch (error) {
    const spushError = toSpushError(error);
    reporter.error(spushError);
    process.exitCode = spushError.exitCode;
  }
}

async function executeImportPlan(
  plan: ImportPlan,
  transport: PublishTransport,
  verbose: boolean,
  info: (message: string) => void,
): Promise<void> {
  for (const download of plan.downloads) {
    await fs.mkdir(path.dirname(download.localPath), { recursive: true });
    if (verbose) {
      info(`download ${download.path}`);
    }
    await transport.download(download.remotePath, download.localPath);
  }
}

async function writeRemoteManifest(
  config: NormalizedConfig,
  transport: PublishTransport,
  now: () => Date,
  importedPaths: string[],
): Promise<boolean> {
  const localFiles = await scanLocalFiles({
    source: config.source,
    include: config.include,
    exclude: config.exclude,
  });
  ensureManifestIsReserved(
    localFiles.map((file) => file.path),
    config.manifestPath,
  );
  ensureConfigIsReserved(
    localFiles.map((file) => file.path),
    config.source,
    config.configPath,
  );

  const importedPathSet = new Set(importedPaths);
  const importedFiles = localFiles.filter((file) => importedPathSet.has(file.path));
  const manifest = createManifest(importedFiles, now().toISOString());
  await uploadManifest(
    transport,
    config.remoteDir,
    config.manifestPath,
    serializeManifest(manifest),
  );
  return true;
}

async function ensureSourceCanReceiveImports(source: string): Promise<void> {
  try {
    const stat = await fs.stat(source);
    if (!stat.isDirectory()) {
      throw new SpushError("CONFIG_INVALID", `Source is not a directory: ${source}`, [
        { path: "source", message: source },
      ]);
    }
  } catch (error) {
    if (isNotFoundError(error)) {
      return;
    }

    throw error;
  }
}

function isNotFoundError(error: unknown): boolean {
  return (
    error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}
