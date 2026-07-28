#!/bin/bash
# 一键更新并重新部署后端 Docker
# 用法: ./deploy-backend.sh <ssh-host> [branch] [remote-dir]
# 示例: ./deploy-backend.sh 1.2.3.4
#       ./deploy-backend.sh 1.2.3.4 ui
#       ./deploy-backend.sh root@1.2.3.4 main /home/user/open-agricola

set -e

# 如果没有 @ 则默认用 root 用户
_HOST="${1:-}"
if [[ "$_HOST" != *@* ]]; then
  HOST="root@$_HOST"
else
  HOST="$_HOST"
fi
BRANCH="${2:-main}"
REMOTE_DIR="${3:-/root/open-agricola}"

if [ -z "$HOST" ]; then
  echo "用法: ./deploy-backend.sh <ssh-host> [branch] [remote-dir]"
  echo "示例: ./deploy-backend.sh 1.2.3.4              # 部署 main"
  echo "      ./deploy-backend.sh 1.2.3.4 ui           # 部署 ui 分支"
  echo "      ./deploy-backend.sh root@1.2.3.4 main /home/user/open-agricola"
  exit 1
fi

echo ">>> 部署后端到 $HOST:$REMOTE_DIR (分支: $BRANCH)"

REMOTE_ENV=()
if [ -n "${ACCOUNT_REGISTRATION_POLICY:-}" ]; then
  REMOTE_ENV+=(ACCOUNT_REGISTRATION_POLICY="$ACCOUNT_REGISTRATION_POLICY")
fi

ssh "$HOST" "${REMOTE_ENV[@]}" bash -s "$REMOTE_DIR" "$BRANCH" << 'REMOTE_SCRIPT'
  set -e
  REMOTE_DIR="$1"
  BRANCH="$2"
  cd "$REMOTE_DIR"

  echo ">>> git fetch + checkout $BRANCH..."
  git fetch origin "$BRANCH"
  git reset --hard "origin/$BRANCH"
  GAME_BUILD_ID="$(git rev-parse HEAD)"

  echo ">>> docker compose build..."
  GAME_BUILD_ID="$GAME_BUILD_ID" docker compose -f docker-compose.prod.yml up -d --build --remove-orphans

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
