import type { NormalizedConfig } from "../config/schema.js";
import { FtpTransport } from "./ftp.js";
import { SftpTransport } from "./sftp.js";
import type { PublishTransport } from "./types.js";

export function createTransport(config: NormalizedConfig): PublishTransport {
  if (config.connection.protocol === "ftp" || config.connection.protocol === "ftps") {
    return new FtpTransport(config.connection);
  }

  return new SftpTransport(config.connection);
}
