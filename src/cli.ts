#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { runCheck } from "./check.js";
import { formatReport } from "./report.js";
import { installHook, uninstallHook } from "./hook.js";
import { DEFAULT_CONFIG } from "./config.js";

const root = process.cwd();
const [cmd, ...rest] = process.argv.slice(2);

async function main() {
  switch (cmd) {
    case "check": {
      const i = rest.indexOf("--range");
      const diffArgs = i >= 0 && rest[i + 1] ? [rest[i + 1]] : undefined;
      const { findings, blocked } = await runCheck(root, diffArgs);
      const report = formatReport(findings);
      if (report) console.error(report);
      if (blocked) {
        if (process.env.GITLEASH_OK) {
          console.error("\n(GITLEASH_OK set — allowing the commit anyway.)");
          return;
        }
        process.exit(1);
      }
      return;
    }
    case "install": {
      const { path, appended } = await installHook(root);
      console.log(
        appended
          ? `gitleash added to your existing pre-commit hook: ${path}`
          : `gitleash pre-commit hook installed: ${path}`,
      );
      console.log("Your agent's reckless commits will now be stopped before they land.");
      return;
    }
    case "uninstall": {
      const ok = await uninstallHook(root);
      console.log(ok ? "gitleash hook removed." : "No gitleash hook found.");
      return;
    }
    case "init": {
      const path = join(root, ".gitleash.json");
      if (existsSync(path)) {
        console.log(".gitleash.json already exists.");
        return;
      }
      await writeFile(path, JSON.stringify(DEFAULT_CONFIG, null, 2) + "\n");
      console.log(`Wrote default config to ${path}. Tune the thresholds to taste.`);
      return;
    }
    case "--help":
    case "-h":
    case "help":
    case undefined:
      printHelp();
      return;
    default:
      console.error(`Unknown command: ${cmd}\n`);
      printHelp();
      process.exit(1);
  }
}

function printHelp() {
  console.log(`gitleash — a zero-config git guardrail for AI coding agents

Usage:
  gitleash install              Install the pre-commit hook (do this once per repo)
  gitleash check                Check the staged diff against the rules (what the hook runs)
  gitleash check --range <a..b> Check a commit range instead (handy in CI)
  gitleash init                 Write a .gitleash.json you can tune
  gitleash uninstall            Remove the hook

Override a block for one commit:  GITLEASH_OK=1 git commit ...   (or git commit --no-verify)`);
}

main().catch((e) => {
  console.error(String(e?.message ?? e));
  process.exit(1);
});
