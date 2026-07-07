import { describe, expect, it } from "vitest";
import { runSkill, skillGuide } from "../src/commands/skill.js";

describe("runSkill", () => {
  it("prints the AI agent guide", () => {
    const output = captureStdout(() => runSkill());

    expect(output).toBe(`${skillGuide.trimEnd()}\n`);
    expect(output).toContain("spush push --dry-run --json");
    expect(output).toContain(".env.spush.example");
    expect(output).toContain("FTP_HOST");
    expect(output).toContain("SFTP_HOST");
    expect(output).toContain("remote_dir: /");
    expect(output).toContain("Do not hard-code secrets");
  });
});

function captureStdout(fn: () => void): string {
  const originalWrite = process.stdout.write;
  let output = "";
  process.stdout.write = ((chunk: string | Uint8Array) => {
    output += chunk.toString();
    return true;
  }) as typeof process.stdout.write;

  try {
    fn();
  } finally {
    process.stdout.write = originalWrite;
  }

  return output;
}
