import { createHash } from "node:crypto";
import type { Stats } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { glob } from "tinyglobby";
import { SpushError } from "../errors.js";
import type { LocalFile } from "./types.js";

export type ScanOptions = {
  source: string;
  include: string[];
  exclude: string[];
};

export async function scanLocalFiles(options: ScanOptions): Promise<LocalFile[]> {
  let sourceStat: Stats;
  try {
    sourceStat = await fs.stat(options.source);
  } catch (error) {
    throw new SpushError("CONFIG_INVALID", `Source directory not found: ${options.source}`, [
      { path: "source", message: error instanceof Error ? error.message : String(error) },
    ]);
  }

  if (!sourceStat.isDirectory()) {
    throw new SpushError("CONFIG_INVALID", `Source is not a directory: ${options.source}`, [
      { path: "source", message: options.source },
    ]);
  }

  const entries = await glob(options.include, {
    cwd: options.source,
    ignore: options.exclude,
    onlyFiles: true,
    dot: true,
    absolute: false,
  });

  const files = await Promise.all(
    entries.sort().map(async (entry) => {
      const absolutePath = path.join(options.source, entry);
      const buffer = await fs.readFile(absolutePath);
      return {
        path: toPosixPath(entry),
        absolutePath,
        sha256: createHash("sha256").update(buffer).digest("hex"),
        size: buffer.byteLength,
      };
    }),
  );

  return files;
}

function toPosixPath(value: string): string {
  return value.split(path.sep).join("/");
}
