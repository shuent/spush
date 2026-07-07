import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runInit } from "../src/commands/init.js";

const originalExitCode = process.exitCode;

afterEach(() => {
  process.exitCode = originalExitCode;
});

describe("runInit", () => {
  it("writes a PHP template config", async () => {
    const dir = await tempDir();
    const configPath = path.join(dir, "spush.yaml");

    const output = await captureStdout(() =>
      runInit({ config: configPath, provider: "xserver", template: "php", json: true }),
    );

    expect(JSON.parse(output)).toMatchObject({ ok: true, command: "init" });
    const config = await fs.readFile(configPath, "utf8");
    expect(config).toContain("source: .");
    expect(config).toContain('"node_modules/**"');
    expect(config).toContain("remote_dir: /home/account/example.com/public_html");
  });

  it("writes a WordPress manual install template config", async () => {
    const dir = await tempDir();
    const configPath = path.join(dir, "spush.yaml");

    await captureStdout(() =>
      runInit({ config: configPath, provider: "sakura", template: "wordpress", json: true }),
    );

    const config = await fs.readFile(configPath, "utf8");
    expect(config).toContain("source: wordpress");
    expect(config).toContain('"wp-content/cache/**"');
    expect(config).toContain("remote_dir: /home/account/www/wp");
  });

  it("writes a WordPress import template config from the preset alias", async () => {
    const dir = await tempDir();
    const configPath = path.join(dir, "spush.yaml");

    await captureStdout(() =>
      runInit({ config: configPath, provider: "xserver", preset: "wordpress-import", json: true }),
    );

    const config = await fs.readFile(configPath, "utf8");
    expect(config).toContain("source: .");
    expect(config).toContain('"wp-content/cache/**"');
    expect(config).toContain("remote_dir: /home/account/example.com/public_html");
  });
});

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

async function tempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "spush-init-"));
}
