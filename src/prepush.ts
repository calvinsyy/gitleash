import { execa } from "execa";
import type { Config, Finding } from "./types.js";

export type PushRef = {
  localRef: string;
  localSha: string;
  remoteRef: string;
  remoteSha: string;
};

const ZERO = /^0+$/;

/** Parse the newline-delimited ref quads git feeds a pre-push hook on stdin. */
export function parsePushRefs(stdin: string): PushRef[] {
  return stdin
    .split("\n")
    .filter((l) => l.trim())
    .map((line) => {
      const [localRef, localSha, remoteRef, remoteSha] = line.trim().split(/\s+/);
      return { localRef, localSha, remoteRef, remoteSha };
    });
}

export function branchOf(ref: string): string {
  return ref.replace(/^refs\/heads\//, "");
}

async function isAncestor(root: string, ancestor: string, descendant: string): Promise<boolean> {
  try {
    await execa("git", ["merge-base", "--is-ancestor", ancestor, descendant], { cwd: root });
    return true;
  } catch {
    return false;
  }
}

/**
 * Flag dangerous pushes to protected branches: force-pushes (non-fast-forward
 * history rewrites) and branch deletions. Ordinary fast-forwards pass.
 */
export async function checkPush(
  root: string,
  refs: PushRef[],
  config: Config,
): Promise<Finding[]> {
  const out: Finding[] = [];
  for (const r of refs) {
    if (!r.remoteRef) continue;
    const branch = branchOf(r.remoteRef);
    if (!config.protectedBranches.includes(branch)) continue;

    if (ZERO.test(r.localSha)) {
      out.push({
        rule: "protected-branch-push",
        severity: "block",
        message: `Refusing to delete protected branch "${branch}".`,
      });
      continue;
    }
    // Remote branch exists and its tip isn't in our history → non-fast-forward.
    if (!ZERO.test(r.remoteSha) && !(await isAncestor(root, r.remoteSha, r.localSha))) {
      out.push({
        rule: "force-push",
        severity: "block",
        message: `Force-push to protected branch "${branch}" would rewrite history and can lose commits. Override only if you are certain.`,
      });
    }
  }
  return out;
}
