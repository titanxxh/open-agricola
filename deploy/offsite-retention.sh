#!/bin/bash
# 异机自治保留清理（安装到备份目标机，cron 定义见 deploy/open-agricola-offsite-retention.cron）
# 生产机每日备份自带远端清理；本脚本保证生产机丢失或长期失联时，
# 异机归档仍不超过 ADR-0010 的 30 天备份副本上限（按分钟计算避免整天舍入）。
# replay-removals.latest.jsonl 永不清理。
# 用法: ./offsite-retention.sh [backup-dir]   # 默认 /root/open-agricola-backups
set -e
DIR="${1:-/root/open-agricola-backups}"
MAX_AGE_MINUTES=$((30 * 24 * 60))
cd "$DIR"
find . -maxdepth 1 -name '*.tgz' -mmin "+$MAX_AGE_MINUTES" 2>/dev/null | sed 's|^\./||' \
  | while read -r OLD; do
      STEM="${OLD%.tgz}"
      rm -f "$OLD" "$STEM.manifest.json" "env-$STEM"
      echo ">>> 已删除超期备份 $STEM"
    done
