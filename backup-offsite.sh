#!/bin/bash
# 定时备份 + 异机同步（在生产机上运行，由 cron 每日调用，cron 定义见 deploy/open-agricola-backup.cron）
# 停 app 把 app-data volume 打包为 backups/daily-<timestamp>.tgz 并刷新 replay-removals.latest.jsonl，
# 随即重启 app（停机窗口只覆盖打包），再在一次性副本上做恢复验证并写入同名 manifest，
# 最后把 backups/ rsync 到异机并做两端保留清理。备份创建/验证失败时，保留清理与异机同步照常执行。
# 配置（.env 或环境变量）：
#   OFFSITE_BACKUP_TARGET      必填，异机 ssh 目标，如 root@1.2.3.4
#   OFFSITE_BACKUP_REMOTE_DIR  异机存放目录，默认 /root/open-agricola-backups
# 保留策略：本地 daily 保留最近 7 份且最多 30 天（pre-* 由 deploy-backend.sh 管理，手动备份留人工处理）；
# rsync 跳过本地超过 30 天的归档；远端 daily 保留最近 30 份、pre 保留最近 10 份，
# 所有归档（含手动备份）一律最多 30 天（ADR-0010 备份副本上限）。
# replay-removals.latest.jsonl 是最新删除事实的异机副本，永不清理，且只有在本地副本
# 是远端副本的超集（前缀关系成立）时才覆盖远端，防止回滚的 ledger 冲掉异机删除事实。
# 用法: ./backup-offsite.sh              # 完整定时备份 + 异机同步
#       ./backup-offsite.sh ledger-only  # 只刷新并同步 ledger（Replay 下架后立即调用，不停 app）

set -e
cd "$(dirname "$0")"

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
SSH_OPTS=(-o StrictHostKeyChecking=accept-new -o ConnectTimeout=15)
LEDGER=backups/replay-removals.latest.jsonl

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

# 只有本地 ledger 是远端副本的超集（远端内容 == 本地前缀）时才覆盖远端副本
sync_ledger() {
  if [ ! -f "$LEDGER" ]; then
    echo ">>> 本地无 ledger 副本，跳过 ledger 同步"
    return 1
  fi
  local remote_size local_size
  remote_size="$(ssh "${SSH_OPTS[@]}" "$OFFSITE_BACKUP_TARGET" \
    "stat -c '%s' '$OFFSITE_BACKUP_REMOTE_DIR/replay-removals.latest.jsonl' 2>/dev/null || echo 0" < /dev/null)"
  local_size="$(stat -c '%s' "$LEDGER")"
  if [ "$remote_size" -gt 0 ]; then
    if [ "$local_size" -lt "$remote_size" ] || \
       ! ssh "${SSH_OPTS[@]}" "$OFFSITE_BACKUP_TARGET" \
           "cat '$OFFSITE_BACKUP_REMOTE_DIR/replay-removals.latest.jsonl'" < /dev/null \
         | cmp -s -n "$remote_size" - "$LEDGER"; then
      echo ">>> ✗ 本地 ledger（${local_size}B）不是远端副本（${remote_size}B）的超集，拒绝覆盖异机 ledger"
      return 1
    fi
  fi
  rsync -a -e "ssh ${SSH_OPTS[*]}" "$LEDGER" \
    "$OFFSITE_BACKUP_TARGET:$OFFSITE_BACKUP_REMOTE_DIR/replay-removals.latest.jsonl"
  echo ">>> ✓ ledger 异机副本已更新（${local_size}B）"
}

if [ "$MODE" = "ledger-only" ]; then
  docker compose -f docker-compose.prod.yml cp app:/app/data/replay-removals.jsonl "$LEDGER"
  chmod 600 "$LEDGER"
  ensure_remote_dir
  sync_ledger
  exit 0
fi

echo ">>> [$(date -u +%Y-%m-%dT%H:%M:%SZ)] 定时备份开始"

