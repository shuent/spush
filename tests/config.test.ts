import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig, normalizeRemotePath } from "../src/config/load.js";
import { SpushError } from "../src/errors.js";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("loadConfig", () => {
  it("loads ftp config, resolves env secrets, and applies default port", async () => {
    process.env.SPUSH_PASSWORD = "secret";
    const dir = await tempDir();
    await fs.mkdir(path.join(dir, "dist"));
    await fs.writeFile(
      path.join(dir, "spush.yaml"),
      `
source: dist
connection:
  protocol: ftp
  host: ftp.example.com
  user: user
  password: { env: SPUSH_PASSWORD }
remote_dir: /home/user/www
`,
    );

    const config = await loadConfig({ cwd: dir });

    expect(config.source).toBe(path.join(dir, "dist"));
    expect(config.connection).toMatchObject({
      protocol: "ftp",
      host: "ftp.example.com",
      port: 21,
      user: "user",
      password: "secret",
    });
    expect(config.remoteDir).toBe("/home/user/www");
    expect(config.exclude).toContain(".spush/**");
  });

  it("rejects missing secret env vars without leaking values", async () => {
    process.env.SPUSH_PASSWORD = undefined;
    const dir = await tempDir();
    await fs.writeFile(
      path.join(dir, "spush.yaml"),
      `
source: dist
connection:
  protocol: ftps
  host: ftp.example.com
  user: user
  password: { env: SPUSH_PASSWORD }
remote_dir: /www
`,
    );

    await expect(loadConfig({ cwd: dir })).rejects.toMatchObject({
      code: "SECRET_ENV_MISSING",
      exitCode: 2,
    });
  });

  it("requires sftp password or private key", async () => {
    const dir = await tempDir();
    await fs.writeFile(
      path.join(dir, "spush.yaml"),
      `
source: dist
connection:
  protocol: sftp
  host: ssh.example.com
  user: user
remote_dir: /www
`,
    );

    await expect(loadConfig({ cwd: dir })).rejects.toMatchObject({
      code: "CONFIG_INVALID",
      issues: [{ path: "connection.password" }],
    });
  });

  it("resolves private key paths relative to the config file", async () => {
    const dir = await tempDir();
    await fs.writeFile(
      path.join(dir, "spush.yaml"),
      `
source: dist
connection:
  protocol: sftp
  host: ssh.example.com
  user: user
  private_key: { path: keys/id_ed25519 }
remote_dir: /www
`,
    );

    const config = await loadConfig({ cwd: dir });

    expect(config.connection).toMatchObject({
      protocol: "sftp",
      privateKeyPath: path.join(dir, "keys/id_ed25519"),
    });
  });

  it("expands private key paths under the home directory", async () => {
    const dir = await tempDir();
    await fs.writeFile(
      path.join(dir, "spush.yaml"),
      `
source: dist
connection:
  protocol: sftp
  host: ssh.example.com
  user: user
  private_key: { path: ~/.ssh/id_ed25519 }
remote_dir: /www
`,
    );

    const config = await loadConfig({ cwd: dir });

    expect(config.connection).toMatchObject({
      protocol: "sftp",
      privateKeyPath: path.join(os.homedir(), ".ssh/id_ed25519"),
    });
  });
});

describe("normalizeRemotePath", () => {
  it("rejects root and traversal paths", () => {
    expect(() => normalizeRemotePath("/")).toThrow(SpushError);
    expect(() => normalizeRemotePath("../www")).toThrow(SpushError);
    expect(() => normalizeRemotePath("/www/../secret")).toThrow(SpushError);
  });
});

async function tempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "spush-test-"));
}
