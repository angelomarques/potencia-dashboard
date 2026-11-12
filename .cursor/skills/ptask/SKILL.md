---
name: ptask
description: >-
  Orchestrates a whole task by spawning one sub-agent per docs sub-task,
  waiting for each to finish and open its PR before starting the next.
  Each slice runs in its own git worktree. Use when the user invokes /ptask
  or asks to run an entire task through /sub-task.
disable-model-invocation: true
---

# ptask

Parent **orchestrates**. It does not implement product code. Each slice is one sub-agent.

A task is the parent file in `docs/tasks/` plus the `###` groups in `docs/sub-tasks/`. One group → one sequential PR. **Never spawn two sub-task agents in the same turn.**

Slice agents do **not** share a working tree. Prepare one linked git worktree per slice with [worktree.sh](scripts/worktree.sh). Do not switch the shared checkout. A dirty shared checkout is left as it is.

```
- [ ] 1. Resolve the task and queue every ### slice
- [ ] 2. Confirm the feature branch + tracker PR (create both if missing) without switching the shared checkout
- [ ] 3. For each slice, in order: prepare one worktree, spawn one agent into that path, wait, record the PR
- [ ] 4. If a slice fails, stop and leave that worktree in place
- [ ] 5. Hand back every PR URL and worktree path
```

## Reads

- [sub-task](../sub-task/SKILL.md) — the slice agent follows it
- [pwfeat](../pwfeat/SKILL.md) — product code inside the slice
- [feature-branch-workflow](../feature-branch-workflow/SKILL.md) — branch and PR bases (via sub-task)
- [verify-potencia-stack](../verify-potencia-stack/SKILL.md) — proof after code (via sub-task), run from the slice worktree
- [worktree.sh](scripts/worktree.sh) — create, resume, inspect, and remove worktrees
- [worktree-test.sh](scripts/worktree-test.sh) — disposable-repo proof of the helper

## 1. Queue

Take the task id from the user. Find the parent file in `docs/tasks/` and the matching file in `docs/sub-tasks/`. Copy **Branch**, **Base**, **PR**.

`<base>` is the long-lived feature branch `feature/<short-name>` from [feature-branch-workflow](../feature-branch-workflow/SKILL.md). The task **Branch** must be that same ref. Do not invent a second branch name.

A slice is one `###` heading in the sub-task doc, in document order. Skip a heading whose checkboxes are all `[x]`.

For each remaining slice record the heading, the slug, the branch `<base>/<slug>`, and the doc path.

Empty queue (all done or no `###` headings): stop.

## 2. Feature branch

`<primary>` is the absolute path of the shared checkout. Record it once. Run the helper from that directory:

```bash
PRIMARY="$(git rev-parse --show-toplevel)"
```

`git -C "$PRIMARY" fetch origin` is allowed. Fetch does not switch branches. Do not `git pull`, commit, or edit files in `$PRIMARY`.

`<base>` is `feature/<short-name>`.

If `origin/<base>` exists: do **not** check it out. Confirm a tracker `gh pr list --head <base> --base main`. If the branch exists but the tracker is missing, open the draft tracker only. Do not invent a second branch name.

If `origin/<base>` is missing, the parent **creates it**, in a worktree:

```bash
git -C "$PRIMARY" fetch origin
.cursor/skills/ptask/scripts/worktree.sh prepare \
  --repo "$PRIMARY" \
  --slot "<base-with-slashes-replaced-by-->" \
  --branch "<base>" \
  --start "origin/main" \
  --skill-root "$PRIMARY/.cursor/skills"
```

1. Land a **tracker-only** commit in the printed `path` if GitHub would otherwise refuse an empty PR (checklist / Branch lines — no product code).
2. `git -C "<path>" push -u origin HEAD`
3. Open a **draft** tracker PR `<base>` → `main` listing every `###` slice. Do not merge. Do not `gh pr ready`.

Do not implement a slice on `<base>`.

Slot rule: replace each `/` in the branch with `--`. Reuse that exact slot when resuming. Do not append a random suffix.

## 3. Sequential sub-agents

For **each** queued slice, prepare **one** worktree, spawn **one** Task, then wait until it returns. Only then start the next.

```bash
.cursor/skills/ptask/scripts/worktree.sh prepare \
  --repo "$PRIMARY" \
  --slot "<branch-with-slashes-replaced-by-->" \
  --branch "<slice-branch>" \
  --start "<start-ref>" \
  --skill-root "$PRIMARY/.cursor/skills"
```

Use the JSON `path` as the worker's only writable checkout. Pass `--fast-forward-to` only for the first-slice case below.

