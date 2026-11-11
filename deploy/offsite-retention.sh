#!/bin/bash
# 异机自治保留清理（安装到备份目标机，cron 定义见 deploy/open-agricola-offsite-retention.cron）
# 生产机每日备份自带远端清理；本脚本保证生产机丢失或长期失联时，
# 异机归档仍不超过 ADR-0010 的 30 天备份副本上限（按分钟计算避免整天舍入）。
# replay-removals.latest.jsonl 永不清理。
# 用法: ./offsite-retention.sh [backup-dir]   # 默认 /root/open-agricola-backups
set -e
DIR="${1:-/root/open-agricola-backups}"
RETENTION_DAYS="${2:-30}"
[[ "$RETENTION_DAYS" =~ ^[0-9]+$ ]] && (( RETENTION_DAYS >= 1 && RETENTION_DAYS <= 30 )) || { echo 'Invalid retention age'; exit 1; }
MAX_AGE_MINUTES=$((RETENTION_DAYS * 24 * 60))
DAILY_KEEP=30; PRE_KEEP=10
if (( RETENTION_DAYS == 7 )); then DAILY_KEEP=7; PRE_KEEP=1000000; fi
[[ "$(realpath -m -- "$DIR")" == "$DIR" ]] || { echo "Offsite scope contains an alias" >&2; exit 1; }
cd "$DIR"
committed() {
  local report stem
  for report in "$1"*.manifest.json; do
    [[ -f "$report" ]] || continue
    stem="${report%.manifest.json}"
    [[ -f "$stem.tgz" && -f "env-$stem" ]] || continue
    printf '%s %s\n' "$(stat -c '%Y' "$stem.tgz")" "$stem.tgz"
  done
}
{
  committed daily- | sort -nr | tail -n "+$((DAILY_KEEP + 1))" | cut -d ' ' -f 2-
  committed pre- | sort -nr | tail -n "+$((PRE_KEEP + 1))" | cut -d ' ' -f 2-
} | while IFS= read -r OLD; do
  STEM="${OLD%.tgz}"
  rm -f -- "$OLD" "$STEM.manifest.json" "env-$STEM"
done
find . -maxdepth 1 -name '*.tgz' -mmin "+$MAX_AGE_MINUTES" 2>/dev/null | sed 's|^\./||' \
  | while read -r OLD; do
      STEM="${OLD%.tgz}"
      rm -f "$OLD" "$STEM.manifest.json" "env-$STEM"
      echo ">>> 已删除超期备份 $STEM"
    done
find . -maxdepth 1 -type d -name '.incoming-*' -mmin "+$MAX_AGE_MINUTES" -exec rm -rf -- {} +
# A failed fresh transfer can contain rsync-preserved files from an older backup.
# Expire those bytes by the archive's age, not the new transfer directory's age.
find . -maxdepth 1 -type d -name '.incoming-*' -print0 \
  | while IFS= read -r -d '' INCOMING; do
      if [[ -n "$(find "$INCOMING" -type f \( -name '*.tgz' -o -name 'env-*' -o -name '*.manifest.json' \) -mmin "+$MAX_AGE_MINUTES" -print -quit)" ]]; then
        rm -rf -- "$INCOMING"
      fi
    done
