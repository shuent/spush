import { describe, expect, it } from "vitest";
import { createManifest, parseManifest, serializeManifest } from "../src/deploy/manifest.js";

describe("manifest", () => {
  it("treats missing and corrupt manifests as first push", () => {
    expect(parseManifest(null)).toBeNull();
    expect(parseManifest("{bad json")).toBeNull();
    expect(parseManifest(JSON.stringify({ version: 2, files: [] }))).toBeNull();
  });

  it("round-trips local files into sorted manifest JSON", () => {
    const manifest = createManifest(
      [
        { path: "b.txt", absolutePath: "/tmp/b.txt", sha256: "b", size: 2 },
        { path: "a.txt", absolutePath: "/tmp/a.txt", sha256: "a", size: 1 },
      ],
      "2026-01-01T00:00:00.000Z",
    );

    const parsed = parseManifest(serializeManifest(manifest));

    expect(parsed?.files.map((file) => file.path)).toEqual(["a.txt", "b.txt"]);
  });
});