| Field | Value |
| --- | --- |
| `subagent_type` | `generalPurpose` |
| `run_in_background` | **`false`** (must block) |
| `environment` | `local`. Do not pass `cloud`. Isolation is this git worktree, not another VM. |
| `model` | omit (inherit). Never pass a `claude-*` / Sonnet / Opus / Haiku slug |

Do not use `poteto-agent`. Do not launch the next Task in the same message as the current one.

### Prompt every agent must get

Tell it to **read `.cursor/skills/sub-task/SKILL.md` in full and follow it**, including **read `.cursor/skills/pwfeat/SKILL.md` before product code**. Pin the paths from the prepare JSON so a stale branch cannot hide the skill text. Then pin the slice so it cannot widen:

```
Follow `.cursor/skills/sub-task/SKILL.md` exactly.
Before product code, read and follow `.cursor/skills/pwfeat/SKILL.md`.

Shared checkout (do not switch, commit, or edit): <primary>
Worktree (edit, commit, push, and verify only here): <path>
Skills (read these files): <skill_root>
Helper: <skill_root>/ptask/scripts/worktree.sh

Slice only: <heading text>
Doc: docs/sub-tasks/<file>.md
Parent task: docs/tasks/<file>.md
Base: <base>
PR base: <base>
Your branch: <base>/<slug>
<stack override — first vs later, see below>

Do not implement sibling ### groups. Do not merge. Do not deploy.
Do not remove the worktree if you fail. Do not pass --force to the helper.

When done, return:
- branch name
- worktree path
- PR URL
- verify-potencia-stack command + exit code (run from the worktree)
- one-line summary
If you cannot finish, return the blocker, the worktree path, and no PR URL.
```

### First slice

Start ref is `origin/<base>` (the updated task branch). Branch is `<base>/<slug>`. PR `--base <base>`.

When that branch already exists, also pass `--fast-forward-to origin/<base>`. If the JSON says `fast_forward` is `diverged`, stop. Do not rebase, reset, or invent a second branch name. If it is `skipped-dirty`, resume in that dirty worktree.

### Later slices (previous PR is still open)

Later slices need the previous code, and each PR must stay one concern.

Override only this (state it in the prompt):

1. Prepare `<base>/<this-slug>` with `--start` set to the **previous slice branch** (the local ref or `origin/<previous>`), not from a stale `<base>` tip and not from whatever the shared checkout has checked out.
2. Open the PR with `--base <previous-slug-branch>` so the diff is this slice only.
3. In the PR body: this is stacked on `<previous PR URL>`; after that PR squash-merges into `<base>`, retarget this PR to `<base>`.

If the previous slice is **already merged** into `<base>`, drop the override: `--start origin/<base>` and follow sub-task as written. Do not rebase the previous branch.

### After each agent

Require a PR URL. Record: slice id, branch, worktree path, PR URL.

- **No PR URL or verify failed:** stop. Do not spawn the next slice. Do not cleanup. Report the blocker and the worktree path.
- **Success:** spawn the next slice with the new previous branch + PR URL. Cleanup is optional and only through the helper, after the branch is pushed. If cleanup refuses, leave the worktree and still report the PR.

Never `gh pr merge`. Never `gh pr ready` on the tracker.

## Resume

Running the same slice again uses the same slot and branch. `prepare` returns `action: resumed` and the same `path`. Keep uncommitted files and unpushed commits. Do not create a second worktree or a second branch name.

## Cleanup

```bash
.cursor/skills/ptask/scripts/worktree.sh cleanup --repo "$PRIMARY" --slot "<slot>"
```

The helper removes a worktree only when it owns the marker, the tree has no uncommitted or ignored files, and the branch's commits are already on another branch or a remote. It keeps the branch. It does not accept `--force`.

Do not cleanup a failed slice. Ignored evidence, dependency installs, and secrets in the worktree are a refusal, not a prompt to delete them by hand and retry. Never `git worktree remove --force`, `git branch -D`, or `git worktree prune` to get past a refusal.

## 4. Done

List every PR and worktree path in queue order. Remind: reviewer approves each; nothing merges to `main`; do not deploy.

## Stops

- Parallel sub-task agents, or a second spawn before the previous returned.
- Parent implementing product code instead of spawning.
- Switching, committing, or editing the shared checkout.
- A later slice branched from `main` or from `<base>` while the previous PR is still open (missing the prior commits).
- Continuing after a failed slice, or deleting that slice's worktree.
- A second slot or branch for a slice that already has one.
- Passing `environment: cloud` or any Claude / Sonnet / Opus / Haiku model slug.
- Merging or deploying.
