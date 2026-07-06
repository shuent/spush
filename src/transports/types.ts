export type PublishTransport = {
  connect(): Promise<void>;
  upload(localPath: string, remotePath: string): Promise<void>;
  downloadToString(remotePath: string): Promise<string | null>;
  uploadFromString(remotePath: string, content: string): Promise<void>;
  remove(remotePath: string): Promise<void>;
  ensureDir(remotePath: string): Promise<void>;
  directoryExists(remotePath: string): Promise<boolean>;
  close(): Promise<void>;
};
