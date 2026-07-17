import { describe, it, expect, beforeEach } from "vitest";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execa } from "execa";
import { parsePushRefs, checkPush, branchOf } from "./prepush.js";
import { DEFAULT_CONFIG } from "./config.js";

describe("parsePushRefs", () => {
  it("parses stdin lines into ref quads", () => {
    const refs = parsePushRefs(
      "refs/heads/main aaa refs/heads/main bbb\nrefs/heads/x 111 refs/heads/x 222\n",
    );
    expect(refs).toHaveLength(2);
    expect(refs[0]).toEqual({
      localRef: "refs/heads/main",
      localSha: "aaa",
      remoteRef: "refs/heads/main",
      remoteSha: "bbb",
    });
  });
});

describe("branchOf", () => {
  it("strips refs/heads/", () => {
    expect(branchOf("refs/heads/main")).toBe("main");
  });
});

async function repoWithHistory() {
  const root = await mkdtemp(join(tmpdir(), "gitleash-pp-"));
  const git = (args: string[]) => execa("git", args, { cwd: root });
  await git(["init", "-q"]);
  await git(["config", "user.email", "t@t"]);
  await git(["config", "user.name", "t"]);
  await git(["checkout", "-q", "-b", "main"]);
  await writeFile(join(root, "a.txt"), "1\n");
  await git(["add", "-A"]);
  await git(["commit", "-q", "-m", "c1"]);
  const c1 = (await git(["rev-parse", "HEAD"])).stdout.trim();
  await writeFile(join(root, "a.txt"), "2\n");
  await git(["add", "-A"]);
  await git(["commit", "-q", "-m", "c2"]);
  const c2 = (await git(["rev-parse", "HEAD"])).stdout.trim();
  // an amended history off c1 (not an ancestor of c2 -> a force push)
  await git(["reset", "-q", "--hard", c1]);
  await writeFile(join(root, "a.txt"), "forked\n");
  await git(["add", "-A"]);
  await git(["commit", "-q", "-m", "forked"]);
  const forked = (await git(["rev-parse", "HEAD"])).stdout.trim();
  return { root, c1, c2, forked };
}

describe("checkPush", () => {
  it("blocks a force-push (non-fast-forward) to a protected branch", async () => {
    const { root, c2, forked } = await repoWithHistory();
    // pushing `forked` over remote `c2` on main = history rewrite
    const refs = parsePushRefs(`refs/heads/main ${forked} refs/heads/main ${c2}\n`);
    const found = await checkPush(root, refs, DEFAULT_CONFIG);
    expect(found.some((f) => f.rule === "force-push" && f.severity === "block")).toBe(true);
  });

  it("allows a normal fast-forward push to a protected branch", async () => {
    const { root, c1, c2 } = await repoWithHistory();
    // pushing `c2` over remote `c1` on main = fast-forward
    const refs = parsePushRefs(`refs/heads/main ${c2} refs/heads/main ${c1}\n`);
    const found = await checkPush(root, refs, DEFAULT_CONFIG);
    expect(found.some((f) => f.rule === "force-push")).toBe(false);
  });

  it("blocks deleting a protected branch", async () => {
    const { root, c2 } = await repoWithHistory();
    const refs = parsePushRefs(`(delete) 0000000000000000000000000000000000000000 refs/heads/main ${c2}\n`);
    const found = await checkPush(root, refs, DEFAULT_CONFIG);
    expect(found.some((f) => f.rule === "protected-branch-push" && f.severity === "block")).toBe(true);
  });

  it("ignores non-protected branches", async () => {
    const { root, c2, forked } = await repoWithHistory();
    const refs = parsePushRefs(`refs/heads/feature ${forked} refs/heads/feature ${c2}\n`);
    const found = await checkPush(root, refs, DEFAULT_CONFIG);
    expect(found).toHaveLength(0);
  });
});
