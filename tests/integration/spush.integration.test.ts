import fs from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type IntegrationTarget,
  createImportProject,
  createProject,
  integrationTargets,
  runCheckJson,
  runImportJson,
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
    await runPushJson(project.configPath);

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

  it("imports a PHP site, writes a baseline manifest, then pushes only local changes", async () => {
    const seed = await createProject(target, {
      "index.php": "<?php echo 'home';",
      "contact.php": "<?php echo 'contact';",
      "assets/main.css": "body { color: #222; }",
    });
    await runPushJson(seed.configPath);

    const imported = await createImportProject(target, seed.remoteDir, {
      source: "site",
      exclude: [".DS_Store", ".spush/**", ".git/**"],
    });

    const dryRun = await runImportJson(imported.configPath, {
      dryRun: true,
      writeManifest: true,
    });
    expect(dryRun).toMatchObject({
      ok: true,
      command: "import",
      dryRun: true,
      downloaded: 3,
      skipped: 1,
      manifestWritten: false,
      remoteDir: seed.remoteDir,
    });

    const result = await runImportJson(imported.configPath, { writeManifest: true });
    expect(result).toMatchObject({
      ok: true,
      command: "import",
      downloaded: 3,
      skipped: 1,
      manifestWritten: true,
      remoteDir: seed.remoteDir,
    });

    await expect(fs.readFile(path.join(imported.sourceDir, "index.php"), "utf8")).resolves.toBe(
      "<?php echo 'home';",
    );
    await fs.writeFile(path.join(imported.sourceDir, "contact.php"), "<?php echo 'changed';");

    const pushed = await runPushJson(imported.configPath);
    expect(pushed).toMatchObject({
      ok: true,
      command: "push",
      uploaded: 1,
      skipped: 2,
      deleted: 0,
      remoteDir: seed.remoteDir,
    });
  });

  it("imports a WordPress tree without cache and baselines the imported files", async () => {
    const seed = await createProject(target, {
      "index.php": "<?php require __DIR__ . '/wp-blog-header.php';",
      "wp-config.php": "<?php define('DB_NAME', 'example');",
      "wp-content/themes/acme/functions.php": "<?php function acme_theme() {}",
      "wp-content/plugins/acme/acme.php": "<?php /* Plugin Name: Acme */",
      "wp-content/uploads/2026/hero.txt": "uploaded media",
      "wp-content/cache/page-cache.html": "<html>cached</html>",
    });
    await runPushJson(seed.configPath);

    const imported = await createImportProject(target, seed.remoteDir, {
      source: "wordpress",
      exclude: [".DS_Store", ".spush/**", ".git/**", "wp-content/cache/**"],
    });

    const result = await runImportJson(imported.configPath, { writeManifest: true });
    expect(result).toMatchObject({
      ok: true,
      command: "import",
      downloaded: 5,
      skipped: 2,
      manifestWritten: true,
      remoteDir: seed.remoteDir,
    });

    await expect(
      fs.readFile(path.join(imported.sourceDir, "wp-content/themes/acme/functions.php"), "utf8"),
    ).resolves.toContain("acme_theme");
    await expect(
      fs.access(path.join(imported.sourceDir, "wp-content/cache/page-cache.html")),
    ).rejects.toMatchObject({ code: "ENOENT" });

    const pushed = await runPushJson(imported.configPath);
    expect(pushed).toMatchObject({
      ok: true,
      command: "push",
      uploaded: 0,
      skipped: 5,
      deleted: 0,
      remoteDir: seed.remoteDir,
    });
  });

  it("force-pushes local WordPress PHP after remote admin-side edits drift from manifest", async () => {
    const seed = await createProject(target, {
      "wp-content/themes/acme/functions.php": "<?php echo 'local theme';",
    });
    await runPushJson(seed.configPath);

    const imported = await createImportProject(target, seed.remoteDir, {
      source: "wordpress",
      exclude: [".DS_Store", ".spush/**", ".git/**", "wp-content/cache/**"],
    });
    await runImportJson(imported.configPath, { writeManifest: true });

    const adminEdit = await createProject(
      target,
      {
        "wp-content/themes/acme/functions.php": "<?php echo 'edited in wp admin';",
      },
      {
        remoteDir: seed.remoteDir,
        manifestPath: ".spush/admin-editor-manifest.json",
      },
    );
    await runPushJson(adminEdit.configPath);

    const normalPush = await runPushJson(imported.configPath);
    expect(normalPush).toMatchObject({
      ok: true,
      command: "push",
      uploaded: 0,
      skipped: 1,
      deleted: 0,
      remoteDir: seed.remoteDir,
    });

    const forcedPush = await runPushJson(imported.configPath, { force: true });
    expect(forcedPush).toMatchObject({
      ok: true,
      command: "push",
      uploaded: 1,
      skipped: 0,
      deleted: 0,
      remoteDir: seed.remoteDir,
    });

    const verifier = await createImportProject(target, seed.remoteDir, {
      source: "verify",
      exclude: [".DS_Store", ".spush/**"],
    });
    await runImportJson(verifier.configPath);
    await expect(
      fs.readFile(path.join(verifier.sourceDir, "wp-content/themes/acme/functions.php"), "utf8"),
    ).resolves.toBe("<?php echo 'local theme';");
  });
});
