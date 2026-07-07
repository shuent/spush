import fs from "node:fs/promises";
import path from "node:path/posix";
import SftpClient from "ssh2-sftp-client";
import type { ResolvedConnectionConfig } from "../config/schema.js";
import { SpushError } from "../errors.js";
import type { PublishTransport, RemoteEntry } from "./types.js";

type SftpConnectionConfig = Extract<ResolvedConnectionConfig, { protocol: "sftp" }>;

export class SftpTransport implements PublishTransport {
  private readonly client = new SftpClient();

  constructor(private readonly config: SftpConnectionConfig) {}

  async connect(): Promise<void> {
    try {
      await this.client.connect({
        host: this.config.host,
        port: this.config.port,
        username: this.config.user,
        password: this.config.password,
        privateKey: this.config.privateKeyPath
          ? await fs.readFile(this.config.privateKeyPath)
          : undefined,
      });
    } catch (error) {
      throw new SpushError("CONNECT_FAILED", "SFTP connection failed", [
        { path: "connection", message: getErrorMessage(error) },
      ]);
    }
  }

  async upload(localPath: string, remotePath: string): Promise<void> {
    try {
      await this.client.put(localPath, remotePath);
    } catch (error) {
      throw transferError(`Upload failed: ${remotePath}`, error);
    }
  }

  async list(remoteDir: string): Promise<RemoteEntry[]> {
    try {
      return await this.listDirectory(remoteDir, "");
    } catch (error) {
      throw transferError(`List failed: ${remoteDir}`, error);
    }
  }

  async download(remotePath: string, localPath: string): Promise<void> {
    try {
      await this.client.get(remotePath, localPath);
    } catch (error) {
      throw transferError(`Download failed: ${remotePath}`, error);
    }
  }

  async downloadToString(remotePath: string): Promise<string | null> {
    try {
      const result = await this.client.get(remotePath);
      return Buffer.isBuffer(result) ? result.toString("utf8") : null;
    } catch {
      return null;
    }
  }

  async uploadFromString(remotePath: string, content: string): Promise<void> {
    try {
      await this.client.put(Buffer.from(content), remotePath);
    } catch (error) {
      throw transferError(`Upload failed: ${remotePath}`, error);
    }
  }

  async remove(remotePath: string): Promise<void> {
    try {
      await this.client.delete(remotePath);
    } catch (error) {
      throw transferError(`Delete failed: ${remotePath}`, error);
    }
  }

  async ensureDir(remotePath: string): Promise<void> {
    try {
      await this.client.mkdir(remotePath, true);
    } catch (error) {
      throw transferError(`Ensure directory failed: ${remotePath}`, error);
    }
  }

  async directoryExists(remotePath: string): Promise<boolean> {
    try {
      const result = await this.client.exists(remotePath);
      return result === "d";
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    await this.client.end();
  }

  private async listDirectory(remoteDir: string, relativeDir: string): Promise<RemoteEntry[]> {
    const currentRemoteDir = relativeDir ? path.join(remoteDir, relativeDir) : remoteDir;
    const items = await this.client.list(currentRemoteDir);
    const entries: RemoteEntry[] = [];

    for (const item of items) {
      if (item.name === "." || item.name === "..") {
        continue;
      }

      const relativePath = relativeDir ? path.join(relativeDir, item.name) : item.name;
      if (item.type === "d") {
        entries.push({
          path: relativePath,
          type: "directory",
          modifiedAt: toIsoDate(item.modifyTime),
        });
        entries.push(...(await this.listDirectory(remoteDir, relativePath)));
        continue;
      }

      if (item.type === "-") {
        entries.push({
          path: relativePath,
          type: "file",
          size: item.size,
          modifiedAt: toIsoDate(item.modifyTime),
        });
      }
    }

    return entries;
  }
}

function transferError(message: string, error: unknown): SpushError {
  return new SpushError("TRANSFER_FAILED", message, [
    { path: "remote", message: getErrorMessage(error) },
  ]);
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function toIsoDate(value: number | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  return new Date(value).toISOString();
}
