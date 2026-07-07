import path from "node:path";
import posixPath from "node:path/posix";
import { SpushError } from "../errors.js";

export function ensureManifestIsReserved(localPaths: string[], manifestPath: string): void {
  const normalizedManifestPath = manifestPath.replace(/^\.\//, "");
  if (localPaths.includes(normalizedManifestPath)) {
    throw new SpushError("CONFIG_INVALID", "Source includes the internal spush manifest path", [
      {
        path: "exclude",
        message: `Exclude ${posixPath.dirname(normalizedManifestPath)}/** from transfers`,
      },
    ]);
  }
}

export function ensureConfigIsReserved(
  localPaths: string[],
  source: string,
  configPath: string,
): void {
  const relativeConfigPath = toPosixRelativePath(source, configPath);
  if (!relativeConfigPath || !localPaths.includes(relativeConfigPath)) {
    return;
  }

  throw new SpushError("CONFIG_INVALID", "Source includes the spush config file", [
    {
      path: "exclude",
      message: `Exclude ${relativeConfigPath} from transfers`,
    },
  ]);
}

function toPosixRelativePath(source: string, filePath: string): string | null {
  const relativePath = path.relative(source, filePath);
  if (!relativePath || relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return null;
  }

  return relativePath.split(path.sep).join("/");
}
