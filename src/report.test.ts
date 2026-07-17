import { describe, it, expect } from "vitest";
import { formatReport } from "./report.js";
import type { Finding } from "./types.js";

const block: Finding = { rule: "secrets", severity: "block", message: "Possible AWS access key." };
const warn: Finding = { rule: "lockfile-drift", severity: "warn", message: "Lockfile drifted." };

describe("formatReport", () => {
  it("returns empty string when there are no findings", () => {
    expect(formatReport([])).toBe("");
  });

  it("lists blocking issues and shows the override footer", () => {
    const out = formatReport([block]);
    expect(out).toContain("secrets");
    expect(out).toContain("blocked");
    expect(out).toMatch(/GITLEASH_OK=1|--no-verify/);
  });

  it("shows warnings without an override footer when nothing blocks", () => {
    const out = formatReport([warn]);
    expect(out).toContain("lockfile-drift");
    expect(out).not.toContain("blocked");
    expect(out).not.toMatch(/--no-verify/);
  });
});
