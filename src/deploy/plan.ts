import path from "node:path/posix";
import { normalizeRemotePath } from "../config/load.js";
import type { DeployPlan, LocalFile, Manifest } from "./types.js";

export type CreateDeployPlanOptions = {
  localFiles: LocalFile[];
  manifest: Manifest | null;
  remoteDir: string;
  deleteMissing: boolean;
  forceUpload?: boolean;
};

export function createDeployPlan(options: CreateDeployPlanOptions): DeployPlan {
  const manifestFiles = new Map((options.manifest?.files ?? []).map((file) => [file.path, file]));
  const localFiles = new Map(options.localFiles.map((file) => [file.path, file]));
  const uploads = [];
  const skips = [];
  const deletes = [];

  for (const file of options.localFiles) {
    const previous = manifestFiles.get(file.path);
    if (!options.forceUpload && previous?.sha256 === file.sha256) {
      skips.push({ path: file.path, sha256: file.sha256, size: file.size });
      continue;
    }

    uploads.push({
      local: file,
      remotePath: joinRemotePath(options.remoteDir, file.path),
    });
  }

  if (options.deleteMissing) {
    for (const file of manifestFiles.values()) {
      if (!localFiles.has(file.path)) {
        deletes.push({
          path: file.path,
          remotePath: joinRemotePath(options.remoteDir, file.path),
        });
      }
    }
  }

  return {
    uploads,
    skips,
    deletes,
    bytes: uploads.reduce((sum, item) => sum + item.local.size, 0),
  };
}

export function joinRemotePath(...parts: string[]): string {
  const joined = path.join(...parts.filter(Boolean));
  if (parts[0]?.startsWith("/") && !joined.startsWith("/")) {
    return normalizeRemotePath(`/${joined}`);
  }

  return normalizeRemotePath(joined);
}
