import { loadConfig } from "../config/load.js";
import type { NormalizedConfig } from "../config/schema.js";
import { SpushError, toSpushError } from "../errors.js";
import { createReporter } from "../output/reporter.js";
import { createTransport as defaultCreateTransport } from "../transports/factory.js";
import type { PublishTransport } from "../transports/types.js";

export type CheckOptions = {
  config?: string;
  envFile?: string;
  json?: boolean;
};

export type CheckDependencies = {
  createTransport?: (config: NormalizedConfig) => PublishTransport;
};

export async function runCheck(
  options: CheckOptions,
  dependencies: CheckDependencies = {},
): Promise<void> {
  const startedAt = Date.now();
  const reporter = createReporter(Boolean(options.json));

  try {
    const config = await loadConfig({ configPath: options.config, envFile: options.envFile });
    const transport = (dependencies.createTransport ?? defaultCreateTransport)(config);
    let connected = false;

    try {
      await transport.connect();
      connected = true;
      const exists = await transport.directoryExists(config.remoteDir);
      if (!exists) {
        throw new SpushError("CONNECT_FAILED", "Remote directory does not exist", [
          { path: "remote_dir", message: config.remoteDir },
        ]);
      }
    } finally {
      if (connected) {
        await transport.close();
      }
    }

    reporter.success({
      ok: true,
      command: "check",
      durationMs: Date.now() - startedAt,
      remoteDir: config.remoteDir,
    });
  } catch (error) {
    const spushError = toSpushError(error);
    reporter.error(spushError);
    process.exitCode = spushError.exitCode;
  }
}
