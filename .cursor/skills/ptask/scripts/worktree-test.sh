#!/usr/bin/env bash
# Disposable-repo proof for ptask worktree isolation.
# Creates temporary git repositories only. Does not touch the caller's checkout.
set -euo pipefail

HELPER="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/worktree.sh"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
PASS=0
FAIL=0
TMP="$(mktemp -d)"
KEEP_TMP=0

fail() {
  FAIL=$((FAIL + 1))
  KEEP_TMP=1
  printf 'FAIL %s\n' "$*" >&2
}

ok() {
  PASS=$((PASS + 1))
  printf 'PASS %s\n' "$*"
}

finish() {
  printf 'RESULTS pass=%s fail=%s tmp=%s\n' "$PASS" "$FAIL" "$TMP"
  if [[ "$KEEP_TMP" -eq 0 ]]; then
    rm -rf "$TMP"
  fi
  if [[ "$FAIL" -ne 0 ]]; then
    exit 1
  fi
}
trap finish EXIT

require() {
  local label="$1"
  shift
  if "$@"; then
    ok "$label"
  else
    fail "$label"
  fi
}

json_get() {
  local file="$1"
  local key="$2"
  python3 - "$file" "$key" <<'PY'
import json, sys
data = json.load(open(sys.argv[1], encoding="utf-8"))
value = data
for part in sys.argv[2].split("."):
    if isinstance(value, dict):
        value = value[part]
    else:
        raise SystemExit(f"missing {part}")
if value is True:
    print("true")
elif value is False:
    print("false")
elif value is None:
    print("")
else:
    print(value)
PY
}

run_helper() {
  local stdout="$1"
  local stderr="$2"
  shift 2
  set +e
  "$HELPER" "$@" >"$stdout" 2>"$stderr"
  local code=$?
  set -e
  printf '%s' "$code"
}

snapshot() {
  local repo="$1"
  {
    git -C "$repo" rev-parse HEAD
    git -C "$repo" rev-parse --abbrev-ref HEAD
    git -C "$repo" status --porcelain=v1 | sort
    if [[ -f "$repo/DIRTY.txt" ]]; then
      sha256sum "$repo/DIRTY.txt"
    fi
  } | sha256sum | awk '{ print $1 }'
}

init_repo() {
  local repo="$1"
  git init -q -b main "$repo"
  git -C "$repo" config user.email "worktree-test@example.com"
  git -C "$repo" config user.name "Worktree Test"
  printf 'base\n' >"$repo/README.md"
  printf '*.secret\n' >"$repo/.gitignore"
  printf 'keep-me\n' >"$repo/DIRTY.txt"
  git -C "$repo" add README.md .gitignore
  git -C "$repo" commit -q -m base
}

assert_primary() {
  local label="$1"
  local before="$2"
  local repo="$3"
  local after
  after="$(snapshot "$repo")"
  if [[ "$before" == "$after" ]]; then
    ok "$label"
  else
    fail "$label (shared checkout changed)"
    git -C "$repo" status --porcelain=v1 >&2 || true
  fi
}

# The helper must not invoke checkout, switch, reset, clean, branch delete, or force-remove.
if grep -nE '^[[:space:]]*[^#].*\bgit[[:space:]]+(checkout|switch|reset|clean)\b|^[[:space:]]*[^#].*worktree remove --force|^[[:space:]]*[^#].*\bgit[[:space:]]+branch[[:space:]]+-[dD]\b|^[[:space:]]*[^#].*push --force' "$HELPER"; then
  fail "helper contains a forbidden git invocation"
else
  ok "helper source has no checkout, reset, clean, branch delete, or force remove"
fi

REPO="$TMP/repo"
WT_ROOT="$TMP/wts"
init_repo "$REPO"
export PTASK_WORKTREE_ROOT="$WT_ROOT"
BEFORE="$(snapshot "$REPO")"

