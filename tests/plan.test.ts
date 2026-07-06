import { describe, expect, it } from "vitest";
import { createDeployPlan, joinRemotePath } from "../src/deploy/plan.js";
import type { LocalFile, Manifest } from "../src/deploy/types.js";

describe("createDeployPlan", () => {
  it("uploads all files on first push", () => {
    const plan = createDeployPlan({
      localFiles: [file("index.html", "a", 10), file("assets/app.js", "b", 20)],
      manifest: null,
      remoteDir: "/www",
      deleteMissing: false,
    });

    expect(plan.uploads.map((item) => item.remotePath)).toEqual([
      "/www/index.html",
      "/www/assets/app.js",
    ]);
    expect(plan.skips).toEqual([]);
    expect(plan.deletes).toEqual([]);
    expect(plan.bytes).toBe(30);
  });

  it("skips matching hashes and uploads changed files", () => {
    const plan = createDeployPlan({
      localFiles: [file("index.html", "new", 10), file("same.css", "same", 5)],
      manifest: manifest([
        { path: "index.html", sha256: "old", size: 10 },
        { path: "same.css", sha256: "same", size: 5 },
      ]),
      remoteDir: "/www",
      deleteMissing: false,
    });

    expect(plan.uploads.map((item) => item.local.path)).toEqual(["index.html"]);
    expect(plan.skips.map((item) => item.path)).toEqual(["same.css"]);
  });

  it("only deletes manifest-tracked missing files when deleteMissing is enabled", () => {
    const previous = manifest([
      { path: "index.html", sha256: "same", size: 10 },
      { path: "old.html", sha256: "old", size: 3 },
    ]);

    expect(
      createDeployPlan({
        localFiles: [file("index.html", "same", 10)],
        manifest: previous,
        remoteDir: "/www",
        deleteMissing: false,
      }).deletes,
    ).toEqual([]);

    expect(
      createDeployPlan({
        localFiles: [file("index.html", "same", 10)],
        manifest: previous,
        remoteDir: "/www",
        deleteMissing: true,
      }).deletes,
    ).toEqual([{ path: "old.html", remotePath: "/www/old.html" }]);
  });
});

describe("joinRemotePath", () => {
  it("preserves absolute remote roots", () => {
    expect(joinRemotePath("/home/user/www", "assets/app.js")).toBe("/home/user/www/assets/app.js");
  });
});

function file(filePath: string, sha256: string, size: number): LocalFile {
  return {
    path: filePath,
    absolutePath: `/tmp/${filePath}`,
    sha256,
    size,
  };
}

function manifest(files: Manifest["files"]): Manifest {
  return {
    version: 1,
    generatedAt: "2026-01-01T00:00:00.000Z",
    files,
  };
}
