import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Config } from "./types.js";

export const DEFAULT_CONFIG: Config = {
  maxLines: 400,
  maxFiles: 25,
  protectTests: true,
  protectCi: true,
  scanSecrets: true,
  warnLockfileDrift: true,
  protectedBranches: ["main", "master"],
  disabledRules: [],
};

/** Merge a partial user config over the defaults. Unknown keys are ignored. */
export function mergeConfig(partial: Partial<Config> | undefined): Config {
  return { ...DEFAULT_CONFIG, ...(partial ?? {}) };
}

/**
 * Load config from `.gitleash.json` or the `gitleash` key of `package.json`,
 * merged over defaults. Missing files are fine — defaults are returned.
 */
export async function loadConfig(root: string): Promise<Config> {
  const fromFile = await readJson<Partial<Config>>(join(root, ".gitleash.json"));
  if (fromFile) return mergeConfig(fromFile);
  const pkg = await readJson<{ gitleash?: Partial<Config> }>(join(root, "package.json"));
  return mergeConfig(pkg?.gitleash);
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    return null;
  }
}
