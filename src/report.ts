import type { Finding } from "./types.js";

/**
 * Render findings as a human-readable report. Empty string when there are none.
 * `action`/`command` tailor the block footer to the context (commit vs push).
 */
export function formatReport(
  findings: Finding[],
  action = "Commit",
  command = "commit",
): string {
  if (findings.length === 0) return "";

  const blocks = findings.filter((f) => f.severity === "block");
  const warns = findings.filter((f) => f.severity === "warn");
  const width = Math.max(...findings.map((f) => f.rule.length));

  const lines: string[] = [];
  lines.push(
    `gitleash — ${blocks.length} blocking issue${blocks.length === 1 ? "" : "s"}, ${warns.length} warning${warns.length === 1 ? "" : "s"}`,
  );
  lines.push("");
  for (const f of [...blocks, ...warns]) {
    const icon = f.severity === "block" ? "✖" : "⚠";
    lines.push(`  ${icon} ${f.rule.padEnd(width)}  ${f.message}`);
  }
  if (blocks.length > 0) {
    lines.push("");
    lines.push(`${action} blocked. If this is intentional, override with:`);
    lines.push(`  GITLEASH_OK=1 git ${command} ...      (or: git ${command} --no-verify)`);
  }
  return lines.join("\n");
}
