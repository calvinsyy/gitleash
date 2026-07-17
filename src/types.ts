export type Severity = "block" | "warn";

export type FileStatus = "A" | "M" | "D" | "R" | "C" | "T" | "U";

export type DiffFile = {
  path: string;
  status: FileStatus;
  additions: number;
  deletions: number;
};

export type Finding = {
  rule: string;
  severity: Severity;
  message: string;
};

export type Config = {
  /** Block when total added+deleted lines exceed this. */
  maxLines: number;
  /** Block when the number of changed files exceeds this. */
  maxFiles: number;
  /** Block when a test file is deleted. */
  protectTests: boolean;
  /** Block when CI / workflow files change. */
  protectCi: boolean;
  /** Block when staged content looks like a secret. */
  scanSecrets: boolean;
  /** Warn when a lockfile changes without its manifest. */
  warnLockfileDrift: boolean;
  /** Warn when committing directly to one of these branches. */
  protectedBranches: string[];
  /** Rule ids to skip entirely. */
  disabledRules: string[];
  /** Override a rule's severity, e.g. { "protect-ci": "warn" }. */
  ruleSeverity: Partial<Record<string, Severity>>;
};

export type DiffContext = {
  files: DiffFile[];
  additions: number;
  deletions: number;
  branch: string;
  /** Full unified diff of the staged changes (for content scans). */
  patch: string;
  /** True when this is the repo's first commit (no HEAD yet). */
  isInitial: boolean;
  config: Config;
};

export type RuleFn = (ctx: DiffContext) => Finding[];
