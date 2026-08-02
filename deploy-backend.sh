#!/bin/bash
# 一键更新并重新部署后端 Docker
# 部署前自动做完整备份、目标镜像恢复验证和版本清单，
# 备份失败则拉回旧版本并中止部署；pre-deploy 备份保留最近 5 份、最多 30 天（ADR-0010）。
# 用法: ./deploy-backend.sh <ssh-host> [ref] [remote-dir]
# ref 可以是分支名或 release tag
# 示例: ./deploy-backend.sh 1.2.3.4
#       ./deploy-backend.sh 1.2.3.4 v0.3.0
#       ./deploy-backend.sh root@1.2.3.4 main /home/user/open-agricola

set -e

# 如果没有 @ 则默认用 root 用户
_HOST="${1:-}"
if [[ "$_HOST" != *@* ]]; then
  HOST="root@$_HOST"
else
  HOST="$_HOST"
fi
REF="${2:-main}"
REMOTE_DIR="${3:-/root/open-agricola}"

if [ -z "$HOST" ]; then
  echo "用法: ./deploy-backend.sh <ssh-host> [ref] [remote-dir]"
  echo "示例: ./deploy-backend.sh 1.2.3.4              # 部署 main"
  echo "      ./deploy-backend.sh 1.2.3.4 v0.3.0       # 部署 release tag"
  echo "      ./deploy-backend.sh root@1.2.3.4 main /home/user/open-agricola"
  exit 1
fi

echo ">>> 部署后端到 $HOST:$REMOTE_DIR (ref: $REF)"

REMOTE_ENV=()
if [ -n "${ACCOUNT_REGISTRATION_POLICY:-}" ]; then
  REMOTE_ENV+=(ACCOUNT_REGISTRATION_POLICY="$ACCOUNT_REGISTRATION_POLICY")
fi

