import { loadConfig } from "./config.js";
import { getDiffContext } from "./git.js";
import { runRules } from "./rules.js";
import type { Finding } from "./types.js";

export type CheckResult = { findings: Finding[]; blocked: boolean };

/**
 * Load config, read the diff (staged by default), run the rules, and report
 * whether anything blocks. `diffArgs` lets callers check a range instead
 * (e.g. ["main...HEAD"] in CI).
 */
export async function runCheck(root: string, diffArgs?: string[]): Promise<CheckResult> {
  const config = await loadConfig(root);
  const ctx = await getDiffContext(root, config, diffArgs);
  const findings = runRules(ctx);
  return { findings, blocked: findings.some((f) => f.severity === "block") };
}
