import path from "node:path/posix";
import { Writable } from "node:stream";
import { Readable } from "node:stream";
import { Client } from "basic-ftp";
import type { ResolvedConnectionConfig } from "../config/schema.js";
import { SpushError } from "../errors.js";
import type { PublishTransport, RemoteEntry } from "./types.js";

type FtpConnectionConfig = Extract<ResolvedConnectionConfig, { protocol: "ftp" | "ftps" }>;

export class FtpTransport implements PublishTransport {
  private readonly client = new Client();

  constructor(private readonly config: FtpConnectionConfig) {}

  async connect(): Promise<void> {
    try {
      await this.client.access({
        host: this.config.host,
        port: this.config.port,
        user: this.config.user,
        password: this.config.password,
        secure: this.config.protocol === "ftps",
        secureOptions:
          this.config.protocol === "ftps"
            ? { rejectUnauthorized: this.config.rejectUnauthorized }
            : undefined,
      });
    } catch (error) {
      throw new SpushError("CONNECT_FAILED", "FTP connection failed", [
        { path: "connection", message: getErrorMessage(error) },
      ]);
    }
  }

  async upload(localPath: string, remotePath: string): Promise<void> {
    try {
      await this.client.uploadFrom(localPath, remotePath);
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
      await this.client.downloadTo(localPath, remotePath);
    } catch (error) {
      throw transferError(`Download failed: ${remotePath}`, error);
    }
  }

  async downloadToString(remotePath: string): Promise<string | null> {
    const chunks: Buffer[] = [];
    const sink = new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(Buffer.from(chunk));
        callback();
      },
    });

    try {
      await this.client.downloadTo(sink, remotePath);
      return Buffer.concat(chunks).toString("utf8");
    } catch {
      return null;
    }
  }

  async uploadFromString(remotePath: string, content: string): Promise<void> {
    try {
      await this.client.uploadFrom(Readable.from([content]), remotePath);
    } catch (error) {
      throw transferError(`Upload failed: ${remotePath}`, error);
    }
  }

  async remove(remotePath: string): Promise<void> {
    try {
      await this.client.remove(remotePath);
    } catch (error) {
      throw transferError(`Delete failed: ${remotePath}`, error);
    }
  }

  async ensureDir(remotePath: string): Promise<void> {
    let previousDirectory: string | null = null;

    try {
      previousDirectory = await this.client.pwd();
      await this.client.ensureDir(remotePath);
    } catch (error) {
      throw transferError(`Ensure directory failed: ${remotePath}`, error);
    } finally {
      if (previousDirectory) {
        await this.restoreDirectory(previousDirectory);
      }
    }
  }

  async directoryExists(remotePath: string): Promise<boolean> {
    let previousDirectory: string | null = null;

    try {
      previousDirectory = await this.client.pwd();
      await this.client.cd(remotePath);
      return true;
    } catch {
      return false;
    } finally {
      if (previousDirectory) {
        await this.restoreDirectory(previousDirectory);
      }
    }
  }

  async close(): Promise<void> {
    this.client.close();
  }

  private async restoreDirectory(remotePath: string): Promise<void> {
    try {
      await this.client.cd(remotePath);
    } catch {
      // Avoid masking the operation result with a secondary cwd cleanup failure.
    }
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
      if (item.isDirectory) {
        entries.push({
          path: relativePath,
          type: "directory",
          size: item.size,
          modifiedAt: item.modifiedAt?.toISOString(),
        });
        entries.push(...(await this.listDirectory(remoteDir, relativePath)));
        continue;
      }

      if (item.isFile) {
        entries.push({
          path: relativePath,
          type: "file",
          size: item.size,
          modifiedAt: item.modifiedAt?.toISOString(),
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
