#!/bin/bash
# 定时备份 + 异机同步（在生产机上运行，由 cron 每日调用，cron 定义见 deploy/open-agricola-backup.cron）
# 停 app 把 app-data volume 打包为 backups/daily-<timestamp>.tgz 并刷新 replay-removals.latest.jsonl，
# 随即重启 app（停机窗口只覆盖打包），再在一次性副本上做恢复验证并写入同名 manifest，
# 最后把整个 backups/ rsync 到异机，并按 ADR-0010 做两端保留清理。
# 配置（.env 或环境变量）：
#   OFFSITE_BACKUP_TARGET      必填，异机 ssh 目标，如 root@1.2.3.4
#   OFFSITE_BACKUP_REMOTE_DIR  异机存放目录，默认 /root/open-agricola-backups
# 保留策略：本地 daily 保留最近 7 份且最多 30 天（pre-* 由 deploy-backend.sh 管理）；
# 远端 daily 保留最近 30 份、pre 保留最近 10 份、归档一律最多 30 天（ADR-0010 备份副本上限）；
# replay-removals.latest.jsonl 是最新删除事实的异机副本，永不清理。
# 用法: ./backup-offsite.sh

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

mkdir -p backups
chmod 700 backups

# 防止 cron 重入或与上一次未结束的备份并发
exec 9> backups/.offsite-backup.lock
flock -n 9 || { echo ">>> 已有备份在运行，跳过本次"; exit 0; }

echo ">>> [$(date -u +%Y-%m-%dT%H:%M:%SZ)] 定时备份开始"

GAME_BUILD_ID="$(
  docker compose -f docker-compose.prod.yml exec -T app \
    sh -c 'printf "%s" "$GAME_BUILD_ID"' 2>/dev/null \
    || git rev-parse HEAD
)"
if [ -z "$GAME_BUILD_ID" ]; then
  GAME_BUILD_ID="$(git rev-parse HEAD)"
fi

BACKUP_STEM="daily-$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_CREATED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
VALIDATION_DIR=""
# app 停止后到重新 start 成功之间，任何退出都拉回容器
RESTART_ON_EXIT=0
on_exit() {
  if [ -n "$VALIDATION_DIR" ]; then
    rm -rf -- "$VALIDATION_DIR"
  fi
  if [ "$RESTART_ON_EXIT" = "1" ]; then
    echo ">>> 备份中断，恢复 app"
    docker compose -f docker-compose.prod.yml start app || true
    exit 1
  fi
}
trap on_exit EXIT
trap 'exit 129' HUP INT TERM
backup_failed() {
  echo ">>> ✗ 备份失败（$1），清理本次产物"
  rm -f \
    "backups/$BACKUP_STEM.tgz" \
    "backups/$BACKUP_STEM.manifest.json" \
    "backups/env-$BACKUP_STEM"
  exit 1
}

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
   fi" < /dev/null || backup_failed "打包"
docker compose -f docker-compose.prod.yml start app
RESTART_ON_EXIT=0
echo ">>> app 已恢复，开始验证归档..."

tar -tzf "backups/$BACKUP_STEM.tgz" > /dev/null || backup_failed "tar -tzf"
BACKUP_SHA256="$(sha256sum "backups/$BACKUP_STEM.tgz" | cut -d ' ' -f 1)" \
  || backup_failed "sha256"
BACKUP_SIZE_BYTES="$(stat -c '%s' "backups/$BACKUP_STEM.tgz")" \
  || backup_failed "stat"
VALIDATION_DIR="$(mktemp -d "$PWD/backups/.validate-$BACKUP_STEM.XXXXXX")" \
  || backup_failed "mktemp"
tar -C "$VALIDATION_DIR" -xzf "backups/$BACKUP_STEM.tgz" || backup_failed "解包"
docker compose -f docker-compose.prod.yml run --rm --no-deps \
  -v "$VALIDATION_DIR:/validation-data" \
  -e DB_PATH=/validation-data/open-agricola.db \
  -e BACKUP_STEM="$BACKUP_STEM" \
  -e BACKUP_CREATED_AT="$BACKUP_CREATED_AT" \
  -e SOURCE_BUILD_ID="$GAME_BUILD_ID" \
  -e TARGET_BUILD_ID="$GAME_BUILD_ID" \
  -e TARGET_REF=daily \
  -e BACKUP_SHA256="$BACKUP_SHA256" \
  -e BACKUP_SIZE_BYTES="$BACKUP_SIZE_BYTES" \
  app node --import tsx scripts/validate-backup.ts \
  > "backups/$BACKUP_STEM.manifest.json" < /dev/null || backup_failed "恢复验证"
rm -rf -- "$VALIDATION_DIR"
VALIDATION_DIR=""
chmod 600 \
  "backups/$BACKUP_STEM.tgz" \
  "backups/$BACKUP_STEM.manifest.json" \
  backups/replay-removals.latest.jsonl || backup_failed "chmod"
{ cp .env "backups/env-$BACKUP_STEM" && chmod 600 "backups/env-$BACKUP_STEM"; } || backup_failed "env 快照"
echo ">>> ✓ 备份完成: backups/$BACKUP_STEM.tgz"

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
ssh "${SSH_OPTS[@]}" "$OFFSITE_BACKUP_TARGET" \
  "mkdir -p '$OFFSITE_BACKUP_REMOTE_DIR' && chmod 700 '$OFFSITE_BACKUP_REMOTE_DIR'" < /dev/null
# 不带 --delete：远端保留策略独立于本地，本地误删不会传播到异机
rsync -az --exclude '.validate-*' --exclude '.offsite-backup.lock' \
  -e "ssh ${SSH_OPTS[*]}" \
  backups/ "$OFFSITE_BACKUP_TARGET:$OFFSITE_BACKUP_REMOTE_DIR/"

echo ">>> 清理远端旧备份（daily 保留 30 份、pre 保留 10 份、归档最多 30 天）..."
ssh "${SSH_OPTS[@]}" "$OFFSITE_BACKUP_TARGET" bash -s "$OFFSITE_BACKUP_REMOTE_DIR" << 'REMOTE_CLEANUP'
  set -e
  cd "$1"
  {
    ls -1t daily-*.tgz 2>/dev/null | tail -n +31
    ls -1t pre-*.tgz 2>/dev/null | tail -n +11
    find . -maxdepth 1 \( -name 'daily-*.tgz' -o -name 'pre-*.tgz' \) -mtime +30 2>/dev/null | sed 's|^\./||'
  } | sort -u | while read -r OLD; do
    STEM="${OLD%.tgz}"
    rm -f "$OLD" "$STEM.manifest.json" "env-$STEM"
    echo ">>> 已删除远端旧备份 $STEM"
  done
  echo ">>> 远端备份占用: $(du -sh . | cut -f 1)"
REMOTE_CLEANUP

echo ">>> [$(date -u +%Y-%m-%dT%H:%M:%SZ)] ✓ 定时备份 + 异机同步完成"