ssh "$HOST" "${REMOTE_ENV[@]}" bash -s "$REMOTE_DIR" "$REF" << 'REMOTE_SCRIPT'
  set -e
  REMOTE_DIR="$1"
  REF="$2"
  cd "$REMOTE_DIR"

  SOURCE_BUILD_ID="$(
    docker compose -f docker-compose.prod.yml exec -T app \
      sh -c 'printf "%s" "$GAME_BUILD_ID"' 2>/dev/null \
      || git rev-parse HEAD
  )"
  if [ -z "$SOURCE_BUILD_ID" ]; then
    SOURCE_BUILD_ID="$(git rev-parse HEAD)"
  fi

  echo ">>> git fetch + checkout $REF..."
  git fetch origin "$REF"
  git reset --hard FETCH_HEAD
  GAME_BUILD_ID="$(git rev-parse HEAD)"

  echo ">>> docker compose build..."
  GAME_BUILD_ID="$GAME_BUILD_ID" docker compose -f docker-compose.prod.yml build

  echo ">>> pre-deploy 备份..."
  mkdir -p backups
  chmod 700 backups
  SAFE_REF="${REF//\//-}"
  BACKUP_STEM="pre-${SAFE_REF}-$(date -u +%Y%m%dT%H%M%SZ)"
  BACKUP_CREATED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  VALIDATION_DIR=""
  # app 停止后到新版本 up 成功之间，任何退出（含 CI cancel 杀掉 SSH）都拉回旧容器
  RESTART_ON_EXIT=0
  on_exit() {
    if [ -n "$VALIDATION_DIR" ]; then
      rm -rf -- "$VALIDATION_DIR"
    fi
    if [ "$RESTART_ON_EXIT" = "1" ]; then
      echo ">>> 部署未完成，恢复旧版本 app"
      docker compose -f docker-compose.prod.yml start app || true
      exit 1
    fi
  }
  trap on_exit EXIT
  trap 'exit 129' HUP INT TERM
  backup_failed() {
    echo ">>> ✗ 备份失败，部署中止"
    rm -f \
      "backups/$BACKUP_STEM.tgz" \
      "backups/$BACKUP_STEM.manifest.json" \
      "backups/env-$BACKUP_STEM"
    exit 1
  }
  RESTART_ON_EXIT=1
  docker compose -f docker-compose.prod.yml stop app
  docker compose -f docker-compose.prod.yml run --rm --no-deps \
    -v "$PWD/backups:/backup" app sh -c \
    "tar -C /app/data -czf /backup/$BACKUP_STEM.tgz . && \
     if [ -f /app/data/replay-removals.jsonl ]; then \
       cp /app/data/replay-removals.jsonl /backup/replay-removals.latest.jsonl; \
     elif [ ! -f /backup/replay-removals.latest.jsonl ]; then \
       : > /backup/replay-removals.latest.jsonl; \
     fi" < /dev/null || backup_failed
  tar -tzf "backups/$BACKUP_STEM.tgz" > /dev/null || backup_failed
  BACKUP_SHA256="$(sha256sum "backups/$BACKUP_STEM.tgz" | cut -d ' ' -f 1)" \
    || backup_failed
  BACKUP_SIZE_BYTES="$(stat -c '%s' "backups/$BACKUP_STEM.tgz")" \
    || backup_failed
  VALIDATION_DIR="$(mktemp -d "$PWD/backups/.validate-$BACKUP_STEM.XXXXXX")" \
    || backup_failed
  tar -C "$VALIDATION_DIR" -xzf "backups/$BACKUP_STEM.tgz" || backup_failed
  docker compose -f docker-compose.prod.yml run --rm --no-deps \
    -v "$VALIDATION_DIR:/validation-data" \
    -e DB_PATH=/validation-data/open-agricola.db \
    -e BACKUP_STEM="$BACKUP_STEM" \
    -e BACKUP_CREATED_AT="$BACKUP_CREATED_AT" \
    -e SOURCE_BUILD_ID="$SOURCE_BUILD_ID" \
    -e TARGET_BUILD_ID="$GAME_BUILD_ID" \
    -e TARGET_REF="$REF" \
    -e BACKUP_SHA256="$BACKUP_SHA256" \
    -e BACKUP_SIZE_BYTES="$BACKUP_SIZE_BYTES" \
    app node --import tsx scripts/validate-backup.ts \
    > "backups/$BACKUP_STEM.manifest.json" || backup_failed
  rm -rf -- "$VALIDATION_DIR"
  VALIDATION_DIR=""
  chmod 600 \
    "backups/$BACKUP_STEM.tgz" \
    "backups/$BACKUP_STEM.manifest.json" \
    backups/replay-removals.latest.jsonl || backup_failed
  { cp .env "backups/env-$BACKUP_STEM" && chmod 600 "backups/env-$BACKUP_STEM"; } || backup_failed
  echo ">>> ✓ 备份完成: backups/$BACKUP_STEM.tgz"

  echo ">>> 清理旧 pre-deploy 备份（保留最近 5 份、最多 30 天）..."
  {
    ls -1t backups/pre-*.tgz 2>/dev/null | tail -n +6
    find backups -maxdepth 1 -name 'pre-*.tgz' -mtime +30 2>/dev/null
  } | sort -u | while read -r OLD; do
    STEM="$(basename "$OLD" .tgz)"
    rm -f "$OLD" "backups/$STEM.manifest.json" "backups/env-$STEM"
    echo ">>> 已删除旧备份 $STEM"
  done

  echo ">>> docker compose up..."
  GAME_BUILD_ID="$GAME_BUILD_ID" docker compose -f docker-compose.prod.yml up -d --remove-orphans
  RESTART_ON_EXIT=0

  echo ">>> 等待健康检查..."
  for i in $(seq 1 15); do
    sleep 3
    STATUS=$(docker inspect --format='{{.State.Health.Status}}' open-agricola-app-1 2>/dev/null || echo "unknown")
    if [ "$STATUS" = "healthy" ]; then
      echo ">>> ✓ 部署成功！"
      exit 0
    fi
    echo ">>> 等待中... ($i/15) [$STATUS]"
  done
  echo ">>> ✗ 健康检查超时，查看日志："
  docker compose -f docker-compose.prod.yml logs --tail 20 app
  exit 1
REMOTE_SCRIPT
