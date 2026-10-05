#!/bin/bash
# MAINTAINER-ONLY — 在生产机上由 cron 调用，贡献者无需使用本脚本。
# Maintainer-only: runs on the production host via cron. Contributors never need this.
# 定时备份 + 异机同步（在生产机上运行，由 cron 每日调用，cron 定义见 deploy/open-agricola-backup.cron）
# 停 app 导出 PostgreSQL 原生归档及 S3 不可变资源并打包为 backups/daily-<timestamp>.tgz 并刷新 replay-removals.latest.json，
# 随即重启 app（停机窗口只覆盖打包），再在一次性副本上做恢复验证并写入同名 manifest，
# 最后把 backups/ rsync 到异机并做两端保留清理。备份创建/验证或 rsync 失败时，
# 两端保留清理照常执行，脚本最终以非零退出。
# 配置（.env 或环境变量）：
#   OFFSITE_BACKUP_TARGET      必填，异机 ssh 目标，如 root@1.2.3.4
#   OFFSITE_BACKUP_REMOTE_DIR  异机存放目录，默认 /root/open-agricola-backups
# 保留策略：本地 daily 保留最近 7 份，本地所有归档一律最多 30 天（pre-* 份数由 deploy-backend.sh
# 管理，手动备份份数留人工处理）；rsync 跳过本地超过 30 天的归档；远端 daily 保留最近 30 份、
# pre 保留最近 10 份，所有归档（含手动备份）一律最多 30 天（ADR-0010 备份副本上限，
# 30 天界限按分钟计算避免 -mtime 的整天舍入）。
# replay-removals.latest.json 是最新删除事实的异机副本，永不清理，且只有在本地副本
# 合并远端事实后才刷新远端，防止恢复旧数据冲掉异机删除事实。
# 用法: ./backup-offsite.sh              # 完整定时备份 + 异机同步
#       ./backup-offsite.sh ledger-only  # 只刷新并同步 ledger（Replay 下架后立即调用，不停 app）

set -e
cd "$(dirname "$0")"
export APP_UID="$(id -u)" APP_GID="$(id -g)"

env_value() {
  grep -E "^$1=" .env 2>/dev/null | tail -n 1 | cut -d '=' -f 2-
}
OFFSITE_BACKUP_TARGET="${OFFSITE_BACKUP_TARGET:-$(env_value OFFSITE_BACKUP_TARGET)}"
OFFSITE_BACKUP_REMOTE_DIR="${OFFSITE_BACKUP_REMOTE_DIR:-$(env_value OFFSITE_BACKUP_REMOTE_DIR)}"
OFFSITE_BACKUP_REMOTE_DIR="${OFFSITE_BACKUP_REMOTE_DIR:-/root/open-agricola-backups}"
if [ -z "$OFFSITE_BACKUP_TARGET" ]; then
  echo ">>> ✗ 缺少 OFFSITE_BACKUP_TARGET（.env 或环境变量），中止"
  exit 1
fi
[[ "$OFFSITE_BACKUP_REMOTE_DIR" =~ ^/[a-zA-Z0-9_./-]+$ ]] || { echo 'Invalid offsite directory'; exit 1; }
[[ "$OFFSITE_BACKUP_TARGET" != -* ]] || { echo 'Invalid offsite target'; exit 1; }
SSH_OPTS=(-o StrictHostKeyChecking=accept-new -o ConnectTimeout=15)
LEDGER=backups/replay-removals.latest.json
# Ledger snapshots are independent of ordinary database archives. Merge remote
# facts into current S3 before refreshing the copy; never overwrite with a prefix.
# ADR-0010 的 30 天备份副本上限，按分钟计算避免 -mtime 的整天舍入
MAX_AGE_MINUTES=$((30 * 24 * 60))

mkdir -p backups
chmod 700 backups

MODE="${1:-full}"
# 与 deploy-backend.sh 共享维护锁：备份不与部署或另一次备份重叠
exec 9> backups/.maintenance.lock
if [ "$MODE" = "ledger-only" ]; then
  flock -w 600 9 || { echo ">>> ✗ 等待维护锁超时"; exit 1; }
else
  flock -n 9 || { echo ">>> 已有备份或部署在运行，跳过本次"; exit 0; }
fi

ensure_remote_dir() {
  ssh "${SSH_OPTS[@]}" "$OFFSITE_BACKUP_TARGET" \
    "mkdir -p '$OFFSITE_BACKUP_REMOTE_DIR' && chmod 700 '$OFFSITE_BACKUP_REMOTE_DIR'" < /dev/null
}

sync_ledger() {
  local incoming="backups/.ledger-incoming.json"
  # Only this host writes this offsite replica. The local maintenance lock also
  # serializes deployment, daily backup, and immediate deletion-ledger sync.
  ssh "${SSH_OPTS[@]}" "$OFFSITE_BACKUP_TARGET" \
    "if test -f '$OFFSITE_BACKUP_REMOTE_DIR/replay-removals.latest.json'; then cat '$OFFSITE_BACKUP_REMOTE_DIR/replay-removals.latest.json'; else printf '%s' '{\"version\":1,\"batches\":[]}'; fi" \
    > "$incoming" || return 1
  docker compose -f docker-compose.prod.yml run --rm --no-deps \
    --user "$(id -u):$(id -g)" -v "$PWD/backups:/backup" app \
    node --import tsx scripts/storage-archive-cli.ts ledger-merge /backup/.ledger-incoming.json || return 1
  rm -f "$incoming"
  docker compose -f docker-compose.prod.yml run --rm --no-deps \
    --user "$(id -u):$(id -g)" -v "$PWD/backups:/backup" app \
    node --import tsx scripts/storage-archive-cli.ts ledger-export /backup/replay-removals.latest.json || return 1
  rsync -a -e "ssh ${SSH_OPTS[*]}" "$LEDGER" \
    "$OFFSITE_BACKUP_TARGET:$OFFSITE_BACKUP_REMOTE_DIR/replay-removals.latest.json" || return 1
  echo ">>> Independent erasure ledger union synchronized"
}

