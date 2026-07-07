#!/usr/bin/env node
import { Command } from "commander";
import { runCheck } from "./commands/check.js";
import { runImport } from "./commands/import.js";
import { runInit } from "./commands/init.js";
import { runPush } from "./commands/push.js";
import { runSkill } from "./commands/skill.js";

const program = new Command();

program
  .name("spush")
  .description("Publish static web projects over FTP, FTPS, or SFTP.")
  .version("0.1.0");

program
  .command("skill")
  .description("Print the AI agent usage guide for spush.")
  .action(() => {
    runSkill();
  });

program
  .command("init")
  .description("Create a spush.yaml config file.")
  .option("-c, --config <path>", "config path", "spush.yaml")
  .option("--provider <name>", "provider preset: sakura, xserver, lolipop")
  .option("--template <name>", "project template: static, php, wordpress, wordpress-import")
  .option("--preset <name>", "alias for --template")
  .option("--force", "overwrite an existing config")
  .option("--json", "write machine-readable output")
  .action(async (options) => {
    await runInit(options);
  });

program
  .command("check")
  .description("Validate config and test the remote connection.")
  .option("-c, --config <path>", "config path", "spush.yaml")
  .option("--env-file <path>", "explicit env file for secrets")
  .option("--json", "write machine-readable output")
  .option("--verbose", "write verbose output")
  .action(async (options) => {
    await runCheck(options);
  });

program
  .command("push")
  .description("Upload changed files to the configured remote directory.")
  .option("-c, --config <path>", "config path", "spush.yaml")
  .option("--env-file <path>", "explicit env file for secrets")
  .option("--dry-run", "show the upload plan without connecting")
  .option("--delete", "delete manifest-tracked remote files missing locally")
  .option("--force", "upload all local files even when manifest hashes match")
  .option("--verify [url]", "verify HTTP 200 for config url or explicit URL")
  .option("--json", "write machine-readable output")
  .option("--verbose", "write verbose output")
  .action(async (options) => {
    await runPush(options);
  });

program
  .command("import")
  .alias("pull")
  .description("Download remote files into the configured source directory.")
  .option("-c, --config <path>", "config path", "spush.yaml")
  .option("--env-file <path>", "explicit env file for secrets")
  .option("--dry-run", "show the import plan without downloading files")
  .option("--force", "overwrite existing local files")
  .option("--write-manifest", "write the imported baseline to the remote manifest")
  .option("--json", "write machine-readable output")
  .option("--verbose", "write verbose output")
  .action(async (options) => {
    await runImport(options);
  });

program.showHelpAfterError();
program.showSuggestionAfterError();

await program.parseAsync(process.argv);
