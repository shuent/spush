import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runImport } from "../src/commands/import.js";
import type { PublishTransport, RemoteEntry } from "../src/transports/types.js";

const originalExitCode = process.exitCode;

afterEach(() => {
  process.exitCode = originalExitCode;
});

describe("runImport", () => {
  it("downloads filtered remote files and writes the remote manifest baseline", async () => {
    const dir = await tempDir();
    const configPath = await writeConfig(dir, {
      source: "site",
      exclude: [".DS_Store", ".spush/**", ".git/**", "wp-content/cache/**"],
    });
    await fs.mkdir(path.join(dir, "site"));
    await fs.writeFile(path.join(dir, "site/local-only.php"), "<?php echo 'local';");
    const transport = new FakeTransport({
      "/www/index.php": "<?php echo 'hello';",
      "/www/wp-content/themes/acme/functions.php": "<?php function acme() {}",
      "/www/wp-content/cache/page.html": "<html>cache</html>",
      "/www/.spush/manifest.json": "{}",
    });

    const output = await captureStdout(() =>
      runImport(
        { config: configPath, json: true, writeManifest: true },
        {
          createTransport: () => transport,
          now: () => new Date("2026-01-01T00:00:00.000Z"),
        },
      ),
    );

    expect(JSON.parse(output)).toMatchObject({
      ok: true,
      command: "import",
      downloaded: 2,
      skipped: 2,
      remoteDir: "/www",
      manifestWritten: true,
    });
    await expect(fs.readFile(path.join(dir, "site/index.php"), "utf8")).resolves.toContain("hello");
    await expect(
      fs.access(path.join(dir, "site/wp-content/cache/page.html")),
    ).rejects.toMatchObject({ code: "ENOENT" });

    const manifest = JSON.parse(transport.uploadedStrings.get("/www/.spush/manifest.json") ?? "");
    expect(manifest).toMatchObject({
      version: 1,
      generatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(manifest.files.map((file: { path: string }) => file.path)).toEqual([
      "index.php",
      "wp-content/themes/acme/functions.php",
    ]);
    await expect(fs.readFile(path.join(dir, "site/local-only.php"), "utf8")).resolves.toContain(
      "local",
    );
  });

  it("refuses to overwrite existing local files without --force", async () => {
    const dir = await tempDir();
    const configPath = await writeConfig(dir, { source: "site" });
    await fs.mkdir(path.join(dir, "site"));
    await fs.writeFile(path.join(dir, "site/index.php"), "local");
    const transport = new FakeTransport({ "/www/index.php": "remote" });

    const stderr = await captureStderr(() =>
      runImport({ config: configPath, json: true }, { createTransport: () => transport }),
    );

    expect(process.exitCode).toBe(4);
    expect(JSON.parse(stderr)).toMatchObject({
      ok: false,
      code: "TRANSFER_FAILED",
      message: "Import would overwrite local files",
    });
    await expect(fs.readFile(path.join(dir, "site/index.php"), "utf8")).resolves.toBe("local");
  });

  it("dry-runs without downloading files or writing the manifest", async () => {
    const dir = await tempDir();
    const configPath = await writeConfig(dir, { source: "site" });
    const transport = new FakeTransport({ "/www/index.php": "remote" });

    const output = await captureStdout(() =>
      runImport(
        { config: configPath, dryRun: true, json: true, writeManifest: true },
        { createTransport: () => transport },
      ),
    );

    expect(JSON.parse(output)).toMatchObject({
      ok: true,
      command: "import",
      dryRun: true,
      downloaded: 1,
      manifestWritten: false,
    });
    expect(transport.downloaded).toEqual([]);
    expect(transport.uploadedStrings.size).toBe(0);
  });

  it("does not import over the active spush config file", async () => {
    const dir = await tempDir();
    const configPath = await writeConfig(dir, { source: "." });
    const transport = new FakeTransport({ "/www/spush.yaml": "remote config" });

    const stderr = await captureStderr(() =>
      runImport(
        { config: configPath, force: true, json: true },
        { createTransport: () => transport },
      ),
    );

    expect(process.exitCode).toBe(2);
    expect(JSON.parse(stderr)).toMatchObject({
      ok: false,
      code: "CONFIG_INVALID",
      message: "Source includes the spush config file",
    });
    expect(transport.downloaded).toEqual([]);
  });
});

class FakeTransport implements PublishTransport {
  readonly uploadedStrings = new Map<string, string>();
  readonly downloaded: string[] = [];

  constructor(private readonly files: Record<string, string>) {}

  async connect(): Promise<void> {}

  async list(remoteDir: string): Promise<RemoteEntry[]> {
    return Object.keys(this.files)
      .filter((remotePath) => remotePath.startsWith(`${remoteDir}/`))
      .map((remotePath) => ({
        path: remotePath.slice(remoteDir.length + 1),
        type: "file" as const,
        size: Buffer.byteLength(this.files[remotePath]),
      }));
  }

  async download(remotePath: string, localPath: string): Promise<void> {
    const content = this.files[remotePath];
    if (content === undefined) {
      throw new Error(`Missing remote file: ${remotePath}`);
    }

    this.downloaded.push(remotePath);
    await fs.writeFile(localPath, content);
  }

  async upload(_localPath: string, _remotePath: string): Promise<void> {}

  async downloadToString(_remotePath: string): Promise<string | null> {
    return null;
  }

  async uploadFromString(remotePath: string, content: string): Promise<void> {
    this.uploadedStrings.set(remotePath, content);
  }

  async remove(_remotePath: string): Promise<void> {}

  async ensureDir(_remotePath: string): Promise<void> {}

  async directoryExists(_remotePath: string): Promise<boolean> {
    return true;
  }

  async close(): Promise<void> {}
}

async function writeConfig(
  dir: string,
  options: { source: string; exclude?: string[] },
): Promise<string> {
  const configPath = path.join(dir, "spush.yaml");
  await fs.writeFile(
    configPath,
    `
source: ${options.source}
include: ["**/*"]
exclude: ${JSON.stringify(options.exclude ?? [".DS_Store", ".spush/**"])}
connection:
  protocol: sftp
  host: example.com
  user: user
  password: { value: secret }
remote_dir: /www
`,
  );

  return configPath;
}

async function captureStdout(fn: () => Promise<void>): Promise<string> {
  const originalWrite = process.stdout.write;
  let output = "";
  process.stdout.write = ((chunk: string | Uint8Array) => {
    output += chunk.toString();
    return true;
  }) as typeof process.stdout.write;

  try {
    await fn();
  } finally {
    process.stdout.write = originalWrite;
  }

  return output.trim();
}

async function captureStderr(fn: () => Promise<void>): Promise<string> {
  const originalWrite = process.stderr.write;
  let output = "";
  process.stderr.write = ((chunk: string | Uint8Array) => {
    output += chunk.toString();
    return true;
  }) as typeof process.stderr.write;

  try {
    await fn();
  } finally {
    process.stderr.write = originalWrite;
  }

  return output.trim();
}

async function tempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "spush-import-"));
}
