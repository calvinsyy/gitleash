# gitleash — Design Spec

**Date:** 2026-07-17
**Status:** MVP implemented & verified end-to-end

## One-liner

A zero-config git guardrail that stops reckless AI-agent commits (huge diffs,
deleted tests, hardcoded secrets, CI edits) before they land. It's a git
pre-commit hook, so it fires regardless of which agent — or human — made the diff.

## Why this exists / the gap

Concept was validated against the market before building. The closest existing
tool, **AgentLint** (PyPI, ~27★), enforces via *agent-native* hook systems
(Claude Code / Cursor / Codex), so it only guards agents wired into it, and it's
Python-only. Generic diff-size tools (**Danger JS**) are PR/CI-time and not
agent-framed. The unoccupied slot: a **zero-config, git-hook-native, npm**
guardrail with tuned agent defaults that fires for *any* committer. `gitleash`
fills exactly that slot.

## Architecture

Single-purpose modules, each independently testable:

- `git.ts` — reads a diff (staged by default) into a `DiffContext`
  (`files`, `additions`, `deletions`, `branch`, `patch`). Handles renames,
  binary files, and unborn branches.
- `rules.ts` — a registry of pure rule functions `(ctx) => Finding[]`:
  `big-diff`, `protect-tests`, `protect-ci`, `secrets`, `lockfile-drift`,
  `protected-branch`. `runRules` skips `disabledRules`.
- `config.ts` — `DEFAULT_CONFIG` merged with `.gitleash.json` or the `gitleash`
  key of `package.json`.
- `check.ts` — orchestrates load-config → build-context → run-rules → `blocked`.
- `report.ts` — pure formatter; empty string when clean, override footer on block.
- `hook.ts` — installs/removes the `pre-commit` hook; idempotent; coexists with
  an existing hook by appending a marked block.
- `cli.ts` — `install` / `check [--range]` / `init` / `uninstall` / `--help`.

## Rules & severities (defaults)

| Rule | Severity | Trigger |
| --- | --- | --- |
| big-diff | block | additions+deletions > 400, or files > 25 |
| protect-tests | block | a test file is deleted |
| protect-ci | block | `.github/workflows/*`, `.circleci/`, `Jenkinsfile`, etc. change |
| secrets | block | added lines match AWS/GitHub/OpenAI/private-key/credential patterns |
| lockfile-drift | warn | lockfile changed without `package.json` |
| protected-branch | warn | committing directly to `main`/`master` |

## Override model

A block is a speed bump. `GITLEASH_OK=1 git commit …` prints the report and
allows the commit; `git commit --no-verify` skips all hooks. Blocks are never
silent.

## Exit behavior

`gitleash check` exits 1 when any block fires (aborting the commit) unless
`GITLEASH_OK` is set. Warnings never change the exit code.

## Testing strategy

- Rules: pure unit tests with synthetic `DiffContext` (each rule + config).
- git.ts / check.ts / hook.ts: integration tests against real temp git repos.
- report.ts: pure formatter tests.
- End-to-end: install the hook, drive real `git commit`s (safe → passes,
  reckless → blocked, override → allowed).

## Distribution

Node/TS ESM, single dependency (`execa`). `npm i -g gitleash` or devDep + npx.
npm name `gitleash` confirmed available. MIT.

## Post-MVP — shipped in this pass

- `pre-push` hook: blocks force-pushes and deletions of protected branches
  (`prepush.ts`; rules `force-push`, `protected-branch-push`).
- Per-rule severity overrides in config (`ruleSeverity`).
- `--json` output for CI dashboards.
- Expanded secret patterns (Slack, Google, Stripe, GitHub PAT variants).
- `big-diff` excludes auto-generated files (lockfiles, bundles, `dist/`).

## 0.2.0 — retention hardening (shipped)

- `big-diff` never fires on the initial (bootstrap) commit (`isInitial` on the
  DiffContext, derived from whether HEAD exists).
- Secrets rule honors an inline allowlist marker (`gitleash-allow` /
  `allowlist secret`) so a single false-positive line can be silenced without
  disabling the whole rule.

## Fast-follows (still open)

- Entropy-based secret detection to complement the pattern list.
- Weakened-assertion detection (not just deleted test files).
- `gitleash install` opt-out flags per hook.
- Smarter big-diff (weight by file type; separate warn vs block thresholds).
