import { execa } from "execa";
import { mkdir, readFile, writeFile, chmod, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { isAbsolute, join } from "node:path";

const MARKER = "# gitleash-managed";

/** The managed shell block that invokes a gitleash subcommand from a hook. */
function hookBlock(subcommand: string): string {
  return `${MARKER}
if command -v gitleash >/dev/null 2>&1; then
  gitleash ${subcommand} || exit 1
elif command -v npx >/dev/null 2>&1; then
  npx --no-install gitleash ${subcommand} || exit 1
fi
`;
}

async function hooksDir(root: string): Promise<string> {
  const { stdout } = await execa("git", ["rev-parse", "--git-path", "hooks"], { cwd: root });
  const p = stdout.trim();
  return isAbsolute(p) ? p : join(root, p);
}

/**
 * Write a managed hook. If a hook already exists, append our block so we
 * coexist (idempotent). Returns the path and whether we appended.
 */
async function writeManagedHook(
  root: string,
  hookName: string,
  subcommand: string,
): Promise<{ path: string; appended: boolean }> {
  const dir = await hooksDir(root);
  await mkdir(dir, { recursive: true });
  const path = join(dir, hookName);
  const block = hookBlock(subcommand);

  if (!existsSync(path)) {
    await writeFile(path, `#!/bin/sh\n${block}`);
    await chmod(path, 0o755);
    return { path, appended: false };
  }
  const current = await readFile(path, "utf8");
  if (current.includes(MARKER)) return { path, appended: true };
  await writeFile(path, current.replace(/\n?$/, "\n") + "\n" + block);
  await chmod(path, 0o755);
  return { path, appended: true };
}

async function removeManagedHook(root: string, hookName: string): Promise<boolean> {
  const path = join(await hooksDir(root), hookName);
  if (!existsSync(path)) return false;
  const current = await readFile(path, "utf8");
  if (!current.includes(MARKER)) return false;

  const before = current.slice(0, current.indexOf(MARKER)).trim();
  if (before === "#!/bin/sh" || before === "") {
    await rm(path); // we owned the whole file
    return true;
  }
  await writeFile(path, current.slice(0, current.indexOf(MARKER)).replace(/\n+$/, "\n"));
  return true;
}

/** Install the pre-commit hook (runs `gitleash check`). */
export function installHook(root: string) {
  return writeManagedHook(root, "pre-commit", "check");
}

/** Install the pre-push hook (runs `gitleash pre-push`). */
export function installPushHook(root: string) {
  return writeManagedHook(root, "pre-push", "pre-push");
}

/** Install both managed hooks. */
export async function installAll(root: string): Promise<string[]> {
  const commit = await installHook(root);
  const push = await installPushHook(root);
  return [commit.path, push.path];
}

export function uninstallHook(root: string) {
  return removeManagedHook(root, "pre-commit");
}

/** Remove both managed hooks. Returns true if either was present. */
export async function uninstallAll(root: string): Promise<boolean> {
  const a = await removeManagedHook(root, "pre-commit");
  const b = await removeManagedHook(root, "pre-push");
  return a || b;
}

export function isInstalled(root: string): Promise<boolean> {
  return hooksDir(root).then((dir) => {
    const path = join(dir, "pre-commit");
    if (!existsSync(path)) return false;
    return readFile(path, "utf8").then((c) => c.includes(MARKER));
  });
}
