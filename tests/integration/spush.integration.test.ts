import fs from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type IntegrationTarget,
  createProject,
  ensureRemoteDir,
  integrationTargets,
  runCheckJson,
  runPushJson,
  startIntegrationServices,
  stopIntegrationServices,
  waitForTarget,
} from "./docker.js";

beforeAll(async () => {
  await startIntegrationServices();
  for (const target of integrationTargets) {
    await waitForTarget(target);
  }
});

afterAll(async () => {
  await stopIntegrationServices();
});

describe.each(integrationTargets)("$name transport", (target: IntegrationTarget) => {
  it("checks a real connection and existing remote directory", async () => {
    const project = await createProject(target, {
      "index.html": "<h1>Hello</h1>",
    });
    await ensureRemoteDir(project.configPath);

    const result = await runCheckJson(project.configPath);

    expect(result).toMatchObject({
      ok: true,
      command: "check",
      remoteDir: project.remoteDir,
    });
  });

  it("uploads all files first, then skips unchanged files using the remote manifest", async () => {
    const project = await createProject(target, {
      "index.html": "<h1>Hello</h1>",
      "assets/app.js": "console.log('hello');",
    });

    const first = await runPushJson(project.configPath);
    expect(first).toMatchObject({
      ok: true,
      command: "push",
      uploaded: 2,
      skipped: 0,
      deleted: 0,
      remoteDir: project.remoteDir,
    });

    const second = await runPushJson(project.configPath);
    expect(second).toMatchObject({
      ok: true,
      command: "push",
      uploaded: 0,
      skipped: 2,
      deleted: 0,
      remoteDir: project.remoteDir,
    });
  });

  it("uploads only a changed file", async () => {
    const project = await createProject(target, {
      "index.html": "<h1>Hello</h1>",
      "assets/app.js": "console.log('hello');",
    });

    await runPushJson(project.configPath);
    await fs.writeFile(path.join(project.distDir, "assets/app.js"), "console.log('changed');");

    const changed = await runPushJson(project.configPath);

    expect(changed).toMatchObject({
      ok: true,
      command: "push",
      uploaded: 1,
      skipped: 1,
      deleted: 0,
      remoteDir: project.remoteDir,
    });
  });

  it("deletes only missing files tracked by the remote manifest", async () => {
    const project = await createProject(target, {
      "index.html": "<h1>Hello</h1>",
      "assets/app.js": "console.log('hello');",
    });

    await runPushJson(project.configPath);
    await fs.unlink(path.join(project.distDir, "assets/app.js"));

    const deleted = await runPushJson(project.configPath, { delete: true });
    expect(deleted).toMatchObject({
      ok: true,
      command: "push",
      uploaded: 0,
      skipped: 1,
      deleted: 1,
      remoteDir: project.remoteDir,
    });

    const next = await runPushJson(project.configPath);
    expect(next).toMatchObject({
      ok: true,
      command: "push",
      uploaded: 0,
      skipped: 1,
      deleted: 0,
      remoteDir: project.remoteDir,
    });
  });

  it("creates deeply nested remote directories", async () => {
    const project = await createProject(target, {
      "assets/js/chunks/app.js": "console.log('nested');",
    });

    const result = await runPushJson(project.configPath);

    expect(result).toMatchObject({
      ok: true,
      command: "push",
      uploaded: 1,
      skipped: 0,
      deleted: 0,
      remoteDir: project.remoteDir,
    });
  });
});
