#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { runCheck } from "./check.js";
import { formatReport } from "./report.js";
import { installAll, uninstallAll } from "./hook.js";
import { loadConfig, DEFAULT_CONFIG } from "./config.js";
import { parsePushRefs, checkPush } from "./prepush.js";

const root = process.cwd();
const [cmd, ...rest] = process.argv.slice(2);

async function main() {
  switch (cmd) {
    case "check": {
      const i = rest.indexOf("--range");
      const diffArgs = i >= 0 && rest[i + 1] ? [rest[i + 1]] : undefined;
      const { findings, blocked } = await runCheck(root, diffArgs);
      if (rest.includes("--json")) {
        console.log(JSON.stringify({ findings, blocked }, null, 2));
      } else {
        const report = formatReport(findings);
        if (report) console.error(report);
      }
      if (blocked) {
        if (process.env.GITLEASH_OK) {
          if (!rest.includes("--json")) {
            console.error("\n(GITLEASH_OK set — allowing the commit anyway.)");
          }
          return;
        }
        process.exit(1);
      }
      return;
    }
    case "pre-push": {
      const stdin = await readStdin();
      const config = await loadConfig(root);
      const findings = await checkPush(root, parsePushRefs(stdin), config);
      const report = formatReport(findings, "Push", "push");
      if (report) console.error(report);
      if (findings.some((f) => f.severity === "block")) {
        if (process.env.GITLEASH_OK) {
          console.error("\n(GITLEASH_OK set — allowing the push anyway.)");
          return;
        }
        process.exit(1);
      }
      return;
    }
    case "install": {
      const paths = await installAll(root);
      console.log(`gitleash hooks installed:\n  ${paths.join("\n  ")}`);
      console.log("Reckless agent commits and force-pushes will now be stopped before they land.");
      return;
    }
    case "uninstall": {
      const ok = await uninstallAll(root);
      console.log(ok ? "gitleash hooks removed." : "No gitleash hooks found.");
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

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = "";
    if (process.stdin.isTTY) return resolve("");
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => (data += c));
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", () => resolve(data));
  });
}

function printHelp() {
  console.log(`gitleash — a zero-config git guardrail for AI coding agents

Usage:
  gitleash install              Install the pre-commit and pre-push hooks (once per repo)
  gitleash check                Check the staged diff against the rules (what the hook runs)
  gitleash check --range <a..b> Check a commit range instead (handy in CI)
  gitleash check --json         Emit findings as JSON (for CI dashboards)
  gitleash init                 Write a .gitleash.json you can tune
  gitleash uninstall            Remove the hooks

Override a block for one commit/push:  GITLEASH_OK=1 git commit ...   (or git commit --no-verify)`);
}

main().catch((e) => {
  console.error(String(e?.message ?? e));
  process.exit(1);
});
