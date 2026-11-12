#!/usr/bin/env bash
# Isolate ptask / sub-task checkouts in linked git worktrees.
# Does not switch, reset, or edit the shared checkout.
# Does not delete branches. Does not remove dirty, ignored, unpushed, or unowned work.
# There is no --force.
set -euo pipefail

if [[ "${1:-}" == "--force" || "${1:-}" == "-f" ]]; then
  echo "worktree.sh: --force is not supported" >&2
  exit 2
fi

COMMAND="${1:-}"
if [[ -z "$COMMAND" ]]; then
  COMMAND="help"
else
  shift
fi

REPO=""
SLOT=""
BRANCH=""
START_REF=""
SKILL_ROOT=""
FF_REF=""
WT_PATH=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --force|-f)
      echo "worktree.sh: --force is not supported" >&2
      exit 2
      ;;
    --repo)
      REPO="${2:-}"
      shift 2
      ;;
    --slot)
      SLOT="${2:-}"
      shift 2
      ;;
    --branch)
      BRANCH="${2:-}"
      shift 2
      ;;
    --start)
      START_REF="${2:-}"
      shift 2
      ;;
    --skill-root)
      SKILL_ROOT="${2:-}"
      shift 2
      ;;
    --fast-forward-to)
      FF_REF="${2:-}"
      shift 2
      ;;
    --path)
      WT_PATH="${2:-}"
      shift 2
      ;;
    *)
      echo "worktree.sh: unknown argument: $1" >&2
      exit 2
      ;;
  esac
done

usage() {
  cat >&2 <<'EOF'
usage:
  worktree.sh prepare --repo PATH --slot SLOT --branch BRANCH --start REF [--skill-root PATH] [--fast-forward-to REF]
  worktree.sh status  --repo PATH (--slot SLOT | --path PATH)
  worktree.sh cleanup --repo PATH (--slot SLOT | --path PATH)
  worktree.sh plan    --repo PATH --slot SLOT --branch BRANCH
  worktree.sh list    --repo PATH
EOF
  exit 2
}

case "$COMMAND" in
  prepare|status|cleanup|plan|list|help) ;;
  *)
    echo "worktree.sh: unknown command: $COMMAND" >&2
    usage
    ;;
esac

if [[ "$COMMAND" == "help" ]]; then
  usage
fi

if [[ -z "$REPO" ]]; then
  echo "worktree.sh: --repo is required" >&2
  usage
fi

PRIMARY="$(realpath "$REPO")"
if ! git -C "$PRIMARY" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "worktree.sh: --repo is not a git working tree: $PRIMARY" >&2
  exit 2
fi

