# Worktree-Shared Dev State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Modify `restart-intranet.sh` so that running it from any worktree anchors persistent dev state (SQLite DB, JSON room snapshots, custom cards, card art, BGA local images) to the MAIN repo, eliminating per-worktree state divergence.

**Architecture:** Resolve `MAIN_REPO_DIR` via `git rev-parse --git-common-dir` at script start; derive `DB_DIR` / `PERSISTED_ROOMS_DIR` / `CUSTOM_CARD_DIR` / `CARD_ART_DIR` / `BGA_IMAGE_DIR` from it (each respects an externally-set env var as override); pass them to the backend as env vars. Server defaults stay unchanged (still `process.cwd()` when env vars are absent).

**Tech Stack:** Bash, git worktrees, the existing Node.js backend (no server-side code changes).

**Spec:** `docs/superpowers/specs/2026-04-23-worktree-shared-state-design.md`

---

## File Structure

| File | Operation | Responsibility |
|---|---|---|
| `restart-intranet.sh` | Modify | Insert path-resolution block; pass env vars to backend; print resolved paths in startup banner |

Single-file change. No tests, no new files.

---

## Task 1: Modify `restart-intranet.sh`

**Files:**
- Modify: `restart-intranet.sh`

**Background:** The current script `cd "$SCRIPT_DIR"` (which becomes the worktree root when invoked from a worktree) and starts the backend without setting any path-related env vars. The server defaults to `process.cwd()`-relative paths, so each worktree gets its own `./data/` and `./output/`. This task changes that to anchor those paths to the main repo.

- [ ] **Step 1.1: Read the current script**

Read `restart-intranet.sh` (264 lines). Note exact location of:
- `SCRIPT_DIR=` line near the top (around line 4)
- The backend `start_and_wait` invocation (around line 231-236)
- The startup banner block starting with `echo "=== Open Agricola (intranet) ==="` (around line 245)

- [ ] **Step 1.2: Insert the path-resolution block immediately after `SCRIPT_DIR=...` and the existing constants block**

Find the existing block:

```bash
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_BIN="$SCRIPT_DIR/node_modules/.bin/tsx"
FRONTEND_BIN="$SCRIPT_DIR/node_modules/.bin/vite"
BACKEND_PORT=5175
FRONTEND_PORT=5173
BACKEND_LOG="$SCRIPT_DIR/backend.log"
FRONTEND_LOG="$SCRIPT_DIR/frontend.log"
# Local BGA image directory (sibling repo). Vite + backend will serve
# /bga-img/* from here first, falling back to the BGA CDN if missing.
BGA_IMAGE_DIR="${BGA_IMAGE_DIR:-../bga-agricola/img}"
```

Replace the `BGA_IMAGE_DIR=` line at the end and append the new resolution block, so the result is:

```bash
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_BIN="$SCRIPT_DIR/node_modules/.bin/tsx"
FRONTEND_BIN="$SCRIPT_DIR/node_modules/.bin/vite"
BACKEND_PORT=5175
FRONTEND_PORT=5173
BACKEND_LOG="$SCRIPT_DIR/backend.log"
FRONTEND_LOG="$SCRIPT_DIR/frontend.log"

# Anchor persistent dev state (sqlite DB, JSON room snapshots, custom cards,
# card art, BGA local images) to the MAIN repo even when we're running from
# a worktree. Without this, each worktree gets its own ./data and ./output,
# so dev2/dev3/dev4 game state diverges across worktrees.
#
# Override: pass the env var explicitly to escape this anchor (e.g.
#   DB_DIR=/tmp/foo PERSISTED_ROOMS_DIR=/tmp/bar ./restart-intranet.sh
# ).
MAIN_REPO_DIR="$(cd "$(dirname "$(git -C "$SCRIPT_DIR" rev-parse --git-common-dir)")" && pwd)"
SHARED_DATA_DIR="${SHARED_DATA_DIR:-$MAIN_REPO_DIR/data}"
SHARED_OUTPUT_DIR="${SHARED_OUTPUT_DIR:-$MAIN_REPO_DIR/output}"

DB_DIR="${DB_DIR:-$SHARED_DATA_DIR}"
PERSISTED_ROOMS_DIR="${PERSISTED_ROOMS_DIR:-$SHARED_OUTPUT_DIR}"
CUSTOM_CARD_DIR="${CUSTOM_CARD_DIR:-$SHARED_DATA_DIR/custom-cards}"
CARD_ART_DIR="${CARD_ART_DIR:-$SHARED_DATA_DIR/card-art}"
# BGA images live as a sibling of the MAIN repo, not the worktree.
if [ -z "${BGA_IMAGE_DIR:-}" ]; then
  BGA_IMAGE_DIR="$(cd "$MAIN_REPO_DIR/.." 2>/dev/null && pwd)/bga-agricola/img"
fi
```

