# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/), and this project adheres to
[Semantic Versioning](https://semver.org/).

## [0.2.0] — 2026-07-17

### Added
- Inline secret allowlist: mark a line with `// gitleash-allow` (or
  `allowlist secret`) to silence a false positive without disabling the rule.

### Changed
- `big-diff` no longer fires on a repo's **initial commit** — bootstrapping a
  project is legitimately large.

## [0.1.0] — 2026-07-17

### Added
- Pre-commit rules: `big-diff` (line/file caps, excluding auto-generated files),
  `protect-tests` (deleted test files), `protect-ci` (CI/workflow edits),
  `secrets` (AWS/GitHub/OpenAI/Slack/Google/Stripe/credential patterns),
  `lockfile-drift`, and `protected-branch`.
- Pre-push rules: `force-push` and `protected-branch-push` block history
  rewrites and deletions of protected branches.
- Per-rule severity overrides (`ruleSeverity`) and per-rule disabling
  (`disabledRules`) via `.gitleash.json` or the `gitleash` key in `package.json`.
- CLI: `install`, `check` (with `--range` and `--json`), `pre-push`, `init`,
  `uninstall`. Override any block with `GITLEASH_OK=1` or `git commit --no-verify`.
- Hooks coexist with existing pre-commit/pre-push hooks (append, not overwrite).

[0.2.0]: https://github.com/calvinsyy/gitleash/releases/tag/v0.2.0
[0.1.0]: https://github.com/calvinsyy/gitleash/releases/tag/v0.1.0
