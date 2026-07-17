import { execa } from "execa";
import type { Config, DiffContext, DiffFile, FileStatus } from "./types.js";

async function git(root: string, args: string[]): Promise<string> {
  const { stdout } = await execa("git", args, { cwd: root });
  return stdout;
}

export async function getBranch(root: string): Promise<string> {
  // `branch --show-current` works even on an unborn branch (before the first commit).
  try {
    const name = (await git(root, ["branch", "--show-current"])).trim();
    if (name) return name;
  } catch {
    /* fall through */
  }
  try {
    return (await git(root, ["rev-parse", "--abbrev-ref", "HEAD"])).trim();
  } catch {
    return "HEAD";
  }
}

/** Normalize a numstat/name-status path, resolving rename syntax to the new path. */
function newPath(raw: string): string {
  // "{old => new}/x" or "old => new"
  const braced = raw.replace(/\{[^}]*=>\s*([^}]*)\}/g, "$1").replace(/\/\//g, "/");
  const arrow = braced.split(" => ");
  return (arrow.length > 1 ? arrow[arrow.length - 1] : braced).trim();
}

/**
 * Build a DiffContext from a git diff. Defaults to the staged changes
 * (`--cached`); pass other diffArgs (e.g. ["main...HEAD"]) for range checks.
 */
export async function getDiffContext(
  root: string,
  config: Config,
  diffArgs: string[] = ["--cached"],
): Promise<DiffContext> {
  const [branch, numstat, nameStatus, patch] = await Promise.all([
    getBranch(root),
    git(root, ["diff", ...diffArgs, "--numstat"]),
    git(root, ["diff", ...diffArgs, "--name-status"]),
    git(root, ["diff", ...diffArgs]),
  ]);

  const statusByPath = new Map<string, FileStatus>();
  for (const line of nameStatus.split("\n").filter(Boolean)) {
    const parts = line.split("\t");
    const status = parts[0][0] as FileStatus;
    const path = newPath(parts[parts.length - 1]);
    statusByPath.set(path, status);
  }

  const files: DiffFile[] = [];
  let additions = 0;
  let deletions = 0;
  for (const line of numstat.split("\n").filter(Boolean)) {
    const [addRaw, delRaw, ...rest] = line.split("\t");
    const path = newPath(rest.join("\t"));
    const add = addRaw === "-" ? 0 : Number(addRaw);
    const del = delRaw === "-" ? 0 : Number(delRaw);
    additions += add;
    deletions += del;
    files.push({ path, status: statusByPath.get(path) ?? "M", additions: add, deletions: del });
  }

  return { files, additions, deletions, branch, patch, config };
}
