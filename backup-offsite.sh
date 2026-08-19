#!/bin/bash
# MAINTAINER-ONLY — 在生产机上由 cron 调用，贡献者无需使用本脚本。
# Maintainer-only: runs on the production host via cron. Contributors never need this.
# 定时备份 + 异机同步（在生产机上运行，由 cron 每日调用，cron 定义见 deploy/open-agricola-backup.cron）
# 停 app 把 app-data volume 打包为 backups/daily-<timestamp>.tgz 并刷新 replay-removals.latest.jsonl，
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
# 生产 ledger 的实际路径跟随 REPLAY_REMOVAL_LEDGER_PATH 配置，映射为容器内路径
LEDGER_SRC="${REPLAY_REMOVAL_LEDGER_PATH:-$(env_value REPLAY_REMOVAL_LEDGER_PATH)}"
LEDGER_SRC="${LEDGER_SRC:-./data/replay-removals.jsonl}"
case "$LEDGER_SRC" in
  /*) CONTAINER_LEDGER="$LEDGER_SRC" ;;
  *) CONTAINER_LEDGER="/app/${LEDGER_SRC#./}" ;;
esac
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

# 只有本地 ledger 是远端副本的超集（远端内容 == 本地前缀）时才覆盖远端副本。
# 可能被 `sync_ledger || ...` 调用（errexit 被抑制），每个可失败命令都显式传播失败。
sync_ledger() {
  if [ ! -f "$LEDGER" ]; then
    echo ">>> ✗ 本地无 ledger 副本，跳过 ledger 同步"
    return 1
  fi
  local remote_size local_size
  remote_size="$(ssh "${SSH_OPTS[@]}" "$OFFSITE_BACKUP_TARGET" \
    "stat -c '%s' '$OFFSITE_BACKUP_REMOTE_DIR/replay-removals.latest.jsonl' 2>/dev/null || echo 0" < /dev/null)" \
    || { echo ">>> ✗ 读取远端 ledger 大小失败"; return 1; }
  [[ "$remote_size" =~ ^[0-9]+$ ]] || { echo ">>> ✗ 远端 ledger 大小异常: $remote_size"; return 1; }
  local_size="$(stat -c '%s' "$LEDGER")" || return 1
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
    "$OFFSITE_BACKUP_TARGET:$OFFSITE_BACKUP_REMOTE_DIR/replay-removals.latest.jsonl" \
    || { echo ">>> ✗ ledger 推送失败"; return 1; }
  echo ">>> ✓ ledger 异机副本已更新（${local_size}B）"
}

if [ "$MODE" = "ledger-only" ]; then
  docker compose -f docker-compose.prod.yml cp app:"$CONTAINER_LEDGER" "$LEDGER"
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
# start 成功才清除 RESTART_ON_EXIT；失败保持 1，脚本退出时 EXIT trap 再次尝试拉起
restart_app() {
  if docker compose -f docker-compose.prod.yml start app; then
    RESTART_ON_EXIT=0
  else
    echo ">>> ✗ app 启动失败，脚本退出时将再次尝试拉起"
    return 1
  fi
}

# do_backup 经 `if ! do_backup` 调用（errexit 被抑制），每个可失败命令都显式传播失败；
# 打包失败立即重启 app，不把停机拖到脚本结束。
do_backup() {
  local build_id
  build_id="$(
    docker compose -f docker-compose.prod.yml exec -T app \
      sh -c 'printf "%s" "$GAME_BUILD_ID"' < /dev/null 2>/dev/null \
      || git rev-parse HEAD
  )"
  if [ -z "$build_id" ]; then
    build_id="$(git rev-parse HEAD)"
  fi

  echo ">>> 停止 app 并打包 $BACKUP_STEM.tgz ..."
  RESTART_ON_EXIT=1
  docker compose -f docker-compose.prod.yml stop app || true
  docker compose -f docker-compose.prod.yml run --rm --no-deps \
    -v "$PWD/backups:/backup" app sh -c \
    "tar -C /app/data -czf /backup/$BACKUP_STEM.tgz . && \
     if [ -f $CONTAINER_LEDGER ]; then \
       cp $CONTAINER_LEDGER /backup/replay-removals.latest.jsonl; \
     elif [ ! -f /backup/replay-removals.latest.jsonl ]; then \
       : > /backup/replay-removals.latest.jsonl; \
     fi" < /dev/null || {
       discard_backup "打包"
       restart_app || true
       return 1
     }
  restart_app || return 1
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
    < /dev/null \
    > "backups/$BACKUP_STEM.manifest.json" || { discard_backup "恢复验证"; return 1; }
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
  # ledger 不走目录同步，由 sync_ledger 做前缀检查后单独推送
  rsync -az --exclude '.validate-*' --exclude '.maintenance.lock' \
    --exclude 'replay-removals.latest.jsonl' \
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
