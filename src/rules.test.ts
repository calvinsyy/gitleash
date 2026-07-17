import { describe, it, expect } from "vitest";
import { runRules, RULES } from "./rules.js";
import { DEFAULT_CONFIG } from "./config.js";
import type { Config, DiffContext, DiffFile } from "./types.js";

function ctx(over: Partial<DiffContext> = {}): DiffContext {
  const files: DiffFile[] = over.files ?? [];
  const additions = over.additions ?? files.reduce((n, f) => n + f.additions, 0);
  const deletions = over.deletions ?? files.reduce((n, f) => n + f.deletions, 0);
  const config: Config = over.config ?? DEFAULT_CONFIG;
  return {
    files,
    additions,
    deletions,
    branch: over.branch ?? "feature/x",
    patch: over.patch ?? "",
    config,
  };
}

const f = (
  path: string,
  status: DiffFile["status"] = "M",
  additions = 1,
  deletions = 0,
): DiffFile => ({ path, status, additions, deletions });

describe("big-diff rule", () => {
  it("blocks when total lines exceed maxLines", () => {
    const found = runRules(ctx({ files: [f("a.ts", "M", 300, 200)] }));
    expect(found.some((x) => x.rule === "big-diff" && x.severity === "block")).toBe(true);
  });
  it("blocks when file count exceeds maxFiles", () => {
    const files = Array.from({ length: 30 }, (_, i) => f(`f${i}.ts`, "M", 1, 0));
    const found = runRules(ctx({ files }));
    expect(found.some((x) => x.rule === "big-diff" && x.severity === "block")).toBe(true);
  });
  it("passes a small diff", () => {
    const found = runRules(ctx({ files: [f("a.ts", "M", 5, 2)] }));
    expect(found.some((x) => x.rule === "big-diff")).toBe(false);
  });
});

describe("protect-tests rule", () => {
  it("blocks when a test file is deleted", () => {
    const found = runRules(ctx({ files: [f("src/foo.test.ts", "D", 0, 40)] }));
    expect(found.some((x) => x.rule === "protect-tests" && x.severity === "block")).toBe(true);
  });
  it("ignores a deleted non-test file", () => {
    const found = runRules(ctx({ files: [f("src/foo.ts", "D", 0, 40)] }));
    expect(found.some((x) => x.rule === "protect-tests")).toBe(false);
  });
  it("recognizes __tests__ and _test.py and spec files", () => {
    for (const p of ["a/__tests__/b.js", "pkg/foo_test.py", "x.spec.tsx"]) {
      const found = runRules(ctx({ files: [f(p, "D", 0, 10)] }));
      expect(found.some((x) => x.rule === "protect-tests")).toBe(true);
    }
  });
});

describe("protect-ci rule", () => {
  it("blocks when a workflow file changes", () => {
    const found = runRules(ctx({ files: [f(".github/workflows/ci.yml", "M", 3, 1)] }));
    expect(found.some((x) => x.rule === "protect-ci" && x.severity === "block")).toBe(true);
  });
  it("ignores ordinary yml files", () => {
    const found = runRules(ctx({ files: [f("config/app.yml", "M", 3, 1)] }));
    expect(found.some((x) => x.rule === "protect-ci")).toBe(false);
  });
});

describe("secrets rule", () => {
  it("blocks on an added AWS key", () => {
    const patch = "+++ b/config.js\n+const k = 'AKIAIOSFODNN7EXAMPLE';\n";
    const found = runRules(ctx({ files: [f("config.js", "M", 1, 0)], patch }));
    expect(found.some((x) => x.rule === "secrets" && x.severity === "block")).toBe(true);
  });
  it("blocks on a private key header", () => {
    const patch = "+-----BEGIN OPENSSH PRIVATE KEY-----\n";
    const found = runRules(ctx({ files: [f("id_rsa", "A", 1, 0)], patch }));
    expect(found.some((x) => x.rule === "secrets")).toBe(true);
  });
  it("does not flag removed lines or the diff header", () => {
    const patch = "--- a/x\n+++ b/x\n-const k = 'AKIAIOSFODNN7EXAMPLE';\n";
    const found = runRules(ctx({ files: [f("x", "M", 0, 1)], patch }));
    expect(found.some((x) => x.rule === "secrets")).toBe(false);
  });
});

describe("lockfile-drift rule", () => {
  it("warns when a lockfile changes without its manifest", () => {
    const found = runRules(ctx({ files: [f("package-lock.json", "M", 50, 10)] }));
    expect(found.some((x) => x.rule === "lockfile-drift" && x.severity === "warn")).toBe(true);
  });
  it("stays quiet when the manifest changed too", () => {
    const found = runRules(
      ctx({ files: [f("package-lock.json", "M", 50, 10), f("package.json", "M", 2, 0)] }),
    );
    expect(found.some((x) => x.rule === "lockfile-drift")).toBe(false);
  });
});

describe("protected-branch rule", () => {
  it("warns when committing directly to main", () => {
    const found = runRules(ctx({ files: [f("a.ts")], branch: "main" }));
    expect(found.some((x) => x.rule === "protected-branch" && x.severity === "warn")).toBe(true);
  });
});

describe("config", () => {
  it("skips disabled rules", () => {
    const config: Config = { ...DEFAULT_CONFIG, disabledRules: ["big-diff"] };
    const found = runRules(ctx({ files: [f("a.ts", "M", 999, 0)], config }));
    expect(found.some((x) => x.rule === "big-diff")).toBe(false);
  });
  it("respects a raised maxLines threshold", () => {
    const config: Config = { ...DEFAULT_CONFIG, maxLines: 5000 };
    const found = runRules(ctx({ files: [f("a.ts", "M", 900, 0)], config }));
    expect(found.some((x) => x.rule === "big-diff")).toBe(false);
  });
});

describe("RULES registry", () => {
  it("exposes a stable set of rule ids", () => {
    expect(RULES.map((r) => r.id).sort()).toEqual(
      ["big-diff", "lockfile-drift", "protect-ci", "protect-tests", "protected-branch", "secrets"].sort(),
    );
  });
});
