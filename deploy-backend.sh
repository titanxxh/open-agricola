#!/bin/bash
# 一键更新并重新部署后端 Docker
# 用法: ./deploy-backend.sh [ssh-host]
# 示例: ./deploy-backend.sh root@your-vps-ip
#       ./deploy-backend.sh my-vps          (使用 ~/.ssh/config 里的别名)

set -e

# 如果没有 @ 则默认用 root 用户
_HOST="${1:-}"
if [[ "$_HOST" != *@* ]]; then
  HOST="root@$_HOST"
else
  HOST="$_HOST"
fi
REMOTE_DIR="${2:-/root/open-agricola}"

if [ -z "$HOST" ]; then
  echo "用法: ./deploy-backend.sh <ssh-host> [remote-dir]"
  echo "示例: ./deploy-backend.sh root@1.2.3.4"
  echo "      ./deploy-backend.sh root@1.2.3.4 /home/user/open-agricola"
  exit 1
fi

echo ">>> 部署后端到 $HOST:$REMOTE_DIR"

ssh "$HOST" bash -s "$REMOTE_DIR" << 'REMOTE_SCRIPT'
  set -e
  REMOTE_DIR="$1"
  cd "$REMOTE_DIR"

  echo ">>> git pull..."
  git pull origin main

  echo ">>> docker compose build..."
  docker compose -f docker-compose.prod.yml up -d --build

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