(Note: the old line `BGA_IMAGE_DIR="${BGA_IMAGE_DIR:-../bga-agricola/img}"` is replaced by the `if [ -z ...]` block at the bottom — it now anchors to the main repo's parent instead of the worktree's parent.)

- [ ] **Step 1.3: Add the new env vars to the backend launch**

Find the existing block (around line 231-236):

```bash
echo "Starting backend (port $BACKEND_PORT on $LAN_IP, dev2/dev3/dev4 persisted via SQLite)..."
start_and_wait "backend" "$BACKEND_PORT" "$BACKEND_LOG" env \
  PERSIST_ROOMS=sqlite \
  ALLOW_ANONYMOUS_WS=true \
  BACKEND_HOST="$LAN_IP" \
  BGA_IMAGE_DIR="$BGA_IMAGE_DIR" \
  "$BACKEND_BIN" "$SCRIPT_DIR/server/index.ts"
```

Replace with:

```bash
echo "Starting backend (port $BACKEND_PORT on $LAN_IP, dev2/dev3/dev4 persisted via SQLite)..."
start_and_wait "backend" "$BACKEND_PORT" "$BACKEND_LOG" env \
  PERSIST_ROOMS=sqlite \
  ALLOW_ANONYMOUS_WS=true \
  BACKEND_HOST="$LAN_IP" \
  BGA_IMAGE_DIR="$BGA_IMAGE_DIR" \
  DB_DIR="$DB_DIR" \
  PERSISTED_ROOMS_DIR="$PERSISTED_ROOMS_DIR" \
  CUSTOM_CARD_DIR="$CUSTOM_CARD_DIR" \
  CARD_ART_DIR="$CARD_ART_DIR" \
  "$BACKEND_BIN" "$SCRIPT_DIR/server/index.ts"
```

Frontend launch (the `start_and_wait "frontend" ...` block immediately after) stays unchanged — vite only needs `BACKEND_HOST` + `BGA_IMAGE_DIR`.

- [ ] **Step 1.4: Add the path dump to the startup banner**

Find the line:

```bash
echo "=== Open Agricola (intranet) ==="
```

Insert the following block immediately BEFORE that line (so it appears just before the banner):

```bash
echo ""
echo "Persistent dev state:"
echo "  DB_DIR             = $DB_DIR"
echo "  PERSISTED_ROOMS_DIR= $PERSISTED_ROOMS_DIR"
echo "  CARD_ART_DIR       = $CARD_ART_DIR"
echo "  BGA_IMAGE_DIR      = $BGA_IMAGE_DIR"
[ "$SCRIPT_DIR" != "$MAIN_REPO_DIR" ] && echo "  (running from worktree; anchored to main repo: $MAIN_REPO_DIR)"
```

- [ ] **Step 1.5: Bash syntax check**

```bash
bash -n /data00/home/xuxinhao.titan/raw/open-agricola/.worktree/worktree-shared-state/restart-intranet.sh && echo "syntax ok"
```

Expected: `syntax ok`. If you see a parse error, find the line and fix the typo before continuing.

- [ ] **Step 1.6: Verify path resolution from main repo**

```bash
cd /data00/home/xuxinhao.titan/raw/open-agricola && \
  bash -c '
    SCRIPT_DIR="$(pwd)"
    MAIN_REPO_DIR="$(cd "$(dirname "$(git -C "$SCRIPT_DIR" rev-parse --git-common-dir)")" && pwd)"
    echo "MAIN_REPO_DIR=$MAIN_REPO_DIR"
    echo "EQUAL=$([ "$SCRIPT_DIR" = "$MAIN_REPO_DIR" ] && echo yes || echo no)"
  '
```

Expected output:
```
MAIN_REPO_DIR=/data00/home/xuxinhao.titan/raw/open-agricola
EQUAL=yes
```

- [ ] **Step 1.7: Verify path resolution from worktree**

