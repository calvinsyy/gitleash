import { execa } from "execa";
import { mkdir, readFile, writeFile, chmod, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { isAbsolute, join } from "node:path";

const MARKER = "# gitleash-managed";

const HOOK_BLOCK = `${MARKER}
if command -v gitleash >/dev/null 2>&1; then
  gitleash check || exit 1
elif command -v npx >/dev/null 2>&1; then
  npx --no-install gitleash check || exit 1
fi
`;

async function hooksDir(root: string): Promise<string> {
  const { stdout } = await execa("git", ["rev-parse", "--git-path", "hooks"], { cwd: root });
  const p = stdout.trim();
  return isAbsolute(p) ? p : join(root, p);
}

/**
 * Install the pre-commit hook. If a hook already exists, append our block so we
 * coexist (idempotent — re-running does not duplicate it).
 * Returns the hook path and whether we appended to an existing hook.
 */
export async function installHook(
  root: string,
): Promise<{ path: string; appended: boolean }> {
  const dir = await hooksDir(root);
  await mkdir(dir, { recursive: true });
  const path = join(dir, "pre-commit");

  if (!existsSync(path)) {
    await writeFile(path, `#!/bin/sh\n${HOOK_BLOCK}`);
    await chmod(path, 0o755);
    return { path, appended: false };
  }

  const current = await readFile(path, "utf8");
  if (current.includes(MARKER)) return { path, appended: true }; // already installed
  await writeFile(path, current.replace(/\n?$/, "\n") + "\n" + HOOK_BLOCK);
  await chmod(path, 0o755);
  return { path, appended: true };
}

/** Remove our managed block (or the whole file if we own it entirely). */
export async function uninstallHook(root: string): Promise<boolean> {
  const dir = await hooksDir(root);
  const path = join(dir, "pre-commit");
  if (!existsSync(path)) return false;
  const current = await readFile(path, "utf8");
  if (!current.includes(MARKER)) return false;

  if (current.trimStart().startsWith("#!/bin/sh") && current.includes(MARKER)) {
    const before = current.split(MARKER)[0].trim();
    // If nothing meaningful remains besides the shebang, delete the file.
    if (before === "#!/bin/sh" || before === "") {
      await rm(path);
      return true;
    }
  }
  // Strip our appended block only.
  const stripped = current.slice(0, current.indexOf(MARKER)).replace(/\n+$/, "\n");
  await writeFile(path, stripped);
  return true;
}

export function isInstalled(root: string): Promise<boolean> {
  return hooksDir(root).then((dir) => {
    const path = join(dir, "pre-commit");
    if (!existsSync(path)) return false;
    return readFile(path, "utf8").then((c) => c.includes(MARKER));
  });
}
