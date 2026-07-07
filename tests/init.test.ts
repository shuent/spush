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
    const envExample = await fs.readFile(path.join(dir, ".env.spush.example"), "utf8");
    expect(config).toContain("source: .");
    expect(config).toContain('"node_modules/**"');
    expect(config).toContain("host: { env: SFTP_HOST }");
    expect(config).toContain("user: { env: SFTP_USER }");
    expect(config).toContain("password: { env: SFTP_PASSWORD }");
    expect(config).toContain("# env_file: .env.spush");
    expect(config).toContain("remote_dir: /home/account/example.com/public_html");
    expect(envExample).toContain("# SFTP connection");
    expect(envExample).toContain("SFTP_HOST=sv0000.xserver.jp");
    expect(envExample).toContain("SFTP_USER=your-user");
    expect(envExample).toContain("SFTP_PASSWORD=");
    expect(envExample).not.toMatch(/^FTP_HOST=/m);
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

  it("writes an FTP-only env example for FTP provider presets", async () => {
    const dir = await tempDir();
    const configPath = path.join(dir, "spush.yaml");

    await captureStdout(() =>
      runInit({ config: configPath, provider: "lolipop", template: "static", json: true }),
    );

    const config = await fs.readFile(configPath, "utf8");
    const envExample = await fs.readFile(path.join(dir, ".env.spush.example"), "utf8");
    expect(config).toContain("protocol: ftp");
    expect(config).toContain('".env.*"');
    expect(config).toContain("host: { env: FTP_HOST }");
    expect(config).toContain("user: { env: FTP_USER }");
    expect(config).toContain("password: { env: FTP_PASSWORD }");
    expect(envExample).toContain("# FTP/FTPS connection");
    expect(envExample).toContain("FTP_HOST=ftp.lolipop.jp");
    expect(envExample).toContain("FTP_USER=your-user");
    expect(envExample).toContain("FTP_PASSWORD=");
    expect(envExample).not.toMatch(/^SFTP_HOST=/m);
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
