#!/usr/bin/env bash
# Runs over SSH after files have arrived in a private incoming directory.
set -euo pipefail
ROOT="${1:?Backup directory required}"
INCOMING="${2:?Incoming directory required}"
DEADLINE="${3:?Absolute backup deadline required}"
[[ "$INCOMING" =~ ^\.incoming-[a-zA-Z0-9-]+$ ]] || { echo 'Invalid incoming directory'; exit 1; }
[[ "$DEADLINE" =~ ^[0-9]+$ ]] || { echo 'Invalid backup deadline'; exit 1; }
ROOT="$(cd "$ROOT" && pwd -P)"
STAGE="$ROOT/$INCOMING"
cleanup() { rm -rf -- "$STAGE"; }
trap cleanup EXIT
trap 'exit 124' INT TERM HUP
check_deadline() { (( $(date +%s%N) / 1000000 < DEADLINE )) || { echo 'Backup deadline exceeded' >&2; return 124; }; }
check_deadline
cd "$STAGE"
[[ -f checksums.tsv ]] || { echo 'Missing transfer checksums'; exit 1; }
while IFS=$'\t' read -r hash size name; do
  [[ "$hash" =~ ^[a-f0-9]{64}$ && "$size" =~ ^[0-9]+$ && "$name" =~ ^[a-zA-Z0-9._-]+$ ]] || { echo 'Invalid backup transfer identity'; exit 1; }
  [[ -f "$name" && "$(stat -c '%s' "$name")" == "$size" && "$(sha256sum "$name" | cut -d ' ' -f 1)" == "$hash" ]] || { echo "Incomplete backup transfer: $name"; exit 1; }
  if [[ -e "../$name" && ! "$name" -ef "../$name" ]]; then
    cmp -s "$name" "../$name" || { echo "Refusing to overwrite a different backup file: $name"; exit 1; }
  fi
done < checksums.tsv
shopt -s nullglob
reports=(*.manifest.json)
for report in "${reports[@]}"; do
  stem="${report%.manifest.json}"
  [[ "$stem" =~ ^(daily|pre|manual)-[a-zA-Z0-9._-]+$ ]] || exit 1
  for name in "$stem.tgz" "env-$stem" "$report"; do
    [[ -f "$name" ]] && awk -F '\t' -v name="$name" '$3 == name { found = 1 } END { exit !found }' checksums.tsv || { echo "Incomplete backup set: $stem"; exit 1; }
  done
done
publish() {
  check_deadline
  if [[ -e "../$1" ]]; then rm -- "$1"
  else mv -- "$1" "../$1"; fi
}
for report in "${reports[@]}"; do
  stem="${report%.manifest.json}"
  publish "$stem.tgz"
  publish "env-$stem"
  publish "$report"
done
cd ..
echo 'Complete backup sets committed offsite'
