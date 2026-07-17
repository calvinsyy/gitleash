# gitleash

**Keep your AI coding agent on a leash.** A zero-config git guardrail that stops
reckless agent commits — huge diffs, deleted tests, hardcoded secrets, CI edits —
*before they land*. Works with Claude Code, Cursor, aider, Codex, or a human on a
bad day. It's just a git hook, so it fires no matter who (or what) made the change.

![gitleash blocking a reckless commit](docs/demo.svg)

## Why

You hand an AI agent your repo and walk away. It comes back having deleted the
failing test instead of fixing it, regenerated your lockfile, hardcoded an API
key, and rewritten 600 lines across 30 files — all staged, ready to commit.

`gitleash` is a pre-commit tripwire tuned for exactly that. When a staged commit
crosses a danger line, it stops the commit and tells you why. Nothing is blocked
silently; every block is one env var away from an override.

## Quick start

```bash
npm i -g gitleash        # or: npm i -D gitleash
cd your-repo
gitleash install         # writes a pre-commit hook (once per repo)
```

That's it. The next time an agent tries a reckless commit, it gets stopped:

```
gitleash — 2 blocking issues, 0 warnings

  ✖ protect-tests  Test file deleted: app.test.ts. Agents sometimes "fix" failing
                   tests by removing them — confirm this is intentional.
  ✖ secrets        Possible AWS access key in the staged changes.

Commit blocked. If this is intentional, override with:
  GITLEASH_OK=1 git commit ...      (or: git commit --no-verify)
```

## The default rules (tuned for autonomous agents)

| Rule | Severity | Fires when |
| --- | --- | --- |
| `big-diff` | block | > 400 changed lines, or > 25 changed files, in one commit |
| `protect-tests` | block | a test file is deleted |
| `protect-ci` | block | a `.github/workflows/*` or other CI file changes |
| `secrets` | block | staged content matches a secret pattern (AWS/GitHub/OpenAI keys, private keys, hardcoded credentials) |
| `lockfile-drift` | warn | a lockfile changes without its `package.json` |
| `protected-branch` | warn | you commit directly to `main` / `master` |

Blocks stop the commit; warnings just print. Every threshold is configurable.

## Configuration

Zero config works out of the box. To tune, run `gitleash init` and edit
`.gitleash.json` (or add a `gitleash` key to `package.json`):

```json
{
  "maxLines": 400,
  "maxFiles": 25,
  "protectTests": true,
  "protectCi": true,
  "scanSecrets": true,
  "warnLockfileDrift": true,
  "protectedBranches": ["main", "master"],
  "disabledRules": []
}
```

## Commands

| Command | What it does |
| --- | --- |
| `gitleash install` | Install the pre-commit hook (coexists with existing hooks) |
| `gitleash check` | Check the staged diff — what the hook runs |
| `gitleash check --range main..HEAD` | Check a commit range instead (handy in CI) |
| `gitleash init` | Write a `.gitleash.json` you can tune |
| `gitleash uninstall` | Remove the hook |

## How it works

`gitleash install` writes a `pre-commit` hook that runs `gitleash check`. On each
commit, `gitleash` reads the **staged** diff (`git diff --cached`), runs the rules,
and exits non-zero if anything blocks — which aborts the commit. If a hook already
exists, gitleash appends its block so the two coexist.

It never phones home, never uploads your code, and adds no runtime dependency to
your project beyond `git` itself.

## Overriding

A block is a speed bump, not a wall. When you've reviewed the change and it's fine:

```bash
GITLEASH_OK=1 git commit -m "..."   # gitleash allows it and notes the override
git commit --no-verify -m "..."     # skips all git hooks entirely
```

## Requirements

- Node ≥ 18
- `git` on your PATH

## License

MIT
