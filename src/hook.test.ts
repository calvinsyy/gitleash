import { describe, it, expect, beforeEach } from "vitest";
import { mkdtemp, writeFile, readFile, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { existsSync, statSync } from "node:fs";
import { execa } from "execa";
import { installHook, uninstallHook, isInstalled } from "./hook.js";

async function initRepo() {
  const root = await mkdtemp(join(tmpdir(), "gitleash-h-"));
  await execa("git", ["init", "-q"], { cwd: root });
  return root;
}

describe("hook install/uninstall", () => {
  let root: string;
  beforeEach(async () => {
    root = await initRepo();
  });

  it("installs an executable pre-commit hook that calls gitleash", async () => {
    const { path, appended } = await installHook(root);
    expect(appended).toBe(false);
    expect(existsSync(path)).toBe(true);
    const body = await readFile(path, "utf8");
    expect(body).toContain("gitleash check");
    expect(statSync(path).mode & 0o100).toBeTruthy(); // owner-executable
    expect(await isInstalled(root)).toBe(true);
  });

  it("is idempotent — re-installing does not duplicate the block", async () => {
    await installHook(root);
    await installHook(root);
    const path = join(root, ".git", "hooks", "pre-commit");
    const body = await readFile(path, "utf8");
    expect(body.match(/gitleash-managed/g)?.length).toBe(1);
  });

  it("coexists with an existing hook by appending", async () => {
    const path = join(root, ".git", "hooks", "pre-commit");
    await writeFile(path, "#!/bin/sh\necho existing\n");
    await chmod(path, 0o755);
    const { appended } = await installHook(root);
    expect(appended).toBe(true);
    const body = await readFile(path, "utf8");
    expect(body).toContain("echo existing");
    expect(body).toContain("gitleash check");
  });

  it("uninstall removes our block but keeps a foreign hook", async () => {
    const path = join(root, ".git", "hooks", "pre-commit");
    await writeFile(path, "#!/bin/sh\necho existing\n");
    await installHook(root);
    expect(await uninstallHook(root)).toBe(true);
    const body = await readFile(path, "utf8");
    expect(body).toContain("echo existing");
    expect(body).not.toContain("gitleash-managed");
  });

  it("uninstall deletes a hook we fully own", async () => {
    const { path } = await installHook(root);
    expect(await uninstallHook(root)).toBe(true);
    expect(existsSync(path)).toBe(false);
  });
});
