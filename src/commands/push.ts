import path from "node:path/posix";
import { loadConfig } from "../config/load.js";
import type { NormalizedConfig } from "../config/schema.js";
import { executeDeployPlan, uploadManifest } from "../deploy/execute.js";
import { createManifest, parseManifest, serializeManifest } from "../deploy/manifest.js";
import { createDeployPlan, joinRemotePath } from "../deploy/plan.js";
import { scanLocalFiles } from "../deploy/scan.js";
import { verifyUrl } from "../deploy/verify.js";
import { SpushError, toSpushError } from "../errors.js";
import { createReporter } from "../output/reporter.js";
import { createTransport as defaultCreateTransport } from "../transports/factory.js";
import type { PublishTransport } from "../transports/types.js";

export type PushOptions = {
  config?: string;
  envFile?: string;
  json?: boolean;
  verbose?: boolean;
  dryRun?: boolean;
  delete?: boolean;
  verify?: boolean | string;
};

export type PushDependencies = {
  createTransport?: (config: NormalizedConfig) => PublishTransport;
  now?: () => Date;
};

export async function runPush(
  options: PushOptions,
  dependencies: PushDependencies = {},
): Promise<void> {
  const startedAt = Date.now();
  const reporter = createReporter(Boolean(options.json));

  try {
    const config = await loadConfig({ configPath: options.config, envFile: options.envFile });
    const localFiles = await scanLocalFiles({
      source: config.source,
      include: config.include,
      exclude: config.exclude,
    });
    ensureManifestIsReserved(
      localFiles.map((file) => file.path),
      config.manifestPath,
    );

    const createTransport = dependencies.createTransport ?? defaultCreateTransport;
    const warnings: string[] = [];

    if (options.dryRun) {
      const plan = createDeployPlan({
        localFiles,
        manifest: null,
        remoteDir: config.remoteDir,
        deleteMissing: Boolean(options.delete),
      });

      reporter.success({
        ok: true,
        command: "push",
        dryRun: true,
        uploaded: plan.uploads.length,
        skipped: plan.skips.length,
        deleted: plan.deletes.length,
        bytes: plan.bytes,
        durationMs: Date.now() - startedAt,
        remoteDir: config.remoteDir,
        warnings,
      });
      return;
    }

    const transport = createTransport(config);
    let connected = false;

    try {
      await transport.connect();
      connected = true;

      const manifestRemotePath = joinRemotePath(config.remoteDir, config.manifestPath);
      const manifestContent = await transport.downloadToString(manifestRemotePath);
      const manifest = parseManifest(manifestContent);
      if (manifestContent !== null && manifest === null) {
        warnings.push("Remote manifest is unreadable; treating this as a first push.");
      }

      const plan = createDeployPlan({
        localFiles,
        manifest,
        remoteDir: config.remoteDir,
        deleteMissing: Boolean(options.delete),
      });

      await executeDeployPlan(plan, transport);
      const nextManifest = createManifest(
        localFiles,
        (dependencies.now ?? (() => new Date()))().toISOString(),
      );
      await uploadManifest(
        transport,
        config.remoteDir,
        config.manifestPath,
        serializeManifest(nextManifest),
      );

      const verifyTarget = resolveVerifyTarget(options.verify, config.url);
      const verified = verifyTarget ? await verifyUrl(verifyTarget) : undefined;

      reporter.success({
        ok: true,
        command: "push",
        uploaded: plan.uploads.length,
        skipped: plan.skips.length,
        deleted: plan.deletes.length,
        bytes: plan.bytes,
        durationMs: Date.now() - startedAt,
        remoteDir: config.remoteDir,
        verified: verified ? { url: verified.url, status: verified.status } : undefined,
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

function resolveVerifyTarget(
  verify: boolean | string | undefined,
  configUrl: string | undefined,
): string | null {
  if (!verify) {
    return null;
  }

  if (typeof verify === "string") {
    return verify;
  }

  if (!configUrl) {
    throw new SpushError("VERIFY_FAILED", "--verify requires url in config or an explicit URL", [
      { path: "url", message: "Set url in spush.yaml or pass --verify <url>" },
    ]);
  }

  return configUrl;
}

function ensureManifestIsReserved(localPaths: string[], manifestPath: string): void {
  const normalizedManifestPath = manifestPath.replace(/^\.\//, "");
  if (localPaths.includes(normalizedManifestPath)) {
    throw new SpushError("CONFIG_INVALID", "Source includes the internal spush manifest path", [
      {
        path: "exclude",
        message: `Exclude ${path.dirname(normalizedManifestPath)}/** from uploads`,
      },
    ]);
  }
}