if [ "$MODE" = "ledger-only" ]; then
  ensure_remote_dir
  sync_ledger
  exit 0
fi

BACKUP_STEM="daily-$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_OK=1
if ! MAINTENANCE_LOCK_HELD=1 bash scripts/backup-storage.sh "$BACKUP_STEM"; then
  BACKUP_OK=0
  echo ">>> Backup failed; retention and offsite synchronization still run"
fi
RSYNC_EXCLUDE_FILE=""
trap 'rm -f -- "${RSYNC_EXCLUDE_FILE:-}"' EXIT

echo ">>> 清理本地旧备份（daily 保留最近 7 份；所有归档最多 30 天）..."
{
  ls -1t backups/daily-*.tgz 2>/dev/null | tail -n +8
  find backups -maxdepth 1 -name '*.tgz' -mmin "+$MAX_AGE_MINUTES" 2>/dev/null
} | sort -u | while read -r OLD; do
  STEM="$(basename "$OLD" .tgz)"
  rm -f "$OLD" "backups/$STEM.manifest.json" "backups/env-$STEM"
  echo ">>> 已删除本地旧备份 $STEM"
done

SYNC_OK=1
LEDGER_OK=1
if ensure_remote_dir; then
  echo ">>> 同步 backups/ 到 $OFFSITE_BACKUP_TARGET:$OFFSITE_BACKUP_REMOTE_DIR ..."
  # 超过 30 天的本地归档不再推送，避免与远端 30 天清理形成删除-重推循环
  RSYNC_EXCLUDE_FILE="$(mktemp)"
  find backups -maxdepth 1 -name '*.tgz' -mmin "+$MAX_AGE_MINUTES" -printf '%f\n' 2>/dev/null \
    | while read -r F; do
        STEM="${F%.tgz}"
        printf '%s\n%s\n%s\n' "$F" "$STEM.manifest.json" "env-$STEM"
      done > "$RSYNC_EXCLUDE_FILE"
  # 不带 --delete：远端保留策略独立于本地，本地误删不会传播到异机；
  # ledger 不走目录同步，由 sync_ledger 合并事实后单独推送
  rsync -az --exclude '.validate-*' --exclude '.maintenance.lock' \
    --exclude 'replay-removals.latest.json' --exclude 'replay-removals.latest.jsonl' --exclude '.capture-*' --exclude '.ledger-*' \
    --exclude-from "$RSYNC_EXCLUDE_FILE" \
    -e "ssh ${SSH_OPTS[*]}" \
    backups/ "$OFFSITE_BACKUP_TARGET:$OFFSITE_BACKUP_REMOTE_DIR/" \
    || { echo ">>> ✗ 归档 rsync 失败，仍继续执行远端清理"; SYNC_OK=0; }
  rm -f -- "$RSYNC_EXCLUDE_FILE"
  RSYNC_EXCLUDE_FILE=""

  sync_ledger || LEDGER_OK=0

  echo ">>> 清理远端旧备份（daily 保留 30 份、pre 保留 10 份、归档一律最多 30 天）..."
  ssh "${SSH_OPTS[@]}" "$OFFSITE_BACKUP_TARGET" bash -s "$OFFSITE_BACKUP_REMOTE_DIR" "$MAX_AGE_MINUTES" << 'REMOTE_CLEANUP' \
    || { echo ">>> ✗ 远端清理失败"; SYNC_OK=0; }
  set -e
  cd "$1"
  MAX_AGE_MINUTES="$2"
  {
    ls -1t daily-*.tgz 2>/dev/null | tail -n +31
    ls -1t pre-*.tgz 2>/dev/null | tail -n +11
    find . -maxdepth 1 -name '*.tgz' -mmin "+$MAX_AGE_MINUTES" 2>/dev/null | sed 's|^\./||'
  } | sort -u | while read -r OLD; do
    STEM="${OLD%.tgz}"
    rm -f "$OLD" "$STEM.manifest.json" "env-$STEM"
    echo ">>> 已删除远端旧备份 $STEM"
  done
  echo ">>> 远端备份占用: $(du -sh . | cut -f 1)"
REMOTE_CLEANUP
else
  echo ">>> ✗ 无法连接异机 $OFFSITE_BACKUP_TARGET，跳过异机同步与远端清理"
  SYNC_OK=0
  LEDGER_OK=0
fi

if [ "$BACKUP_OK" != 1 ] || [ "$SYNC_OK" != 1 ] || [ "$LEDGER_OK" != 1 ]; then
  echo ">>> [$(date -u +%Y-%m-%dT%H:%M:%SZ)] ✗ 定时备份存在失败步骤（backup=$BACKUP_OK sync=$SYNC_OK ledger=$LEDGER_OK）"
  exit 1
fi
echo ">>> [$(date -u +%Y-%m-%dT%H:%M:%SZ)] ✓ 定时备份 + 异机同步完成"
