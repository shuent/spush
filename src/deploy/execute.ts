import path from "node:path/posix";
import type { PublishTransport } from "../transports/types.js";
import { joinRemotePath } from "./plan.js";
import type { DeployPlan } from "./types.js";

export async function executeDeployPlan(
  plan: DeployPlan,
  transport: PublishTransport,
): Promise<void> {
  const ensuredDirectories = new Set<string>();

  for (const upload of plan.uploads) {
    const directory = path.dirname(upload.remotePath);
    if (shouldEnsureDirectory(directory) && !ensuredDirectories.has(directory)) {
      await transport.ensureDir(directory);
      ensuredDirectories.add(directory);
    }
    await transport.upload(upload.local.absolutePath, upload.remotePath);
  }

  for (const item of plan.deletes) {
    await transport.remove(item.remotePath);
  }
}

export async function uploadManifest(
  transport: PublishTransport,
  remoteDir: string,
  manifestPath: string,
  content: string,
): Promise<void> {
  const remotePath = joinRemotePath(remoteDir, manifestPath);
  const directory = path.dirname(remotePath);
  if (shouldEnsureDirectory(directory)) {
    await transport.ensureDir(directory);
  }
  await transport.uploadFromString(remotePath, content);
}

function shouldEnsureDirectory(remotePath: string): boolean {
  return remotePath !== "/" && remotePath !== ".";
}
