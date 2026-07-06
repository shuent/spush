import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runPush } from "../src/commands/push.js";

const originalEnv = { ...process.env };
const originalExitCode = process.exitCode;

afterEach(() => {
  process.env = { ...originalEnv };
  process.exitCode = originalExitCode;
});

describe("runPush", () => {
  it("prints dry-run JSON without creating a transport", async () => {
    process.env.SPUSH_PASSWORD = "secret";
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "spush-push-"));
    await fs.mkdir(path.join(dir, "dist"));
    await fs.writeFile(path.join(dir, "dist/index.html"), "<h1>Hello</h1>");
    await fs.writeFile(
      path.join(dir, "spush.yaml"),
      `
source: dist
connection:
  protocol: ftp
  host: ftp.example.com
  user: user
  password: { env: SPUSH_PASSWORD }
remote_dir: /www
`,
    );

    const output = await captureStdout(() =>
      runPush(
        { config: path.join(dir, "spush.yaml"), dryRun: true, json: true },
        {
          createTransport: () => {
            throw new Error("transport should not be created");
          },
        },
      ),
    );

    expect(JSON.parse(output)).toMatchObject({
      ok: true,
      command: "push",
      dryRun: true,
      uploaded: 1,
      skipped: 0,
      deleted: 0,
      remoteDir: "/www",
    });
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