```bash
cd /data00/home/xuxinhao.titan/raw/open-agricola/.worktree/worktree-shared-state && \
  bash -c '
    SCRIPT_DIR="$(pwd)"
    MAIN_REPO_DIR="$(cd "$(dirname "$(git -C "$SCRIPT_DIR" rev-parse --git-common-dir)")" && pwd)"
    echo "MAIN_REPO_DIR=$MAIN_REPO_DIR"
    echo "EQUAL=$([ "$SCRIPT_DIR" = "$MAIN_REPO_DIR" ] && echo yes || echo no)"
  '
```

Expected output:
```
MAIN_REPO_DIR=/data00/home/xuxinhao.titan/raw/open-agricola
EQUAL=no
```

(Same `MAIN_REPO_DIR` as Step 1.6 — proves the worktree resolves back to the main repo.)

- [ ] **Step 1.8: Commit**

```bash
git -C /data00/home/xuxinhao.titan/raw/open-agricola/.worktree/worktree-shared-state add restart-intranet.sh
git -C /data00/home/xuxinhao.titan/raw/open-agricola/.worktree/worktree-shared-state commit -m "feat(infra): anchor restart-intranet.sh dev state to MAIN repo

When run from a worktree, the script now resolves persistent paths
(DB_DIR, PERSISTED_ROOMS_DIR, CUSTOM_CARD_DIR, CARD_ART_DIR,
BGA_IMAGE_DIR) to the main repo via \`git rev-parse --git-common-dir\`
instead of \$SCRIPT_DIR (cwd). All worktrees now share the same
dev2/dev3/dev4 game state, custom cards, and card art. Each path
respects an external override (\${VAR:-default}). Startup banner
prints the resolved paths and flags worktree mode."
```

---

## Task 2: Smoke test (live server)

**Files:** none (verification only).

**Background:** Steps 1.5-1.7 verified the bash logic statically. This task actually runs the script in main and in the worktree, confirms shared state works end-to-end. Skip if you don't have a free shell session for live verification — Task 1's static checks are the minimum.

- [ ] **Step 2.1: Run from main repo, confirm banner**

```bash
cd /data00/home/xuxinhao.titan/raw/open-agricola && ./restart-intranet.sh --kill-only && ./restart-intranet.sh -p 2 2>&1 | tail -30
```

