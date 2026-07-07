import fs from "node:fs/promises";
import path from "node:path";
import { joinRemotePath } from "../deploy/plan.js";
import { SpushError } from "../errors.js";
import type { RemoteEntry } from "../transports/types.js";
import { matchesTransferPatterns } from "./match.js";

export type ImportAction = {
  path: string;
  remotePath: string;
  localPath: string;
  size: number;
};

export type ImportPlan = {
  downloads: ImportAction[];
  skipped: number;
  bytes: number;
};

export type CreateImportPlanOptions = {
  remoteEntries: RemoteEntry[];
  remoteDir: string;
  source: string;
  include: string[];
  exclude: string[];
  force: boolean;
};

export async function createImportPlan(options: CreateImportPlanOptions): Promise<ImportPlan> {
  const downloads: ImportAction[] = [];
  const conflicts: { path: string; message: string }[] = [];
  let skipped = 0;

  const remoteFiles = options.remoteEntries
    .filter((entry) => entry.type === "file")
    .map((entry) => ({ ...entry, path: normalizeRelativePath(entry.path) }))
    .sort((a, b) => a.path.localeCompare(b.path));

  for (const file of remoteFiles) {
    if (!matchesTransferPatterns(file.path, options.include, options.exclude)) {
      skipped += 1;
      continue;
    }

    const localPath = resolveLocalPath(options.source, file.path);
    const localTarget = await statLocalTarget(localPath);
    if (localTarget === "directory") {
      conflicts.push({ path: file.path, message: "Local path is a directory" });
      continue;
    }

    if (localTarget === "file" && !options.force) {
      conflicts.push({ path: file.path, message: "Local file already exists; pass --force" });
      continue;
    }

    downloads.push({
      path: file.path,
      remotePath: joinRemotePath(options.remoteDir, file.path),
      localPath,
      size: file.size ?? 0,
    });
  }

  if (conflicts.length > 0) {
    throw new SpushError("TRANSFER_FAILED", "Import would overwrite local files", [
      ...conflicts.slice(0, 20).map((conflict) => ({
        path: conflict.path,
        message: conflict.message,
      })),
      ...(conflicts.length > 20
        ? [{ path: "source", message: `${conflicts.length - 20} more conflicts` }]
        : []),
    ]);
  }

  return {
    downloads,
    skipped,
    bytes: downloads.reduce((sum, download) => sum + download.size, 0),
  };
}

function normalizeRelativePath(value: string): string {
  const normalized = value.replaceAll("\\", "/").replace(/^\/+/, "").replace(/\/+/g, "/");
  const segments = normalized.split("/");
  if (
    !normalized ||
    normalized === "." ||
    segments.some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    throw new SpushError("TRANSFER_FAILED", "Remote entry path is unsafe", [
      { path: value, message: "Remote entry paths must be relative and must not contain . or .." },
    ]);
  }

  return normalized;
}

function resolveLocalPath(source: string, relativePath: string): string {
  const absoluteSource = path.resolve(source);
  const candidate = path.resolve(absoluteSource, ...relativePath.split("/"));
  const sourcePrefix = absoluteSource.endsWith(path.sep)
    ? absoluteSource
    : `${absoluteSource}${path.sep}`;

  if (!candidate.startsWith(sourcePrefix)) {
    throw new SpushError("TRANSFER_FAILED", "Remote entry path is unsafe", [
      { path: relativePath, message: "Resolved local path escapes source" },
    ]);
  }

  return candidate;
}

async function statLocalTarget(localPath: string): Promise<"file" | "directory" | null> {
  try {
    const stat = await fs.stat(localPath);
    return stat.isDirectory() ? "directory" : "file";
  } catch (error) {
    if (isNotFoundError(error)) {
      return null;
    }

    throw error;
  }
}

function isNotFoundError(error: unknown): boolean {
  return (
    error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}
