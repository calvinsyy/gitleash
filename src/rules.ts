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

const LOCKFILES = /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|npm-shrinkwrap\.json|Cargo\.lock|poetry\.lock|composer\.lock|Gemfile\.lock|go\.sum)$/;
const MANIFEST = /(^|\/)package\.json$/;
// Auto-generated / vendored output that shouldn't count toward a "big diff".
const GENERATED = /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|npm-shrinkwrap\.json|Cargo\.lock|poetry\.lock|composer\.lock|Gemfile\.lock|go\.sum)$|\.(min\.js|min\.css|map|lock)$|(^|\/)(dist|build|vendor)\//;

const SECRET_PATTERNS: { name: string; re: RegExp }[] = [
  { name: "AWS access key", re: /AKIA[0-9A-Z]{16}/ },
  { name: "private key", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: "GitHub token", re: /gh[pousr]_[A-Za-z0-9]{36,}/ },
  { name: "OpenAI-style key", re: /sk-[A-Za-z0-9]{20,}/ },
  { name: "Slack token", re: /xox[baprs]-[A-Za-z0-9-]{10,}/ },
  { name: "Google API key", re: /AIza[0-9A-Za-z_\-]{35}/ },
  { name: "Stripe secret key", re: /sk_live_[A-Za-z0-9]{20,}/ },
  {
    name: "hardcoded credential",
    re: /(api[_-]?key|secret|token|password|passwd)["']?\s*[:=]\s*["'][A-Za-z0-9_\-]{16,}["']/i,
  },
];

// An inline escape hatch on a line silences the secrets rule for that line.
const ALLOW_MARKER = /gitleash-allow|allowlist secret/i;

const isTest = (p: string) => TEST_PATTERNS.some((re) => re.test(p));
const isCi = (p: string) => CI_PREFIXES.some((pre) => p.startsWith(pre)) || CI_FILES.has(p);
const isGenerated = (p: string) => GENERATED.test(p);
const addedLines = (patch: string) =>
  patch
    .split("\n")
    .filter((l) => l.startsWith("+") && !l.startsWith("+++"))
    .filter((l) => !ALLOW_MARKER.test(l));

// --- rules -----------------------------------------------------------------

const bigDiff: Rule = {
  id: "big-diff",
  run: ({ files, config, isInitial }) => {
    // The first commit bootstraps the repo and is legitimately large.
    if (isInitial) return [];
    const out: Finding[] = [];
    // Auto-generated files (lockfiles, bundles) don't reflect agent intent, so
    // exclude them from the size the reviewer is actually asked to vet.
    const counted = files.filter((x) => !isGenerated(x.path));
    const total = counted.reduce((n, x) => n + x.additions + x.deletions, 0);
    if (total > config.maxLines) {
      out.push({
        rule: "big-diff",
        severity: "block",
        message: `This commit changes ${total} lines (limit ${config.maxLines}). An agent that rewrites this much at once is hard to review — split it or override.`,
      });
    }
    if (counted.length > config.maxFiles) {
      out.push({
        rule: "big-diff",
        severity: "block",
        message: `This commit touches ${counted.length} files (limit ${config.maxFiles}). Consider committing in smaller, reviewable chunks.`,
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

/** Run every enabled rule, apply any severity overrides, and return findings. */
export function runRules(ctx: DiffContext): Finding[] {
  const disabled = new Set(ctx.config.disabledRules);
  const override = ctx.config.ruleSeverity ?? {};
  return RULES.filter((r) => !disabled.has(r.id))
    .flatMap((r) => r.run(ctx))
    .map((finding) => {
      const sev = override[finding.rule];
      return sev ? { ...finding, severity: sev } : finding;
    });
}

export type { Rule, DiffFile };