PLAN_OUT="$TMP/plan.json"
PLAN_ERR="$TMP/plan.err"
code="$(run_helper "$PLAN_OUT" "$PLAN_ERR" plan --repo "$REPO" --slot "slice-a" --branch "feature/task/slice-a")"
require "plan exits 0" test "$code" = "0"
PATH_A="$(json_get "$PLAN_OUT" path)"
case "$PATH_A" in
  "$REPO"|"$REPO"/*) fail "planned path is inside the shared checkout: $PATH_A" ;;
  *) ok "planned path is outside the shared checkout" ;;
esac
assert_primary "plan leaves the shared checkout untouched" "$BEFORE" "$REPO"

mkdir -p "$PATH_A"
printf 'foreign\n' >"$PATH_A/SENTINEL"
code="$(run_helper "$TMP/collide.json" "$TMP/collide.err" prepare --repo "$REPO" --slot "slice-a" --branch "feature/task/slice-a" --start HEAD)"
require "path collision exits 3" test "$code" = "3"
require "path collision error" test "$(json_get "$TMP/collide.json" error)" = "path-collision"
require "foreign sentinel kept" test "$(cat "$PATH_A/SENTINEL")" = "foreign"
assert_primary "path collision leaves the shared checkout untouched" "$BEFORE" "$REPO"
rm -rf "$PATH_A"

code="$(run_helper "$TMP/badstart.json" "$TMP/badstart.err" prepare --repo "$REPO" --slot "slice-a" --branch "feature/task/slice-a" --start "refs/heads/missing-start")"
require "missing start exits 3" test "$code" = "3"
require "missing start error" test "$(json_get "$TMP/badstart.json" error)" = "missing-start"
assert_primary "missing start leaves the shared checkout untouched" "$BEFORE" "$REPO"

code="$(run_helper "$TMP/badslot.json" "$TMP/badslot.err" prepare --repo "$REPO" --slot "../evil" --branch "feature/task/slice-a" --start HEAD)"
require "path traversal slot exits 2" test "$code" = "2"
assert_primary "bad slot leaves the shared checkout untouched" "$BEFORE" "$REPO"

# Concurrent distinct slices while the shared checkout is dirty.
: >"$TMP/a.json" >"$TMP/b.json"
set +e
"$HELPER" prepare --repo "$REPO" --slot "slice-a" --branch "feature/task/slice-a" --start HEAD >"$TMP/a.json" 2>"$TMP/a.err" &
pid_a=$!
"$HELPER" prepare --repo "$REPO" --slot "slice-b" --branch "feature/task/slice-b" --start HEAD >"$TMP/b.json" 2>"$TMP/b.err" &
pid_b=$!
wait "$pid_a"
code_a=$?
wait "$pid_b"
code_b=$?
set -e
require "concurrent slice A exits 0" test "$code_a" = "0"
require "concurrent slice B exits 0" test "$code_b" = "0"
PATH_A="$(json_get "$TMP/a.json" path)"
PATH_B="$(json_get "$TMP/b.json" path)"
require "concurrent paths differ" test "$PATH_A" != "$PATH_B"
require "slice A created" test "$(json_get "$TMP/a.json" action)" = "created"
require "slice B created" test "$(json_get "$TMP/b.json" action)" = "created"
require "slice A branch" test "$(git -C "$PATH_A" rev-parse --abbrev-ref HEAD)" = "feature/task/slice-a"
require "slice B branch" test "$(git -C "$PATH_B" rev-parse --abbrev-ref HEAD)" = "feature/task/slice-b"
printf 'from-a\n' >"$PATH_A/from-a.txt"
printf 'from-b\n' >"$PATH_B/from-b.txt"
git -C "$PATH_A" add from-a.txt
git -C "$PATH_A" commit -q -m "slice a"
git -C "$PATH_B" add from-b.txt
git -C "$PATH_B" commit -q -m "slice b"
require "slice A does not see slice B file" test ! -e "$PATH_A/from-b.txt"
require "slice B does not see slice A file" test ! -e "$PATH_B/from-a.txt"
require "shared checkout has neither slice file" test ! -e "$REPO/from-a.txt" -a ! -e "$REPO/from-b.txt"
assert_primary "concurrent prepares and slice commits leave the dirty shared checkout untouched" "$BEFORE" "$REPO"

# Branch collision and resume of a dirty failed task.
code="$(run_helper "$TMP/branch-collide.json" "$TMP/branch-collide.err" prepare --repo "$REPO" --slot "slice-c" --branch "feature/task/slice-a" --start HEAD)"
require "branch collision exits 3" test "$code" = "3"
require "branch collision error" test "$(json_get "$TMP/branch-collide.json" error)" = "branch-collision"
require "owned worktree still present after collision" test -d "$PATH_A"
assert_primary "branch collision leaves the shared checkout untouched" "$BEFORE" "$REPO"

printf 'unfinished\n' >"$PATH_A/UNFINISHED.txt"
code="$(run_helper "$TMP/resume.json" "$TMP/resume.err" prepare --repo "$REPO" --slot "slice-a" --branch "feature/task/slice-a" --start HEAD)"
require "resume exits 0" test "$code" = "0"
require "resume action" test "$(json_get "$TMP/resume.json" action)" = "resumed"
require "resume same path" test "$(json_get "$TMP/resume.json" path)" = "$PATH_A"
require "resume reports dirty" test "$(json_get "$TMP/resume.json" dirty)" = "true"
require "unfinished file kept" test "$(cat "$PATH_A/UNFINISHED.txt")" = "unfinished"
assert_primary "resume leaves the shared checkout untouched" "$BEFORE" "$REPO"

code="$(run_helper "$TMP/clean-dirty.json" "$TMP/clean-dirty.err" cleanup --repo "$REPO" --slot "slice-a")"
require "dirty cleanup exits 3" test "$code" = "3"
require "dirty cleanup error" test "$(json_get "$TMP/clean-dirty.json" error)" = "dirty"
require "dirty worktree kept" test -f "$PATH_A/UNFINISHED.txt"
assert_primary "dirty cleanup leaves the shared checkout untouched" "$BEFORE" "$REPO"
rm "$PATH_A/UNFINISHED.txt"

# Ignored files (evidence, secrets, dependency installs) block cleanup.
printf 'token-looking\n' >"$PATH_A/local.secret"
code="$(run_helper "$TMP/clean-ignored.json" "$TMP/clean-ignored.err" cleanup --repo "$REPO" --slot "slice-a")"
require "ignored-file cleanup exits 3" test "$code" = "3"
require "ignored-file cleanup error" test "$(json_get "$TMP/clean-ignored.json" error)" = "dirty"
require "ignored file kept" test -f "$PATH_A/local.secret"
assert_primary "ignored cleanup leaves the shared checkout untouched" "$BEFORE" "$REPO"
rm "$PATH_A/local.secret"

# Unpushed commits block cleanup. The branch and commit stay.
code="$(run_helper "$TMP/clean-unpushed.json" "$TMP/clean-unpushed.err" cleanup --repo "$REPO" --slot "slice-a")"
require "unpushed cleanup exits 3" test "$code" = "3"
require "unpushed cleanup error" test "$(json_get "$TMP/clean-unpushed.json" error)" = "unpushed"
require "unpushed commit still on branch" git -C "$REPO" merge-base --is-ancestor "$(git -C "$PATH_A" rev-parse HEAD)" "feature/task/slice-a"
require "unpushed worktree kept" test -d "$PATH_A"
assert_primary "unpushed cleanup leaves the shared checkout untouched" "$BEFORE" "$REPO"

# Same-slot concurrent resume stays on one path.
set +e
"$HELPER" prepare --repo "$REPO" --slot "slice-a" --branch "feature/task/slice-a" --start HEAD >"$TMP/r1.json" 2>"$TMP/r1.err" &
pid_a=$!
"$HELPER" prepare --repo "$REPO" --slot "slice-a" --branch "feature/task/slice-a" --start HEAD >"$TMP/r2.json" 2>"$TMP/r2.err" &
pid_b=$!
wait "$pid_a"; code_a=$?
wait "$pid_b"; code_b=$?
set -e
require "same-slot concurrent first exits 0" test "$code_a" = "0"
require "same-slot concurrent second exits 0" test "$code_b" = "0"
require "same-slot concurrent paths match" test "$(json_get "$TMP/r1.json" path)" = "$(json_get "$TMP/r2.json" path)"
assert_primary "same-slot resume leaves the shared checkout untouched" "$BEFORE" "$REPO"

# Later slice starts from the previous slice branch, not from the shared HEAD.
code="$(run_helper "$TMP/slice2.json" "$TMP/slice2.err" prepare --repo "$REPO" --slot "slice-2" --branch "feature/task/slice-2" --start "feature/task/slice-a")"
require "dependent slice exits 0" test "$code" = "0"
PATH_2="$(json_get "$TMP/slice2.json" path)"
require "dependent slice contains previous file" test "$(cat "$PATH_2/from-a.txt")" = "from-a"
require "previous slice still has its file" test "$(cat "$PATH_A/from-a.txt")" = "from-a"
require "shared checkout still lacks the slice file" test ! -e "$REPO/from-a.txt"
assert_primary "dependent slice leaves the shared checkout untouched" "$BEFORE" "$REPO"

# Fast-forward updates only a clean slice worktree. A diverged or dirty slice is not reset.
code="$(run_helper "$TMP/ffprep.json" "$TMP/ffprep.err" prepare --repo "$REPO" --slot "slice-ff" --branch "feature/task/slice-ff" --start HEAD)"
require "fast-forward fixture exits 0" test "$code" = "0"
PATH_FF="$(json_get "$TMP/ffprep.json" path)"
printf 'main-2\n' >>"$REPO/README.md"
git -C "$REPO" add README.md
git -C "$REPO" commit -q -m "main moves"
BEFORE_MOVED="$(snapshot "$REPO")"
code="$(run_helper "$TMP/ff.json" "$TMP/ff.err" prepare --repo "$REPO" --slot "slice-ff" --branch "feature/task/slice-ff" --start HEAD --fast-forward-to HEAD)"
require "fast-forward exits 0" test "$code" = "0"
require "fast-forward updated" test "$(json_get "$TMP/ff.json" fast_forward)" = "updated"
require "slice ff received the main commit" test "$(git -C "$PATH_FF" rev-parse HEAD)" = "$(git -C "$REPO" rev-parse HEAD)"
require "slice B was not moved by the other slice's fast-forward" test "$(git -C "$PATH_B" rev-parse HEAD)" != "$(git -C "$REPO" rev-parse HEAD)"
assert_primary "fast-forward leaves the shared checkout untouched" "$BEFORE_MOVED" "$REPO"

printf 'local-only\n' >"$PATH_B/local-only.txt"
git -C "$PATH_B" add local-only.txt
git -C "$PATH_B" commit -q -m "diverge"
DIVERGED_HEAD="$(git -C "$PATH_B" rev-parse HEAD)"
printf 'main-3\n' >>"$REPO/README.md"
git -C "$REPO" add README.md
git -C "$REPO" commit -q -m "main diverges"
BEFORE_DIV="$(snapshot "$REPO")"
code="$(run_helper "$TMP/div.json" "$TMP/div.err" prepare --repo "$REPO" --slot "slice-b" --branch "feature/task/slice-b" --start HEAD --fast-forward-to HEAD)"
require "diverged fast-forward exits 0" test "$code" = "0"
require "diverged fast-forward reported" test "$(json_get "$TMP/div.json" fast_forward)" = "diverged"
require "diverged commit kept" test "$(git -C "$PATH_B" rev-parse HEAD)" = "$DIVERGED_HEAD"
assert_primary "diverged fast-forward leaves the shared checkout untouched" "$BEFORE_DIV" "$REPO"

printf 'dirty-ff\n' >"$PATH_2/DIRTY-WT.txt"
code="$(run_helper "$TMP/ffdirty.json" "$TMP/ffdirty.err" prepare --repo "$REPO" --slot "slice-2" --branch "feature/task/slice-2" --start "feature/task/slice-a" --fast-forward-to HEAD)"
require "dirty fast-forward exits 0" test "$code" = "0"
require "dirty fast-forward skipped" test "$(json_get "$TMP/ffdirty.json" fast_forward)" = "skipped-dirty"
require "dirty fast-forward kept the edit" test "$(cat "$PATH_2/DIRTY-WT.txt")" = "dirty-ff"
assert_primary "dirty fast-forward leaves the shared checkout untouched" "$BEFORE_DIV" "$REPO"
rm "$PATH_2/DIRTY-WT.txt"

# Shared checkout already has the branch: do not switch it.
git -C "$REPO" branch "feature/task/locked" HEAD
git -C "$REPO" checkout -q "feature/task/locked"
printf 'still-dirty\n' >>"$REPO/DIRTY.txt"
LOCKED_BEFORE="$(snapshot "$REPO")"
code="$(run_helper "$TMP/locked.json" "$TMP/locked.err" prepare --repo "$REPO" --slot "locked" --branch "feature/task/locked" --start HEAD)"
require "locked branch exits 3" test "$code" = "3"
require "locked branch error" test "$(json_get "$TMP/locked.json" error)" = "locked-by-shared-checkout"
require "shared checkout stayed on the locked branch" test "$(git -C "$REPO" rev-parse --abbrev-ref HEAD)" = "feature/task/locked"
assert_primary "locked branch refusal leaves the shared checkout untouched" "$LOCKED_BEFORE" "$REPO"
git -C "$REPO" checkout -q main
BEFORE_BACK="$(snapshot "$REPO")"

# Unowned worktree is not removed. --force is rejected and removes nothing.
UNOWNED="$TMP/unowned"
git -C "$REPO" branch "feature/task/unowned" HEAD
git -C "$REPO" worktree add -q "$UNOWNED" "feature/task/unowned"
code="$(run_helper "$TMP/unowned.json" "$TMP/unowned.err" cleanup --repo "$REPO" --path "$UNOWNED")"
require "unowned cleanup exits 3" test "$code" = "3"
require "unowned cleanup error" test "$(json_get "$TMP/unowned.json" error)" = "unowned"
require "unowned worktree kept" test -d "$UNOWNED"
assert_primary "unowned cleanup leaves the shared checkout untouched" "$BEFORE_BACK" "$REPO"

# slice-2 has no unique commits beyond slice-a after we only created it... it was created from slice-a
# and may include slice-a's unique commit, which is NOT on main. unique commits exist via slice-a branch,
# so slice-2's commits are also on slice-a. A clean slice with no commits of its own can be removed.
# slice-b has unique diverged commit, so cleanup must refuse even if we ask with --force.
code="$(run_helper "$TMP/force.json" "$TMP/force.err" cleanup --repo "$REPO" --slot "slice-b" --force)"
require "force cleanup exits 2" test "$code" = "2"
require "force cleanup kept the worktree" test -d "$PATH_B"
assert_primary "rejected force cleanup leaves the shared checkout untouched" "$BEFORE_BACK" "$REPO"

# Push slice B, then a clean pushed worktree can be removed. The branch stays.
ORIGIN="$TMP/origin.git"
git init -q --bare "$ORIGIN"
git -C "$REPO" remote add origin "$ORIGIN"
git -C "$PATH_B" push -q -u origin "feature/task/slice-b"
# The push does not touch the primary index. DIRTY.txt is still unstaged on main,
# but primary HEAD is main and was not moved by the push.
BEFORE_PUSH="$(snapshot "$REPO")"
code="$(run_helper "$TMP/removed.json" "$TMP/removed.err" cleanup --repo "$REPO" --slot "slice-b")"
require "pushed cleanup exits 0" test "$code" = "0"
require "pushed cleanup removed the directory" test ! -d "$PATH_B"
require "pushed cleanup kept the branch" git -C "$REPO" show-ref --verify --quiet "refs/heads/feature/task/slice-b"
require "origin still has the branch" git -C "$REPO" show-ref --verify --quiet "refs/remotes/origin/feature/task/slice-b"
assert_primary "pushed cleanup leaves the shared checkout untouched" "$BEFORE_PUSH" "$REPO"

# Empty attached worktree with no unique commits can be removed, branch kept.
code="$(run_helper "$TMP/empty.json" "$TMP/empty.err" prepare --repo "$REPO" --slot "slice-empty" --branch "feature/task/empty" --start HEAD)"
require "empty slice exits 0" test "$code" = "0"
EMPTY_PATH="$(json_get "$TMP/empty.json" path)"
code="$(run_helper "$TMP/empty-rm.json" "$TMP/empty-rm.err" cleanup --repo "$REPO" --slot "slice-empty")"
require "empty cleanup exits 0" test "$code" = "0"
require "empty worktree removed" test ! -d "$EMPTY_PATH"
require "empty branch kept" git -C "$REPO" show-ref --verify --quiet "refs/heads/feature/task/empty"
assert_primary "empty cleanup leaves the shared checkout untouched" "$BEFORE_PUSH" "$REPO"

if python3 - "$ROOT" <<'PY'
import pathlib, re, sys
root = pathlib.Path(sys.argv[1])
files = [
    root / ".cursor/skills/ptask/SKILL.md",
    root / ".cursor/skills/sub-task/SKILL.md",
    root / ".cursor/skills/pwfeat/SKILL.md",
    root / ".cursor/skills/pwfeat/layers.md",
    root / ".cursor/skills/feature-branch-workflow/SKILL.md",
    root / ".cursor/skills/verify-potencia-stack/SKILL.md",
]
missing = []
link_re = re.compile(r"\[[^\]]+\]\(([^)]+)\)")
for path in files:
    text = path.read_text(encoding="utf-8")
    for match in link_re.finditer(text):
        target = match.group(1).split("#", 1)[0]
        if not target or target.startswith(("http://", "https://", "mailto:")):
            continue
        resolved = (path.parent / target).resolve()
        if not resolved.exists():
            missing.append(f"{path.relative_to(root)} -> {target}")
if missing:
    raise SystemExit("missing links:\n" + "\n".join(missing))
print(f"checked {len(files)} skill files")
PY
then
  ok "relative skill links resolve"
else
  fail "relative skill links resolve"
fi
