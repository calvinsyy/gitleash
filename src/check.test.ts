import { describe, it, expect, beforeEach } from "vitest";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execa } from "execa";
import { runCheck } from "./check.js";

async function initRepo() {
  const root = await mkdtemp(join(tmpdir(), "gitleash-c-"));
  const git = (args: string[]) => execa("git", args, { cwd: root });
  await git(["init", "-q"]);
  await git(["config", "user.email", "t@t"]);
  await git(["config", "user.name", "t"]);
  await git(["checkout", "-q", "-b", "feature"]);
  return { root, git };
}

describe("runCheck", () => {
  let root: string;
  let git: (args: string[]) => Promise<unknown>;
  beforeEach(async () => {
    ({ root, git } = await initRepo());
  });

  it("blocks a staged commit that deletes a test file", async () => {
    await writeFile(join(root, "a.test.ts"), "test('x', () => {});\n");
    await git(["add", "-A"]);
    await git(["commit", "-q", "-m", "add test"]);
    await execa("rm", [join(root, "a.test.ts")]);
    await git(["add", "-A"]);
    const { findings, blocked } = await runCheck(root);
    expect(blocked).toBe(true);
    expect(findings.some((f) => f.rule === "protect-tests")).toBe(true);
  });

  it("passes a small, safe staged commit", async () => {
    await writeFile(join(root, "readme.md"), "# hi\n");
    await git(["add", "-A"]);
    const { blocked } = await runCheck(root);
    expect(blocked).toBe(false);
  });

  it("honors a raised threshold from .gitleash.json", async () => {
    await writeFile(join(root, ".gitleash.json"), JSON.stringify({ maxLines: 100000 }));
    const big = Array.from({ length: 900 }, (_, i) => `line ${i}`).join("\n");
    await writeFile(join(root, "big.txt"), big);
    await git(["add", "-A"]);
    const { blocked } = await runCheck(root);
    expect(blocked).toBe(false);
  });
});
