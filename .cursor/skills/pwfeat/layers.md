# Layers

Placeholder map for a potencia-stack app. This is not a package table from another repo. Replace each row with this app's real directories before treating the arrows as law.

Arrows point at what a layer may import.

| Layer | Path | May import |
| --- | --- | --- |
| app | `src/app` | components, lib |
| components | `src/components` | lib |
| lib | `src/lib` | lib only |
| packs | `packs/` | nothing in `src/` (scaffold copies a pack into the app) |

Product code written under [pwfeat](SKILL.md) stays inside the worktree path the caller passed.