BACKUP_STEM="daily-$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_CREATED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
VALIDATION_DIR=""
RSYNC_EXCLUDE_FILE=""
# app 停止后到重新 start 成功之间，任何退出都拉回容器
RESTART_ON_EXIT=0
on_exit() {
  if [ -n "$VALIDATION_DIR" ]; then
    rm -rf -- "$VALIDATION_DIR"
  fi
  if [ -n "$RSYNC_EXCLUDE_FILE" ]; then
    rm -f -- "$RSYNC_EXCLUDE_FILE"
  fi
  if [ "$RESTART_ON_EXIT" = "1" ]; then
    echo ">>> 备份中断，恢复 app"
    docker compose -f docker-compose.prod.yml start app || true
    exit 1
  fi
}
trap on_exit EXIT
trap 'exit 129' HUP INT TERM
discard_backup() {
  echo ">>> ✗ 备份失败（$1），清理本次产物"
  rm -f \
    "backups/$BACKUP_STEM.tgz" \
    "backups/$BACKUP_STEM.manifest.json" \
    "backups/env-$BACKUP_STEM"
}

do_backup() {
  local build_id
  build_id="$(
    docker compose -f docker-compose.prod.yml exec -T app \
      sh -c 'printf "%s" "$GAME_BUILD_ID"' 2>/dev/null \
      || git rev-parse HEAD
  )"
  if [ -z "$build_id" ]; then
    build_id="$(git rev-parse HEAD)"
  fi

  echo ">>> 停止 app 并打包 $BACKUP_STEM.tgz ..."
  RESTART_ON_EXIT=1
  docker compose -f docker-compose.prod.yml stop app
  docker compose -f docker-compose.prod.yml run --rm --no-deps \
    -v "$PWD/backups:/backup" app sh -c \
    "tar -C /app/data -czf /backup/$BACKUP_STEM.tgz . && \
     if [ -f /app/data/replay-removals.jsonl ]; then \
       cp /app/data/replay-removals.jsonl /backup/replay-removals.latest.jsonl; \
     elif [ ! -f /backup/replay-removals.latest.jsonl ]; then \
       : > /backup/replay-removals.latest.jsonl; \
     fi" < /dev/null || { discard_backup "打包"; return 1; }
  docker compose -f docker-compose.prod.yml start app
  RESTART_ON_EXIT=0
  echo ">>> app 已恢复，开始验证归档..."

  local backup_sha256 backup_size_bytes
  tar -tzf "backups/$BACKUP_STEM.tgz" > /dev/null || { discard_backup "tar -tzf"; return 1; }
  backup_sha256="$(sha256sum "backups/$BACKUP_STEM.tgz" | cut -d ' ' -f 1)" \
    || { discard_backup "sha256"; return 1; }
  backup_size_bytes="$(stat -c '%s' "backups/$BACKUP_STEM.tgz")" \
    || { discard_backup "stat"; return 1; }
  VALIDATION_DIR="$(mktemp -d "$PWD/backups/.validate-$BACKUP_STEM.XXXXXX")" \
    || { discard_backup "mktemp"; return 1; }
  tar -C "$VALIDATION_DIR" -xzf "backups/$BACKUP_STEM.tgz" || { discard_backup "解包"; return 1; }
  docker compose -f docker-compose.prod.yml run --rm --no-deps \
    -v "$VALIDATION_DIR:/validation-data" \
    -e DB_PATH=/validation-data/open-agricola.db \
    -e BACKUP_STEM="$BACKUP_STEM" \
    -e BACKUP_CREATED_AT="$BACKUP_CREATED_AT" \
    -e SOURCE_BUILD_ID="$build_id" \
    -e TARGET_BUILD_ID="$build_id" \
    -e TARGET_REF=daily \
    -e BACKUP_SHA256="$backup_sha256" \
    -e BACKUP_SIZE_BYTES="$backup_size_bytes" \
    app node --import tsx scripts/validate-backup.ts \
    > "backups/$BACKUP_STEM.manifest.json" < /dev/null || { discard_backup "恢复验证"; return 1; }
  rm -rf -- "$VALIDATION_DIR"
  VALIDATION_DIR=""
  chmod 600 \
    "backups/$BACKUP_STEM.tgz" \
    "backups/$BACKUP_STEM.manifest.json" \
    "$LEDGER" || { discard_backup "chmod"; return 1; }
  if [ -f .env ]; then
    { cp .env "backups/env-$BACKUP_STEM" && chmod 600 "backups/env-$BACKUP_STEM"; } \
      || { discard_backup "env 快照"; return 1; }
  fi
  echo ">>> ✓ 备份完成: backups/$BACKUP_STEM.tgz"
}