COMMON="$(git -C "$PRIMARY" rev-parse --git-common-dir)"
if [[ "$COMMON" != /* ]]; then
  COMMON="$PRIMARY/$COMMON"
fi
COMMON="$(realpath "$COMMON")"

MAIN_WT="$(git -C "$PRIMARY" worktree list --porcelain | awk '/^worktree / { print substr($0, 10); exit }')"
MAIN_WT="$(realpath "$MAIN_WT")"

REG_DIR="$COMMON/ptask-worktrees/slots"
LOCK_FILE="$COMMON/ptask-worktrees/lock"
mkdir -p "$REG_DIR"

PRIMARY_SNAPSHOT=""
arm_primary_guard() {
  PRIMARY_SNAPSHOT="$(primary_snapshot)"
}

primary_snapshot() {
  local head branch status
  head="$(git -C "$PRIMARY" rev-parse HEAD)"
  branch="$(git -C "$PRIMARY" rev-parse --abbrev-ref HEAD)"
  status="$(git -C "$PRIMARY" status --porcelain=v1 | sort)"
  printf '%s\n%s\n%s\n' "$head" "$branch" "$status"
}

primary_unchanged() {
  [[ -n "$PRIMARY_SNAPSHOT" && "$(primary_snapshot)" == "$PRIMARY_SNAPSHOT" ]]
}

kv() {
  printf '%s\037%s\037%s' "$1" "$2" "$3"
}

# emit_and_exit CODE key type value ...
emit_and_exit() {
  local code="$1"
  shift
  local unchanged="true"
  if [[ -n "$PRIMARY_SNAPSHOT" ]] && ! primary_unchanged; then
    unchanged="false"
    code=4
    set -- "$(kv ok bool false)" "$(kv error str primary-changed)" \
      "$(kv message str "shared checkout changed while the helper was running")"
  fi
  PTASK_EXIT="$code" PTASK_UNCHANGED="$unchanged" python3 - "$@" <<'PY'
import json, os, sys
data = {}
for item in sys.argv[1:]:
    key, typ, value = item.split("\x1f", 2)
    if typ == "bool":
        data[key] = value == "true"
    elif typ == "int":
        data[key] = int(value)
    elif typ == "null":
        data[key] = None
    else:
        data[key] = value
data["primary_unchanged"] = os.environ["PTASK_UNCHANGED"] == "true"
if not data["primary_unchanged"]:
    data["ok"] = False
    data["error"] = "primary-changed"
json.dump(data, sys.stdout, indent=2, sort_keys=True)
sys.stdout.write("\n")
PY
  exit "$code"
}

refuse() {
  local error="$1"
  local message="$2"
  echo "worktree.sh: $error: $message" >&2
  emit_and_exit 3 \
    "$(kv ok bool false)" \
    "$(kv error str "$error")" \
    "$(kv message str "$message")" \
    "$(kv slot str "$SLOT")" \
    "$(kv branch str "$BRANCH")" \
    "$(kv path str "$WT_PATH")"
}

validate_slot() {
  if [[ ! "$SLOT" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$ ]]; then
    echo "worktree.sh: invalid --slot (use letters, digits, dot, underscore, hyphen; no slashes)" >&2
    exit 2
  fi
}

validate_branch() {
  if [[ ! "$BRANCH" =~ ^[A-Za-z0-9][A-Za-z0-9._/-]{0,200}$ ]] \
    || [[ "$BRANCH" == *..* ]] \
    || [[ "$BRANCH" == */ || "$BRANCH" == /* || "$BRANCH" == *//* ]]; then
    echo "worktree.sh: invalid --branch" >&2
    exit 2
  fi
}

require_lock() {
  mkdir -p "$(dirname "$LOCK_FILE")"
  exec 9>"$LOCK_FILE"
  flock 9
}

repo_key() {
  printf '%s' "$COMMON" | sha256sum | awk '{ print substr($1, 1, 8) }'
}

planned_path() {
  local root base
  root="${PTASK_WORKTREE_ROOT:-$(dirname "$PRIMARY")/.ptask-worktrees}"
  base="$(basename "$PRIMARY")"
  realpath -m "$root/${base}-$(repo_key)/$SLOT"
}

assert_path_outside_primary() {
  local planned="$1"
  local primary_real common_real
  primary_real="$(realpath "$PRIMARY")"
  common_real="$(realpath "$COMMON")"
  case "$planned" in
    "$primary_real"|"$primary_real"/*)
      echo "worktree.sh: worktree path must stay outside the shared checkout" >&2
      exit 2
      ;;
    "$common_real"|"$common_real"/*)
      echo "worktree.sh: worktree path must stay outside the git common dir" >&2
      exit 2
      ;;
  esac
}

registry_file() {
  printf '%s/%s.json' "$REG_DIR" "$SLOT"
}

write_registry() {
  local dest skill base_sha path
  path="$1"
  base_sha="$2"
  skill="$3"
  dest="$(registry_file)"
  python3 - "$dest" "$SLOT" "$BRANCH" "$path" "$base_sha" "$PRIMARY" "$skill" <<'PY'
import json, os, sys, tempfile
dest, slot, branch, path, base_sha, primary, skill = sys.argv[1:]
payload = {
    "version": 1,
    "slot": slot,
    "branch": branch,
    "path": path,
    "base_sha": base_sha,
    "primary": primary,
    "skill_root": skill,
}
directory = os.path.dirname(dest)
fd, tmp = tempfile.mkstemp(prefix=".tmp.", dir=directory)
try:
    with os.fdopen(fd, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, sort_keys=True)
        handle.write("\n")
    os.replace(tmp, dest)
except Exception:
    os.unlink(tmp)
    raise
PY
}

read_registry_field() {
  local slot="$1"
  local field="$2"
  local file="$REG_DIR/$slot.json"
  if [[ ! -f "$file" ]]; then
    return 1
  fi
  python3 - "$file" "$field" <<'PY'
import json, sys
with open(sys.argv[1], encoding="utf-8") as handle:
    data = json.load(handle)
value = data.get(sys.argv[2], "")
if value is None:
    value = ""
sys.stdout.write(str(value))
PY
}

worktree_path_for_branch() {
  local want="$1"
  local current="" kind="" name=""
  while IFS= read -r line || [[ -n "$line" ]]; do
    if [[ -z "$line" ]]; then
      if [[ "$kind" == "branch" && "$name" == "$want" ]]; then
        printf '%s' "$current"
        return 0
      fi
      current=""
      kind=""
      name=""
      continue
    fi
    case "$line" in
      worktree\ *)
        current="${line#worktree }"
        ;;
      branch\ *)
        kind="branch"
        name="${line#branch refs/heads/}"
        ;;
      detached)
        kind="detached"
        name=""
        ;;
    esac
  done < <(git -C "$PRIMARY" worktree list --porcelain)
  if [[ "$kind" == "branch" && "$name" == "$want" ]]; then
    printf '%s' "$current"
    return 0
  fi
  return 1
}

gitdir_of() {
  local path="$1"
  local gitdir
  gitdir="$(git -C "$path" rev-parse --git-dir)"
  if [[ "$gitdir" != /* ]]; then
    gitdir="$(realpath "$path/$gitdir")"
  else
    gitdir="$(realpath "$gitdir")"
  fi
  printf '%s' "$gitdir"
}

write_marker() {
  local path="$1"
  local base_sha="$2"
  local gitdir tmp
  gitdir="$(gitdir_of "$path")"
  tmp="$(mktemp "$gitdir/ptask-owner.tmp.XXXXXX")"
  cat >"$tmp" <<EOF
version=1
slot=$SLOT
branch=$BRANCH
base_sha=$base_sha
EOF
  mv "$tmp" "$gitdir/ptask-owner"
}

marker_file_of() {
  local path="$1"
  printf '%s/ptask-owner' "$(gitdir_of "$path")"
}

marker_field() {
  local file="$1"
  local key="$2"
  awk -F= -v k="$key" '$1==k { sub(/^[^=]*=/, ""); print; exit }' "$file"
}

path_owned_by_slot() {
  local path="$1"
  local file
  if [[ ! -d "$path" ]]; then
    return 1
  fi
  if ! git -C "$path" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    return 1
  fi
  file="$(marker_file_of "$path")"
  [[ -f "$file" ]] || return 1
  [[ "$(marker_field "$file" slot)" == "$SLOT" ]] || return 1
  [[ "$(marker_field "$file" branch)" == "$BRANCH" ]] || return 1
}

local_branch_exists() {
  git -C "$PRIMARY" show-ref --verify --quiet "refs/heads/$BRANCH"
}

origin_branch_sha() {
  git -C "$PRIMARY" rev-parse --verify --end-of-options "refs/remotes/origin/${BRANCH}^{commit}" 2>/dev/null || true
}

dirt_report() {
  local path="$1"
  python3 - "$path" <<'PY'
import subprocess, sys
path = sys.argv[1]
porcelain = subprocess.check_output(
    ["git", "-C", path, "status", "--porcelain=v1"], text=True
)
ignored = subprocess.check_output(
    ["git", "-C", path, "status", "--porcelain=v1", "--ignored=matching"],
    text=True,
)
ignored_count = sum(1 for line in ignored.splitlines() if line.startswith("!!"))
if porcelain.strip():
    reason = "uncommitted"
    dirty = True
elif ignored_count:
    reason = "ignored-files"
    dirty = True
else:
    reason = "clean"
    dirty = False
print(f"{int(dirty)}\t{reason}\t{ignored_count}")
PY
}

unique_commit_count() {
  local branch="$1"
  python3 - "$PRIMARY" "$branch" <<'PY'
import subprocess, sys
primary, branch = sys.argv[1], sys.argv[2]
refs = subprocess.check_output(
    ["git", "-C", primary, "for-each-ref", "--format=%(refname)", "refs/heads", "refs/remotes"],
    text=True,
).split()
others = [ref for ref in refs if ref != f"refs/heads/{branch}"]
tip = f"refs/heads/{branch}"
if subprocess.call(
    ["git", "-C", primary, "show-ref", "--verify", "--quiet", tip]
) != 0:
    print(0)
    raise SystemExit
if not others:
    count = subprocess.check_output(
        ["git", "-C", primary, "rev-list", "--count", tip], text=True
    ).strip()
else:
    count = subprocess.check_output(
        ["git", "-C", primary, "rev-list", "--count", tip, "--not", *others],
        text=True,
    ).strip()
print(count)
PY
}

resolve_sha() {
  local ref="$1"
  git -C "$PRIMARY" rev-parse --verify --end-of-options "${ref}^{commit}"
}

default_skill_root() {
  if [[ -n "$SKILL_ROOT" ]]; then
    realpath -m "$SKILL_ROOT"
  elif [[ -d "$PRIMARY/.cursor/skills" ]]; then
    realpath "$PRIMARY/.cursor/skills"
  else
    printf ''
  fi
}

emit_worktree_state() {
  local code="$1"
  local action="$2"
  local path="$3"
  local ff="$4"
  local head dirty_line dirty reason ignored_count owned skill
  head="$(git -C "$path" rev-parse HEAD)"
  dirty_line="$(dirt_report "$path")"
  IFS=$'\t' read -r dirty reason ignored_count <<<"$dirty_line"
  ignored_count="${ignored_count:-0}"
  if path_owned_by_slot "$path"; then
    owned="true"
  else
    owned="false"
  fi
  skill="$(default_skill_root)"
  local dirty_bool="false"
  if [[ "$dirty" == "1" ]]; then
    dirty_bool="true"
  fi
  emit_and_exit "$code" \
    "$(kv ok bool true)" \
    "$(kv action str "$action")" \
    "$(kv slot str "$SLOT")" \
    "$(kv branch str "$BRANCH")" \
    "$(kv path str "$path")" \
    "$(kv head str "$head")" \
    "$(kv start str "$START_REF")" \
    "$(kv dirty bool "$dirty_bool")" \
    "$(kv dirty_reason str "$reason")" \
    "$(kv ignored_count int "$ignored_count")" \
    "$(kv owned bool "$owned")" \
    "$(kv fast_forward str "$ff")" \
    "$(kv primary str "$PRIMARY")" \
    "$(kv primary_branch str "$(git -C "$PRIMARY" rev-parse --abbrev-ref HEAD)")" \
    "$(kv primary_head str "$(git -C "$PRIMARY" rev-parse HEAD)")" \
    "$(kv skill_root str "$skill")"
}

fast_forward_in_worktree() {
  local path="$1"
  local target="$2"
  local head dirty_line
  if [[ -z "$target" ]]; then
    printf 'not-requested'
    return 0
  fi
  target="$(resolve_sha "$target")"
  head="$(git -C "$path" rev-parse HEAD)"
  if [[ "$head" == "$target" ]]; then
    printf 'already'
    return 0
  fi
  dirty_line="$(dirt_report "$path")"
  if [[ "${dirty_line%%$'\t'*}" == "1" ]]; then
    printf 'skipped-dirty'
    return 0
  fi
  if git -C "$path" merge-base --is-ancestor "$head" "$target"; then
    git -C "$path" merge --ff-only "$target" >/dev/null
    printf 'updated'
    return 0
  fi
  printf 'diverged'
}

attach_worktree() {
  local path="$1"
  local base_sha="$2"
  local origin_sha
  mkdir -p "$(dirname "$path")"
  if [[ -e "$path" ]]; then
    WT_PATH="$path"
    refuse "path-collision" "path already exists and is not this slot's worktree: $path"
  fi
  if local_branch_exists; then
    git -C "$PRIMARY" worktree add "$path" "$BRANCH" >/dev/null
  else
    origin_sha="$(origin_branch_sha)"
    if [[ -n "$origin_sha" ]]; then
      git -C "$PRIMARY" worktree add --track -b "$BRANCH" "$path" "refs/remotes/origin/$BRANCH" >/dev/null
    else
      git -C "$PRIMARY" worktree add -b "$BRANCH" "$path" "$base_sha" >/dev/null
    fi
  fi
  write_marker "$path" "$base_sha"
}

cmd_plan() {
  validate_slot
  validate_branch
  arm_primary_guard
  local path checked=""
  path="$(planned_path)"
  assert_path_outside_primary "$path"
  if checked="$(worktree_path_for_branch "$BRANCH")"; then
    true
  else
    checked=""
  fi
  local exists="false"
  if local_branch_exists || [[ -n "$(origin_branch_sha)" ]]; then
    exists="true"
  fi
  local reg="false"
  if [[ -f "$(registry_file)" ]]; then
    reg="true"
  fi
  emit_and_exit 0 \
    "$(kv ok bool true)" \
    "$(kv action str plan)" \
    "$(kv slot str "$SLOT")" \
    "$(kv branch str "$BRANCH")" \
    "$(kv path str "$path")" \
    "$(kv branch_exists bool "$exists")" \
    "$(kv checked_out_at str "$checked")" \
    "$(kv registry bool "$reg")" \
    "$(kv primary str "$PRIMARY")"
}

cmd_list() {
  python3 - "$REG_DIR" "$PRIMARY" <<'PY'
import json, pathlib, subprocess, sys
reg_dir = pathlib.Path(sys.argv[1])
primary = sys.argv[2]
items = []
for path in sorted(reg_dir.glob("*.json")):
    data = json.loads(path.read_text(encoding="utf-8"))
    items.append(data)
snap_head = subprocess.check_output(["git", "-C", primary, "rev-parse", "HEAD"], text=True).strip()
snap_branch = subprocess.check_output(["git", "-C", primary, "rev-parse", "--abbrev-ref", "HEAD"], text=True).strip()
json.dump({"ok": True, "primary": primary, "primary_head": snap_head, "primary_branch": snap_branch, "worktrees": items}, sys.stdout, indent=2, sort_keys=True)
sys.stdout.write("\n")
PY
  if [[ -n "$PRIMARY_SNAPSHOT" ]] && ! primary_unchanged; then
    echo "worktree.sh: shared checkout changed during list" >&2
    exit 4
  fi
}

cmd_prepare() {
  validate_slot
  validate_branch
  if [[ -z "$START_REF" ]]; then
    echo "worktree.sh: prepare requires --start" >&2
    usage
  fi
  arm_primary_guard
  require_lock
  local base_sha path existing ff action reg_branch reg_path
  if ! base_sha="$(resolve_sha "$START_REF")"; then
    refuse "missing-start" "start ref does not resolve: $START_REF"
  fi
  if [[ -n "$FF_REF" ]] && ! resolve_sha "$FF_REF" >/dev/null; then
    refuse "missing-start" "fast-forward ref does not resolve: $FF_REF"
  fi
  START_REF="$base_sha"
  path="$(planned_path)"
  assert_path_outside_primary "$path"
  existing="$(worktree_path_for_branch "$BRANCH" || true)"
  if [[ -n "$existing" && ! -d "$existing" ]]; then
    WT_PATH="$existing"
    refuse "stale-worktree" "branch $BRANCH is still registered at missing path $existing; refusing to prune automatically"
  fi
  if [[ -n "$existing" ]]; then
    existing="$(realpath "$existing")"
    if [[ "$existing" == "$MAIN_WT" ]]; then
      WT_PATH="$existing"
      refuse "locked-by-shared-checkout" "branch $BRANCH is checked out in the shared checkout; refusing to switch it"
    fi
    if ! path_owned_by_slot "$existing"; then
      WT_PATH="$existing"
      refuse "branch-collision" "branch $BRANCH is already checked out in an unowned worktree at $existing"
    fi
    path="$existing"
    action="resumed"
  elif [[ -f "$(registry_file)" ]]; then
    reg_branch="$(read_registry_field "$SLOT" branch || true)"
    reg_path="$(read_registry_field "$SLOT" path || true)"
    WT_PATH="$reg_path"
    if [[ -n "$reg_branch" && "$reg_branch" != "$BRANCH" ]]; then
      refuse "slot-collision" "slot $SLOT is already registered for branch $reg_branch"
    fi
    if [[ -d "$reg_path" ]] && path_owned_by_slot "$reg_path"; then
      path="$reg_path"
      action="resumed"
    elif [[ ! -d "$reg_path" ]]; then
      refuse "stale-worktree" "registered worktree is missing at $reg_path; refusing to prune other worktrees automatically"
    else
      refuse "unowned" "registered path is not owned by slot $SLOT"
    fi
  else
    attach_worktree "$path" "$base_sha"
    action="created"
  fi
  if [[ -f "$(registry_file)" ]]; then
    reg_branch="$(read_registry_field "$SLOT" branch || true)"
    reg_path="$(read_registry_field "$SLOT" path || true)"
    if [[ -n "$reg_branch" && "$reg_branch" != "$BRANCH" && -d "$reg_path" ]]; then
      WT_PATH="$reg_path"
      refuse "slot-collision" "slot $SLOT is already registered for branch $reg_branch"
    fi
  fi
  local marker base_recorded skill
  marker="$(marker_file_of "$path")"
  base_recorded="$(marker_field "$marker" base_sha)"
  skill="$(default_skill_root)"
  write_registry "$path" "$base_recorded" "$skill"
  if ! ff="$(fast_forward_in_worktree "$path" "$FF_REF")"; then
    ff="missing-ff"
  fi
  emit_worktree_state 0 "$action" "$path" "$ff"
}

resolve_from_slot_or_path() {
  if [[ -n "$SLOT" && -n "$WT_PATH" ]]; then
    echo "worktree.sh: pass only one of --slot or --path" >&2
    usage
  fi
  if [[ -n "$SLOT" ]]; then
    validate_slot
    if [[ ! -f "$(registry_file)" ]]; then
      refuse "missing-slot" "no registered worktree for slot $SLOT"
    fi
    BRANCH="$(read_registry_field "$SLOT" branch)"
    WT_PATH="$(read_registry_field "$SLOT" path)"
    validate_branch
    return 0
  fi
  if [[ -z "$WT_PATH" ]]; then
    echo "worktree.sh: --slot or --path is required" >&2
    usage
  fi
  if [[ ! -d "$WT_PATH" ]]; then
    refuse "missing-path" "worktree path does not exist: $WT_PATH"
  fi
  WT_PATH="$(realpath "$WT_PATH")"
  local marker=""
  if git -C "$WT_PATH" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    marker="$(marker_file_of "$WT_PATH")"
  fi
  if [[ -z "$marker" || ! -f "$marker" ]]; then
    refuse "unowned" "worktree has no ptask ownership marker: $WT_PATH"
  fi
  SLOT="$(marker_field "$marker" slot)"
  BRANCH="$(marker_field "$marker" branch)"
  validate_slot
  validate_branch
}

cmd_status() {
  arm_primary_guard
  resolve_from_slot_or_path
  if [[ ! -d "$WT_PATH" ]]; then
    refuse "missing-path" "worktree path does not exist: $WT_PATH"
  fi
  emit_worktree_state 0 "status" "$WT_PATH" "not-requested"
}

cmd_cleanup() {
  arm_primary_guard
  require_lock
  resolve_from_slot_or_path
  if [[ ! -d "$WT_PATH" ]]; then
    refuse "missing-path" "worktree path does not exist: $WT_PATH"
  fi
  WT_PATH="$(realpath "$WT_PATH")"
  if [[ "$WT_PATH" == "$MAIN_WT" ]]; then
    refuse "shared-checkout" "refusing to remove the shared checkout"
  fi
  local marker=""
  if ! git -C "$WT_PATH" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    refuse "unowned" "path is not a git worktree: $WT_PATH"
  fi
  marker="$(marker_file_of "$WT_PATH")"
  if [[ ! -f "$marker" ]]; then
    refuse "unowned" "worktree has no ptask ownership marker: $WT_PATH"
  fi
  if [[ "$(marker_field "$marker" slot)" != "$SLOT" || "$(marker_field "$marker" branch)" != "$BRANCH" ]]; then
    refuse "unowned" "ownership marker does not match slot $SLOT branch $BRANCH"
  fi
  local actual_branch
  actual_branch="$(git -C "$WT_PATH" rev-parse --abbrev-ref HEAD)"
  if [[ "$actual_branch" != "$BRANCH" ]]; then
    refuse "branch-mismatch" "worktree HEAD is $actual_branch, expected $BRANCH"
  fi
  local dirty_line dirty reason ignored_count
  dirty_line="$(dirt_report "$WT_PATH")"
  IFS=$'\t' read -r dirty reason ignored_count <<<"$dirty_line"
  ignored_count="${ignored_count:-0}"
  if [[ "$dirty" == "1" ]]; then
    refuse "dirty" "refusing to remove worktree with $reason (ignored_count=$ignored_count)"
  fi
  local unique
  unique="$(unique_commit_count "$BRANCH")"
  if [[ "$unique" != "0" ]]; then
    refuse "unpushed" "branch $BRANCH has $unique commit(s) not on another branch or remote; refusing to remove the only checkout"
  fi
  if ! git -C "$PRIMARY" worktree remove "$WT_PATH"; then
    refuse "remove-failed" "git worktree remove failed for $WT_PATH"
  fi
  if [[ -d "$WT_PATH" ]]; then
    refuse "remove-failed" "worktree path still exists after remove: $WT_PATH"
  fi
  rm -f "$(registry_file)"
  emit_and_exit 0 \
    "$(kv ok bool true)" \
    "$(kv action str removed)" \
    "$(kv slot str "$SLOT")" \
    "$(kv branch str "$BRANCH")" \
    "$(kv path str "$WT_PATH")" \
    "$(kv branch_kept bool true)" \
    "$(kv primary str "$PRIMARY")"
}

case "$COMMAND" in
  plan) cmd_plan ;;
  list)
    arm_primary_guard
    cmd_list
    ;;
  prepare) cmd_prepare ;;
  status) cmd_status ;;
  cleanup) cmd_cleanup ;;
  *) usage ;;
esac
