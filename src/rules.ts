import type { DiffContext, DiffFile, Finding, RuleFn } from "./types.js";

type Rule = { id: string; run: RuleFn };

// --- helpers ---------------------------------------------------------------

const TEST_PATTERNS: RegExp[] = [
  /(^|\/)(__tests__|tests?|spec)\//i,
  /\.(test|spec)\.[cm]?[jt]sx?$/i,
  /(^|\/)test_[^/]*\.py$/i,
  /_test\.(py|go|rb|ts|js)$/i,
  /_spec\.rb$/i,
];

const CI_PREFIXES = [".github/workflows/", ".circleci/"];
const CI_FILES = new Set([
  ".gitlab-ci.yml",
  "azure-pipelines.yml",
  "Jenkinsfile",
  ".travis.yml",
  "bitbucket-pipelines.yml",
]);

const LOCKFILES = /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|npm-shrinkwrap\.json)$/;
const MANIFEST = /(^|\/)package\.json$/;

const SECRET_PATTERNS: { name: string; re: RegExp }[] = [
  { name: "AWS access key", re: /AKIA[0-9A-Z]{16}/ },
  { name: "private key", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: "GitHub token", re: /ghp_[A-Za-z0-9]{36}/ },
  { name: "OpenAI-style key", re: /sk-[A-Za-z0-9]{20,}/ },
  {
    name: "hardcoded credential",
    re: /(api[_-]?key|secret|token|password)["']?\s*[:=]\s*["'][A-Za-z0-9_\-]{16,}["']/i,
  },
];

const isTest = (p: string) => TEST_PATTERNS.some((re) => re.test(p));
const isCi = (p: string) => CI_PREFIXES.some((pre) => p.startsWith(pre)) || CI_FILES.has(p);
const addedLines = (patch: string) =>
  patch.split("\n").filter((l) => l.startsWith("+") && !l.startsWith("+++"));

// --- rules -----------------------------------------------------------------

const bigDiff: Rule = {
  id: "big-diff",
  run: ({ files, additions, deletions, config }) => {
    const out: Finding[] = [];
    const total = additions + deletions;
    if (total > config.maxLines) {
      out.push({
        rule: "big-diff",
        severity: "block",
        message: `This commit changes ${total} lines (limit ${config.maxLines}). An agent that rewrites this much at once is hard to review — split it or override.`,
      });
    }
    if (files.length > config.maxFiles) {
      out.push({
        rule: "big-diff",
        severity: "block",
        message: `This commit touches ${files.length} files (limit ${config.maxFiles}). Consider committing in smaller, reviewable chunks.`,
      });
    }
    return out;
  },
};

const protectTests: Rule = {
  id: "protect-tests",
  run: ({ files, config }) => {
    if (!config.protectTests) return [];
    const deleted = files.filter((x) => x.status === "D" && isTest(x.path));
    return deleted.map((x) => ({
      rule: "protect-tests",
      severity: "block" as const,
      message: `Test file deleted: ${x.path}. Agents sometimes "fix" failing tests by removing them — confirm this is intentional.`,
    }));
  },
};

const protectCi: Rule = {
  id: "protect-ci",
  run: ({ files, config }) => {
    if (!config.protectCi) return [];
    const ci = files.filter((x) => isCi(x.path));
    return ci.map((x) => ({
      rule: "protect-ci",
      severity: "block" as const,
      message: `CI / workflow file changed: ${x.path}. Pipeline changes deserve human eyes before they land.`,
    }));
  },
};

const secrets: Rule = {
  id: "secrets",
  run: ({ patch, config }) => {
    if (!config.scanSecrets) return [];
    const out: Finding[] = [];
    const lines = addedLines(patch);
    for (const { name, re } of SECRET_PATTERNS) {
      if (lines.some((l) => re.test(l))) {
        out.push({
          rule: "secrets",
          severity: "block",
          message: `Possible ${name} in the staged changes. Never let an agent commit credentials — remove it or override if it's a false positive.`,
        });
      }
    }
    return out;
  },
};

const lockfileDrift: Rule = {
  id: "lockfile-drift",
  run: ({ files, config }) => {
    if (!config.warnLockfileDrift) return [];
    const lock = files.find((x) => LOCKFILES.test(x.path));
    const manifestChanged = files.some((x) => MANIFEST.test(x.path));
    if (lock && !manifestChanged) {
      return [
        {
          rule: "lockfile-drift",
          severity: "warn",
          message: `Lockfile ${lock.path} changed without a matching package.json change. An agent may have regenerated it unexpectedly.`,
        },
      ];
    }
    return [];
  },
};

const protectedBranch: Rule = {
  id: "protected-branch",
  run: ({ branch, config }) => {
    if (config.protectedBranches.includes(branch)) {
      return [
        {
          rule: "protected-branch",
          severity: "warn",
          message: `Committing directly to "${branch}". Consider a feature branch so the agent's work is reviewable.`,
        },
      ];
    }
    return [];
  },
};

export const RULES: Rule[] = [
  bigDiff,
  protectTests,
  protectCi,
  secrets,
  lockfileDrift,
  protectedBranch,
];

/** Run every enabled rule and return all findings. */
export function runRules(ctx: DiffContext): Finding[] {
  const disabled = new Set(ctx.config.disabledRules);
  return RULES.filter((r) => !disabled.has(r.id)).flatMap((r) => r.run(ctx));
}

export type { Rule, DiffFile };
