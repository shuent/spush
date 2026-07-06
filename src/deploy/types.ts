export type LocalFile = {
  path: string;
  absolutePath: string;
  sha256: string;
  size: number;
};

export type ManifestFile = {
  path: string;
  sha256: string;
  size: number;
};

export type Manifest = {
  version: 1;
  generatedAt: string;
  files: ManifestFile[];
};

export type UploadAction = {
  local: LocalFile;
  remotePath: string;
};

export type DeleteAction = {
  path: string;
  remotePath: string;
};

export type DeployPlan = {
  uploads: UploadAction[];
  skips: ManifestFile[];
  deletes: DeleteAction[];
  bytes: number;
};
