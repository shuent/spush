import pc from "picocolors";
import type { SpushError } from "../errors.js";

export type CommandSuccess = {
  ok: true;
  command: string;
  uploaded?: number;
  skipped?: number;
  deleted?: number;
  bytes?: number;
  durationMs?: number;
  remoteDir?: string;
  dryRun?: boolean;
  verified?: {
    url: string;
    status: number;
  };
  warnings?: string[];
};

export type Reporter = {
  success(result: CommandSuccess): void;
  error(error: SpushError): void;
  info(message: string): void;
  warn(message: string): void;
};

export function createReporter(json: boolean): Reporter {
  return json ? createJsonReporter() : createHumanReporter();
}

function createJsonReporter(): Reporter {
  return {
    success(result) {
      process.stdout.write(`${JSON.stringify(result)}\n`);
    },
    error(error) {
      process.stderr.write(
        `${JSON.stringify({
          ok: false,
          code: error.code,
          message: error.message,
          issues: error.issues,
        })}\n`,
      );
    },
    info() {},
    warn() {},
  };
}

function createHumanReporter(): Reporter {
  return {
    success(result) {
      const parts = [
        result.dryRun ? pc.yellow("dry-run") : pc.green("ok"),
        result.uploaded !== undefined ? `uploaded ${result.uploaded}` : undefined,
        result.skipped !== undefined ? `skipped ${result.skipped}` : undefined,
        result.deleted !== undefined ? `deleted ${result.deleted}` : undefined,
        result.bytes !== undefined ? `${result.bytes} bytes` : undefined,
        result.durationMs !== undefined ? `${result.durationMs}ms` : undefined,
      ].filter(Boolean);

      process.stdout.write(`${parts.join(" | ")}\n`);

      if (result.verified) {
        process.stdout.write(
          pc.green(`verified ${result.verified.url} (${result.verified.status})\n`),
        );
      }

      for (const warning of result.warnings ?? []) {
        process.stderr.write(`${pc.yellow("warning")} ${warning}\n`);
      }
    },
    error(error) {
      process.stderr.write(`${pc.red(error.code)} ${error.message}\n`);
      for (const issue of error.issues) {
        process.stderr.write(`  ${issue.path}: ${issue.message}\n`);
      }
    },
    info(message) {
      process.stderr.write(`${message}\n`);
    },
    warn(message) {
      process.stderr.write(`${pc.yellow("warning")} ${message}\n`);
    },
  };
}