Expected: backend + frontend both start; banner shows the new `Persistent dev state:` block; the `(running from worktree; ...)` line is ABSENT (since we're in main).

Confirm `DB_DIR` etc. all point under `/data00/home/xuxinhao.titan/raw/open-agricola/data` etc.

- [ ] **Step 2.2: Stop the servers**

```bash
cd /data00/home/xuxinhao.titan/raw/open-agricola && ./restart-intranet.sh --kill-only
```

- [ ] **Step 2.3: Run from worktree, confirm banner shows worktree mode + same paths**

```bash
cd /data00/home/xuxinhao.titan/raw/open-agricola/.worktree/worktree-shared-state && ./restart-intranet.sh -p 2 2>&1 | tail -30
```

Expected: same paths as Step 2.1 (under main repo's `data/` and `output/`); the `(running from worktree; anchored to main repo: ...)` line IS present.

- [ ] **Step 2.4: Stop the servers**

```bash
cd /data00/home/xuxinhao.titan/raw/open-agricola/.worktree/worktree-shared-state && ./restart-intranet.sh --kill-only
```

- [ ] **Step 2.5: (Optional, manual) Confirm shared SQLite DB**

If you want to prove the DB really is shared (instead of the worktree silently writing elsewhere), check:

```bash
ls -la /data00/home/xuxinhao.titan/raw/open-agricola/data/open-agricola.db
ls -la /data00/home/xuxinhao.titan/raw/open-agricola/.worktree/worktree-shared-state/data/ 2>&1
```

Expected: main repo's `data/open-agricola.db` is recently modified (touched by both Step 2.1 and 2.3 backends). Worktree's `data/` either doesn't exist or is empty (was never created since this run).

- [ ] **Step 2.6: No commit needed**

Verification only.

---

## Task 3: Push, PR, CI

**Files:** none (operational).

- [ ] **Step 3.1: Push the branch**

```bash
git -C /data00/home/xuxinhao.titan/raw/open-agricola/.worktree/worktree-shared-state push -u origin design/worktree-shared-state
```

- [ ] **Step 3.2: Open a PR via GitHub API**

```bash
export $(grep '^GH_TOKEN=' /data00/home/xuxinhao.titan/raw/open-agricola/.env | xargs)
curl -s -X POST -H "Authorization: Bearer $GH_TOKEN" -H "Accept: application/vnd.github+json" \
  https://api.github.com/repos/titanxxh/open-agricola/pulls \
  -d "$(cat <<'JSON'
{
  "title": "feat(infra): anchor restart-intranet.sh dev state to MAIN repo",
  "head": "design/worktree-shared-state",
  "base": "main",
  "body": "## Summary\n\nImplements `docs/superpowers/specs/2026-04-23-worktree-shared-state-design.md`.\n\nWhen run from any worktree, `restart-intranet.sh` now resolves persistent paths (DB_DIR, PERSISTED_ROOMS_DIR, CUSTOM_CARD_DIR, CARD_ART_DIR, BGA_IMAGE_DIR) to the MAIN repo via `git rev-parse --git-common-dir`, so all worktrees share the same dev2/dev3/dev4 game state, custom cards, and card art. Each path still respects an external env override.\n\n## Test plan\n\n- [x] Bash syntax check (`bash -n`) passes\n- [x] Static path resolution verified from main repo and from worktree (both resolve to the same MAIN_REPO_DIR)\n- [ ] Live smoke: launch from main → banner correct → kill → launch from worktree → banner shows worktree mode → same paths → confirm SQLite DB shared\n- [ ] CI green\n"
}
JSON
)" | jq '{number, html_url}'
```

- [ ] **Step 3.3: Wait for CI green**

```bash
export $(grep '^GH_TOKEN=' /data00/home/xuxinhao.titan/raw/open-agricola/.env | xargs)
SHA=$(git -C /data00/home/xuxinhao.titan/raw/open-agricola/.worktree/worktree-shared-state rev-parse HEAD)
until res=$(curl -s -H "Authorization: Bearer $GH_TOKEN" \
  "https://api.github.com/repos/titanxxh/open-agricola/actions/runs?per_page=20" \
  | jq -r "[.workflow_runs[] | select(.head_sha==\"$SHA\") | select(.name==\"CI\")][0] | \"\(.status) \(.conclusion)\"") \
  && echo "$res" | grep -q "completed"; do
  sleep 25
done
echo "CI: $res"
```

Expected: `CI: completed success`. (This change only touches a shell script, so CI's tests/build/lint should all pass without surprises.)

If failure: pull failure logs (CLAUDE.md `Push 后 CI 验证` section has the curl). Fix; don't merge.

- [ ] **Step 3.4: Merge via rebase**

```bash
export $(grep '^GH_TOKEN=' /data00/home/xuxinhao.titan/raw/open-agricola/.env | xargs)
PR_NUMBER=<from Step 3.2>
curl -s -X PUT -H "Authorization: Bearer $GH_TOKEN" -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/titanxxh/open-agricola/pulls/$PR_NUMBER/merge" \
  -d '{"merge_method":"rebase"}' | jq '{merged, message, sha}'
```

Expected: `{"merged": true, ...}`.

- [ ] **Step 3.5: Cleanup worktree + branches**

```bash
git -C /data00/home/xuxinhao.titan/raw/open-agricola fetch origin --prune
git -C /data00/home/xuxinhao.titan/raw/open-agricola worktree remove .worktree/worktree-shared-state --force
git -C /data00/home/xuxinhao.titan/raw/open-agricola branch -D design/worktree-shared-state
git -C /data00/home/xuxinhao.titan/raw/open-agricola push origin --delete design/worktree-shared-state
```

---

## Risk Notes

1. **Shell escape & quoting**: The path-resolution block uses double-quoted variable expansion throughout. `$(...)` substitutions are also double-quoted to handle paths with spaces (the project uses underscore/dash names so this is theoretical, but defensive). If the static checks in Steps 1.6-1.7 succeed, real-world paths will too.

2. **`git rev-parse --git-common-dir` failure mode**: If the script is run outside a git repo (e.g. someone copied just the script to a tarball release), the `git` call fails and `set -e` exits immediately. Acceptable — the script is part of the repo and isn't expected to work standalone.

3. **First-time worktree state migration**: As noted in spec §5.6, any worktree that previously ran the old script will have a stale `<worktree>/data/` and `<worktree>/output/`. Those become orphans after this change. No automatic migration; document via the commit message + spec.
