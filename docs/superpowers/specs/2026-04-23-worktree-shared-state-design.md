# Worktree-Shared Dev State 设计

> 状态：approved（2026-04-23 brainstorming）
> Worktree：`.worktree/worktree-shared-state` 分支 `design/worktree-shared-state`

## 1. 背景与目标

`restart-intranet.sh` 启动后端时不显式设置 `DB_DIR` / `PERSISTED_ROOMS_DIR` /
`CUSTOM_CARD_DIR` / `CARD_ART_DIR`，所有路径走 server 默认（`process.cwd()` 相对的
`./data/`、`./output/`）。脚本启动前 `cd "$SCRIPT_DIR"` = 当前 worktree 根，所以
**每个 worktree 各有一份 SQLite DB + JSON 房间快照 + 自定义卡牌 + 卡牌美术**。

**痛点**：在 main 玩 dev2 房间到 round 5，切到功能 worktree `restart-intranet.sh`
后，看到的是空 dev2 房间（worktree 自己的全新 SQLite）。

**目标**：所有 worktree 共享 main repo 根下的 `data/` 和 `output/`，看到同一份
dev game 状态、同一份自定义卡、同一份卡牌美术。

**非目标**：

- 不解决端口冲突——同时只能跑一个 backend/frontend，多 worktree 同时跑不在范围
- 不迁移已经存在于 worktree 内的旧 `data/output/`——靠用户手动清理
- 不改 server 端默认行为（`process.cwd()` 兜底保留），只在脚本里注入 env

## 2. 当前持久化路径清单

调研结果（grep `process.cwd()` 在 `server/` 下的全部命中）：

| 数据 | 默认路径 | env 控制 | 文件 |
|---|---|---|---|
| SQLite DB | `./data/open-agricola.db` | `DB_DIR` / `DB_PATH` | `server/db.ts` |
| JSON 房间快照 | `./output/*.json` | `PERSISTED_ROOMS_DIR` | `server/game/room-manager.ts` |
| Custom cards | `./data/custom-cards/` | `CUSTOM_CARD_DIR` | `server/card-file-manager.ts` |
| Card art | `./data/card-art/` | `CARD_ART_DIR` | `server/index.ts`、`server/workshop-pr/propose-handler.ts` |
| BGA 本地图 | 由 `BGA_IMAGE_DIR` 决定，默认 `../bga-agricola/img`（脚本里的） | `BGA_IMAGE_DIR` | `vite.config.ts`、`server/index.ts` |

`restart-intranet.sh` 当前只设了 `PERSIST_ROOMS=sqlite` + `BACKEND_HOST` +
`BGA_IMAGE_DIR` 三个，剩余全部走 cwd 默认。

## 3. 方案 — 锚到 main repo

`git rev-parse --git-common-dir` 在任何 worktree 里返回 main repo 的 `.git` 目录
（绝对路径），其父目录就是 main repo 根。脚本启动时计算这个，然后把所有持久化
路径派生到 main repo 下。Server 端不动，只靠 env 注入。

**对比其它方案（不采用）**：

- B. **共享到 `~/.open-agricola/`** — 状态藏到 home 目录，不在 repo 视野里，新
  contributor 找不到
- C. **手工 symlink `ln -s ../../../data data`** — 每个 worktree 创建时要做一次，
  容易忘
- D. **要求用户自己 export 4 个 env var** — UX 差

## 4. 脚本改动 (`restart-intranet.sh`)

### 4.1 顶部加 resolve 段（紧跟 `SCRIPT_DIR=...`）

```bash
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
if [ -z "${BGA_IMAGE_DIR:-}" ]; then
  BGA_IMAGE_DIR="$(cd "$MAIN_REPO_DIR/.." 2>/dev/null && pwd)/bga-agricola/img"
fi
```

注意 `git -C "$SCRIPT_DIR" rev-parse` 用显式 cwd，避免脚本后续 `cd` 引起歧义。

### 4.2 把 env 注入 backend 启动 (`start_and_wait` 调用)

```bash
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

frontend 调用保持不变（vite 只用 `BACKEND_HOST` + `BGA_IMAGE_DIR`，不读
持久化路径）。

### 4.3 启动信息 dump 当前路径（`=== Open Agricola (intranet) ===` 之前）

```bash
echo "Persistent dev state:"
echo "  DB_DIR             = $DB_DIR"
echo "  PERSISTED_ROOMS_DIR= $PERSISTED_ROOMS_DIR"
echo "  CARD_ART_DIR       = $CARD_ART_DIR"
echo "  BGA_IMAGE_DIR      = $BGA_IMAGE_DIR"
[ "$SCRIPT_DIR" != "$MAIN_REPO_DIR" ] && echo "  (running from worktree; anchored to main repo: $MAIN_REPO_DIR)"
```

让用户每次启动都看到当前用的是哪份 data。

## 5. 风险 & 边界

1. **端口冲突保留**：worktree A 在跑时，B 跑脚本会先 kill A 的进程再启动 B；但
   两边 SQLite 是同一个，状态不丢。**正好是预期**：一次只有一个 dev session，
   状态共享。

2. **SQLite 并发写**：better-sqlite3 用 WAL，单进程读写安全。两个 backend 同时
   写会撞 lock——但端口冲突已强制了"同时只有一个 backend"，不会发生。

3. **`output/` 共享副作用**：`output/` 不只是房间快照，还有 `output/tmp/` 截图、
   `output/playwright/` e2e state——这些跨 worktree 共享是好事（省盘 + e2e
   state 单一来源）。

4. **`.gitignore` 状态**：`data/`、`output/` 已 ignore；脚本不再往 worktree 里
   写，git status 干净。

5. **`MAIN_REPO_DIR` 检测**：`git rev-parse --git-common-dir` 在 git 1.7+ 可用，
   本机够新。如果脚本运行在非 git repo 或 detached worktree（无关联 main），
   `git` 会失败、脚本因 `set -e` 立即退出——不静默回退。

6. **首次切换体验**：之前在 worktree 内跑过 `restart-intranet.sh` 留下的
   `<worktree>/data/`、`<worktree>/output/` 是孤立数据，本变更生效后会被忽略。
   用户可手动 `rm -rf <worktree>/data <worktree>/output` 清理（或保留作为
   备份）。本 spec 不自动迁移。

7. **覆写灵活性**：每个变量都用 `${VAR:-default}` 形式，外部 export 的值优先；
   想临时隔离某 worktree（实验用），可以 `DB_DIR=/tmp/x PERSISTED_ROOMS_DIR=/tmp/y
   ./restart-intranet.sh`。

## 6. 实施顺序

1. 改 `restart-intranet.sh`：加 §4.1 + §4.2 + §4.3（一个 commit）
2. 用 `bash -n restart-intranet.sh` 做语法检查
3. 在 main repo 跑一次 `./restart-intranet.sh --kill-only` 确认 kill 还工作
4. 在 main repo 跑 `./restart-intranet.sh -p 2`，启动信息里看到 `Persistent dev
   state:` 段，路径都是 main repo 下；末尾**不**显示 "running from worktree"
   行
5. 切到一个 worktree（任意现存的，比如 `.worktree/worktree-shared-state` 自己），
   跑 `./restart-intranet.sh --kill-only` 然后 `./restart-intranet.sh -p 2`，
   看启动信息：路径仍指向 main repo，末尾出现 "(running from worktree;
   anchored to main repo: <path>)"
6. 浏览器访问输出的 P1/P2 链接，确认 dev2 房间状态延续 main repo 之前的状态
   （可在 main 先打几张牌，再切 worktree 重启，房间应保留之前的状态）
7. 提交