BACKUP_OK=1
if ! do_backup; then
  BACKUP_OK=0
  echo ">>> ✗ 本次备份创建/验证失败，仍继续执行保留清理与异机同步"
fi

echo ">>> 清理本地旧 daily 备份（保留最近 7 份、最多 30 天）..."
{
  ls -1t backups/daily-*.tgz 2>/dev/null | tail -n +8
  find backups -maxdepth 1 -name 'daily-*.tgz' -mtime +30 2>/dev/null
} | sort -u | while read -r OLD; do
  STEM="$(basename "$OLD" .tgz)"
  rm -f "$OLD" "backups/$STEM.manifest.json" "backups/env-$STEM"
  echo ">>> 已删除本地旧备份 $STEM"
done

echo ">>> 同步 backups/ 到 $OFFSITE_BACKUP_TARGET:$OFFSITE_BACKUP_REMOTE_DIR ..."
ensure_remote_dir
# 超过 30 天的本地归档不再推送，避免与远端 30 天清理形成删除-重推循环
RSYNC_EXCLUDE_FILE="$(mktemp)"
find backups -maxdepth 1 -name '*.tgz' -mtime +30 -printf '%f\n' 2>/dev/null \
  | while read -r F; do
      STEM="${F%.tgz}"
      printf '%s\n%s\n%s\n' "$F" "$STEM.manifest.json" "env-$STEM"
    done > "$RSYNC_EXCLUDE_FILE"
# 不带 --delete：远端保留策略独立于本地，本地误删不会传播到异机；
# ledger 不走目录同步，由 sync_ledger 做前缀检查后单独推送
rsync -az --exclude '.validate-*' --exclude '.maintenance.lock' \
  --exclude 'replay-removals.latest.jsonl' \
  --exclude-from "$RSYNC_EXCLUDE_FILE" \
  -e "ssh ${SSH_OPTS[*]}" \
  backups/ "$OFFSITE_BACKUP_TARGET:$OFFSITE_BACKUP_REMOTE_DIR/"
rm -f -- "$RSYNC_EXCLUDE_FILE"
RSYNC_EXCLUDE_FILE=""

LEDGER_OK=1
sync_ledger || LEDGER_OK=0

echo ">>> 清理远端旧备份（daily 保留 30 份、pre 保留 10 份、归档一律最多 30 天）..."
ssh "${SSH_OPTS[@]}" "$OFFSITE_BACKUP_TARGET" bash -s "$OFFSITE_BACKUP_REMOTE_DIR" << 'REMOTE_CLEANUP'
  set -e
  cd "$1"
  {
    ls -1t daily-*.tgz 2>/dev/null | tail -n +31
    ls -1t pre-*.tgz 2>/dev/null | tail -n +11
    find . -maxdepth 1 -name '*.tgz' -mtime +30 2>/dev/null | sed 's|^\./||'
  } | sort -u | while read -r OLD; do
    STEM="${OLD%.tgz}"
    rm -f "$OLD" "$STEM.manifest.json" "env-$STEM"
    echo ">>> 已删除远端旧备份 $STEM"
  done
  echo ">>> 远端备份占用: $(du -sh . | cut -f 1)"
REMOTE_CLEANUP

if [ "$BACKUP_OK" != 1 ] || [ "$LEDGER_OK" != 1 ]; then
  echo ">>> [$(date -u +%Y-%m-%dT%H:%M:%SZ)] ✗ 定时备份存在失败步骤（backup=$BACKUP_OK ledger=$LEDGER_OK）"
  exit 1
fi
echo ">>> [$(date -u +%Y-%m-%dT%H:%M:%SZ)] ✓ 定时备份 + 异机同步完成"
