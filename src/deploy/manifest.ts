import type { LocalFile, Manifest, ManifestFile } from "./types.js";

export const MANIFEST_VERSION = 1;

export function parseManifest(content: string | null): Manifest | null {
  if (!content) {
    return null;
  }

  try {
    const parsed = JSON.parse(content) as Partial<Manifest>;
    if (parsed.version !== MANIFEST_VERSION || !Array.isArray(parsed.files)) {
      return null;
    }

    const files = parsed.files.filter(isManifestFile).sort((a, b) => a.path.localeCompare(b.path));
    return {
      version: MANIFEST_VERSION,
      generatedAt:
        typeof parsed.generatedAt === "string" ? parsed.generatedAt : new Date(0).toISOString(),
      files,
    };
  } catch {
    return null;
  }
}

export function createManifest(
  files: LocalFile[],
  generatedAt = new Date().toISOString(),
): Manifest {
  return {
    version: MANIFEST_VERSION,
    generatedAt,
    files: files.map(toManifestFile).sort((a, b) => a.path.localeCompare(b.path)),
  };
}

export function serializeManifest(manifest: Manifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

function toManifestFile(file: LocalFile): ManifestFile {
  return {
    path: file.path,
    sha256: file.sha256,
    size: file.size,
  };
}

function isManifestFile(value: unknown): value is ManifestFile {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<ManifestFile>;
  return (
    typeof candidate.path === "string" &&
    typeof candidate.sha256 === "string" &&
    typeof candidate.size === "number"
  );
}
