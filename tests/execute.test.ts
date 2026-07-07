import { describe, expect, it } from "vitest";
import { executeDeployPlan, uploadManifest } from "../src/deploy/execute.js";
import type { DeployPlan } from "../src/deploy/types.js";
import type { PublishTransport, RemoteEntry } from "../src/transports/types.js";

describe("executeDeployPlan", () => {
  it("does not try to create the remote root directory", async () => {
    const transport = new FakeTransport();
    const plan: DeployPlan = {
      uploads: [
        {
          local: {
            path: "index.html",
            absolutePath: "/tmp/index.html",
            sha256: "a",
            size: 10,
          },
          remotePath: "/index.html",
        },
        {
          local: {
            path: "assets/app.js",
            absolutePath: "/tmp/assets/app.js",
            sha256: "b",
            size: 20,
          },
          remotePath: "/assets/app.js",
        },
      ],
      skips: [],
      deletes: [],
      bytes: 30,
    };

    await executeDeployPlan(plan, transport);

    expect(transport.ensured).toEqual(["/assets"]);
    expect(transport.uploaded).toEqual(["/index.html", "/assets/app.js"]);
  });
});

describe("uploadManifest", () => {
  it("ensures the manifest directory under root, not root itself", async () => {
    const transport = new FakeTransport();

    await uploadManifest(transport, "/", ".spush/manifest.json", "{}");

    expect(transport.ensured).toEqual(["/.spush"]);
    expect(transport.uploadedStrings).toEqual(["/.spush/manifest.json"]);
  });
});

class FakeTransport implements PublishTransport {
  readonly ensured: string[] = [];
  readonly uploaded: string[] = [];
  readonly uploadedStrings: string[] = [];

  async connect(): Promise<void> {}

  async upload(_localPath: string, remotePath: string): Promise<void> {
    this.uploaded.push(remotePath);
  }

  async list(_remoteDir: string): Promise<RemoteEntry[]> {
    return [];
  }

  async download(_remotePath: string, _localPath: string): Promise<void> {}

  async downloadToString(_remotePath: string): Promise<string | null> {
    return null;
  }

  async uploadFromString(remotePath: string, _content: string): Promise<void> {
    this.uploadedStrings.push(remotePath);
  }

  async remove(_remotePath: string): Promise<void> {}

  async ensureDir(remotePath: string): Promise<void> {
    this.ensured.push(remotePath);
  }

  async directoryExists(_remotePath: string): Promise<boolean> {
    return true;
  }

  async close(): Promise<void> {}
}
