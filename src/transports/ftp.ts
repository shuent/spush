import { Writable } from "node:stream";
import { Readable } from "node:stream";
import { Client } from "basic-ftp";
import type { ResolvedConnectionConfig } from "../config/schema.js";
import { SpushError } from "../errors.js";
import type { PublishTransport } from "./types.js";

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
    try {
      await this.client.ensureDir(remotePath);
    } catch (error) {
      throw transferError(`Ensure directory failed: ${remotePath}`, error);
    }
  }

  async directoryExists(remotePath: string): Promise<boolean> {
    try {
      await this.client.cd(remotePath);
      return true;
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    this.client.close();
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
