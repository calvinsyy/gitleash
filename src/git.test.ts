import { describe, it, expect, beforeEach } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execa } from "execa";
import { getDiffContext } from "./git.js";
import { DEFAULT_CONFIG } from "./config.js";

async function initRepo() {
  const root = await mkdtemp(join(tmpdir(), "gitleash-"));
  const git = (args: string[]) => execa("git", args, { cwd: root });
  await git(["init", "-q"]);
  await git(["config", "user.email", "t@t"]);
  await git(["config", "user.name", "t"]);
  await git(["checkout", "-q", "-b", "main"]);
  return { root, git };
}

describe("getDiffContext", () => {
  let root: string;
  let git: (args: string[]) => Promise<unknown>;
  beforeEach(async () => {
    ({ root, git } = await initRepo());
  });

  it("reports staged additions, files, and branch", async () => {
    await writeFile(join(root, "a.txt"), "one\ntwo\nthree\n");
    await git(["add", "-A"]);
    const ctx = await getDiffContext(root, DEFAULT_CONFIG);
    expect(ctx.branch).toBe("main");
    expect(ctx.files.map((f) => f.path)).toContain("a.txt");
    expect(ctx.additions).toBe(3);
    const a = ctx.files.find((f) => f.path === "a.txt")!;
    expect(a.status).toBe("A");
    expect(a.additions).toBe(3);
  });

  it("captures deletions with status D", async () => {
    await writeFile(join(root, "b.txt"), "x\ny\n");
    await git(["add", "-A"]);
    await git(["commit", "-q", "-m", "init"]);
    await rm(join(root, "b.txt"));
    await git(["add", "-A"]);
    const ctx = await getDiffContext(root, DEFAULT_CONFIG);
    const b = ctx.files.find((f) => f.path === "b.txt")!;
    expect(b.status).toBe("D");
    expect(ctx.deletions).toBeGreaterThanOrEqual(2);
  });

  it("includes the patch text for content scanning", async () => {
    await writeFile(join(root, "c.txt"), "hello secret\n");
    await git(["add", "-A"]);
    const ctx = await getDiffContext(root, DEFAULT_CONFIG);
    expect(ctx.patch).toContain("hello secret");
  });
});
