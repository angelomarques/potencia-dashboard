---
name: pwfeat
description: >-
  Clean architecture when implementing a feature. Read before product code,
  including from /sub-task and /ptask. Arrows live in layers.md.
disable-model-invocation: true
---

# pwfeat

Read this skill **in full before writing product code**. Callers: `/pwfeat`, [sub-task](../sub-task/SKILL.md) (step 4), [ptask](../ptask/SKILL.md) (each slice agent). This skill does **not** replace branch/PR rules — those stay on the caller.

When the caller passed a worktree path, write product files only there. Do not edit the shared checkout.

Repo layer map: [layers.md](layers.md).

## Dependency rule

Depend only in the direction [layers.md](layers.md) allows. Do not add an import that points the other way. Do not paste another repo's package table into this skill. If `layers.md` is still the placeholder, fill its rows from this repo before adding a new cross-layer import.

Branch names, PR bases, and approval stay in [feature-branch-workflow](../feature-branch-workflow/SKILL.md). Proof stays in [verify-potencia-stack](../verify-potencia-stack/SKILL.md), run from the worktree with pnpm.
