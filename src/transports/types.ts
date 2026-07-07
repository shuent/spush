export type RemoteEntry = {
  path: string;
  type: "file" | "directory";
  size?: number;
  modifiedAt?: string;
};

export type PublishTransport = {
  connect(): Promise<void>;
  list(remoteDir: string): Promise<RemoteEntry[]>;
  download(remotePath: string, localPath: string): Promise<void>;
  upload(localPath: string, remotePath: string): Promise<void>;
  downloadToString(remotePath: string): Promise<string | null>;
  uploadFromString(remotePath: string, content: string): Promise<void>;
  remove(remotePath: string): Promise<void>;
  ensureDir(remotePath: string): Promise<void>;
  directoryExists(remotePath: string): Promise<boolean>;
  close(): Promise<void>;
};
