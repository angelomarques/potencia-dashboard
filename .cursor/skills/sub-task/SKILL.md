---
name: sub-task
description: >-
  Look up a docs sub-task, prepare an isolated git worktree on a nested
  sub-branch, implement that slice, then commit and open a stacked PR into
  the feature branch. Use when the user invokes /sub-task, names this skill,
  or asks to implement one docs sub-task.
disable-model-invocation: true
---

# sub-task

One invocation = **one** sub-task from `docs/tasks/` and `docs/sub-tasks/`. Stacked onto the long-lived feature branch. Never base a sub-PR on `main`. Never merge. Never deploy.

Read and follow [feature-branch-workflow](../feature-branch-workflow/SKILL.md) for branch/PR rules. When implementing product code, follow [pwfeat](../pwfeat/SKILL.md) (clean architecture). After code changes, prove with [verify-potencia-stack](../verify-potencia-stack/SKILL.md) from the slice worktree. JavaScript dependencies: **pnpm only**.

Do not switch or edit the shared checkout. Prepare the slice with [worktree.sh](../ptask/scripts/worktree.sh). Commit, push, and verify only in the printed `path`. The shared checkout may be dirty; leave it.

Copy this checklist and keep it honest:

```
- [ ] 1. Resolve the sub-task doc
- [ ] 2. Confirm the feature branch exists, without switching the shared checkout
- [ ] 3. Prepare the named task branch in its own worktree
- [ ] 4. Implement only that sub-task
- [ ] 5. Verify from the worktree
- [ ] 6. Commit, push, open PR (base = feature branch)
```

## 1. Resolve the sub-task doc

Take the id from the user. Open the parent file in `docs/tasks/` and the matching file in `docs/sub-tasks/`.

Copy **Branch**, **Base**, and **PR** from the parent task. `<base>` is `feature/<short-name>`. The task **Branch** must be that ref. The PR base is `<base>`, never `main`.

Find the named `###` heading. The slice is the checkboxes under that heading only.

If the heading is missing or every item is already `[x]`, stop and say so. Do not invent a slice.

## 2. Feature branch: must exist

The shared checkout's **current branch does not matter**. Ignore `HEAD`. Do not implement, commit, or open a PR there. Do not switch it.

**Base** is `feature/<short-name>`.

```bash
PRIMARY="$(git rev-parse --show-toplevel)"
git -C "$PRIMARY" fetch origin
git -C "$PRIMARY" rev-parse --verify "origin/<base>"
```

- **Missing on origin:** stop. Do not create the long-lived feature branch here. The draft tracker PR `feature/<short-name>` → `main` must already exist (feature-branch-workflow step 1).
- **Exists:** do not check it out and do not pull into the shared checkout. A dirty shared checkout is not a reason to stop.

Also confirm the tracker: `gh pr list --head <base> --base main`. If none, stop.

## 3. Always prepare the named task branch

Every invocation must land on a **dedicated branch for this sub-task**, in its own worktree, from the updated feature branch — even if the shared checkout was already on `<base>`, already on a similar name, or already on a previous task branch.

Slot: `<base>/<slug>` with each `/` replaced by `--`. Reuse that slot when resuming. The slot has no slashes.

```bash
.cursor/skills/ptask/scripts/worktree.sh prepare \
  --repo "$PRIMARY" \
  --slot "<base-and-slug-with-slashes-replaced-by-->" \
  --branch "<base>/<slug>" \
  --start "origin/<base>" \
  --skill-root "$PRIMARY/.cursor/skills"
```

When that exact branch already exists, add `--fast-forward-to origin/<base>`.

Examples:

- `feature/<short-name>/<task-slug>` (whole task file)
- `feature/<short-name>/<slice-slug>` (one `###` slice)

If nested refs fail, use `feature/<short-name>--<slug>`. Base of the PR is still `<base>`, never `main`.

`prepare` resumes an existing branch instead of inventing a second slug. `action: resumed` keeps the same path, including uncommitted files. `fast_forward: skipped-dirty` means keep those files. `fast_forward: diverged` means stop: do not rebase, reset, or pick a new name. `locked-by-shared-checkout`, `branch-collision`, `path-collision`, and `unowned` mean stop without deleting the other path.

Never implement on:

- the shared checkout
- `main`
- `<base>`

## 4. Implement

`cd` to the worktree `path`. Read [pwfeat](../pwfeat/SKILL.md) from `skill_root`, then implement **only** the resolved checkboxes under that skill. Do not pack sibling `###` groups, drive-by refactors, or docs-unrelated files.

Install dependencies inside the worktree with **pnpm**. Do not reuse or modify the shared checkout's `node_modules` or `.env`. Gitignored files are not copied into a new worktree. Do not copy secrets in, and do not commit them.

Follow `AGENTS.md` and `.cursor/rules/` for this repo.

Do not paste `.env` values.

## 5. Verify

Run [verify-potencia-stack](../verify-potencia-stack/SKILL.md) from the worktree root (`pnpm doctor`, `pnpm smoke`, as that skill requires for the changed surface). Put command, exit code, and a short result in the PR body.

If verify fails, fix on this branch in this worktree. Do not open the PR red on purpose. Do not remove the worktree; verify evidence is gitignored and cleanup will refuse it.

## 6. Commit and open the PR

Commit when this skill is invoked — that **is** the request to commit this slice. Commit inside the worktree.

Follow the repo commit protocol: status, diff, log style, stage only this sub-task, HEREDOC message, no `--no-verify`, no force-push, no amend unless the usual amend rules apply. Do not commit `.env` or secrets.

```bash
git -C "<path>" push -u origin HEAD

existing="$(gh pr list --head "<base>/<slug>" --json url --jq '.[0].url')"
```

If `existing` is non-empty, return that URL. Otherwise, from the worktree:

```bash
gh pr create --base <base> --head <base>/<slug> \
  --title "feat(<short-name>): <slice or task title>" \
  --body "$(cat <<'EOF'
## Summary
<what changed>

## Sub-task
- Doc: `docs/sub-tasks/<file>.md` (`###` heading if a slice)
- Parent task: `docs/tasks/<file>.md`
- Worktree: `<path>`

## Test plan
- [ ] verify-potencia-stack from the worktree (command + exit code)

Waiting for approval. Do not merge. Do not deploy.
EOF
)"
```

PR **base is the feature branch** `feature/<short-name>`. Title may follow the parent task's **PR** field, or `feat(<short-name>): <heading>`.

Return the PR URL and the worktree path. Do not `gh pr merge`. Do not `gh pr ready` on the tracker.

Cleanup after a pushed PR is optional:

```bash
.cursor/skills/ptask/scripts/worktree.sh cleanup --repo "$PRIMARY" --slot "<slot>"
```

If cleanup refuses, leave the directory. The helper keeps the branch and rejects `--force`. Do not `git worktree remove --force`, `git branch -D`, or `git clean`. On failure, do not cleanup.

## Stops

- Feature branch or tracker PR missing.
- Implementing in the shared checkout, on `main`, or on `<base>` instead of preparing `<base>/<slug>`.
- Switching the shared checkout to free a branch.
- Sub-PR whose base is `main`.
- Implementing a different slice than the one named.
- Merging or deploying.
- Removing a dirty, ignored, unpushed, or unowned worktree.
- Packing multiple `###` groups into one PR unless the user named the whole task.
