#!/usr/bin/env bash
# Native PostgreSQL + immutable S3 backup, validated by the selected app image.
set -euo pipefail
cd "$(dirname "$0")/.."
export APP_UID="$(id -u)" APP_GID="$(id -g)"
umask 077
STEM="${1:?Usage: backup-storage.sh <daily-|pre-|manual-name> [--already-stopped]}"
[[ "$STEM" =~ ^(daily|pre|manual)-[a-zA-Z0-9._-]+$ ]] || { echo 'Invalid backup name'; exit 1; }
mkdir -p backups
if [[ "${MAINTENANCE_LOCK_HELD:-0}" != 1 ]]; then
  exec 9>backups/.maintenance.lock
  flock -w 1800 9
fi
COMPOSE=(docker compose -f docker-compose.prod.yml)
TOOLS=("${COMPOSE[@]}" run --rm --no-deps --user "$(id -u):$(id -g)" -v "$PWD/backups:/backup" app node --import tsx scripts/storage-archive-cli.ts)
CAPTURE="backups/.capture-$STEM"
[[ ! -e "$CAPTURE" && ! -e "backups/$STEM.tgz" ]] || { echo 'Backup already exists'; exit 1; }
RESTART=0
SUCCESS=0
if [[ -z "${SOURCE_BUILD_ID:-}" ]]; then
  SOURCE_BUILD_ID="$("${COMPOSE[@]}" exec -T app node -p 'process.env.GAME_BUILD_ID' 2>/dev/null || git rev-parse HEAD)"
fi
cleanup() {
  if [[ "$RESTART" == 1 ]]; then "${COMPOSE[@]}" start app || true; fi
  rm -rf -- "$CAPTURE"
  if [[ "$SUCCESS" != 1 ]]; then rm -f "backups/$STEM.tgz" "backups/$STEM.manifest.json" "backups/env-$STEM"; fi
}
trap cleanup EXIT
trap 'exit 130' INT TERM HUP
if [[ "${2:-}" != '--already-stopped' ]]; then
  RESTART=1
  "${COMPOSE[@]}" stop app
fi
"${TOOLS[@]}" ledger-export /backup/replay-removals.latest.json
"${COMPOSE[@]}" run --rm --no-deps --user "$(id -u):$(id -g)"   -e GAME_BUILD_ID="$SOURCE_BUILD_ID" -v "$PWD/backups:/backup" app   node --import tsx scripts/storage-archive-cli.ts export "/backup/.capture-$STEM" --applications-stopped
# Credentials/encryption keys are kept separately from the ordinary archive.
ENV_FILES=(.env data/dependencies.compose.env)
[[ ! -f data/local-services.env ]] || ENV_FILES+=(data/local-services.env)
tar -czf "backups/env-$STEM" "${ENV_FILES[@]}"
tar -C "$CAPTURE" -czf "backups/$STEM.tgz" .
if [[ "$RESTART" == 1 ]]; then "${COMPOSE[@]}" start app; RESTART=0; fi
"${TOOLS[@]}" validate "/backup/.capture-$STEM" > "backups/$STEM.manifest.json"
# Bind the portable archive to the target-build validation report.
node --input-type=module - "$STEM" <<'NODE'
import { createHash } from 'node:crypto'
import { createReadStream, readFileSync, statSync, writeFileSync } from 'node:fs'
const stem = process.argv[2], file = `backups/${stem}.tgz`, reportPath = `backups/${stem}.manifest.json`
const hash = createHash('sha256')
for await (const bytes of createReadStream(file)) hash.update(bytes)
const report = JSON.parse(readFileSync(reportPath, 'utf8'))
Object.assign(report, { backupStem: stem, archiveSha256: hash.digest('hex'), archiveSizeBytes: statSync(file).size })
writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 })
NODE
chmod 600 "backups/$STEM.tgz" "backups/$STEM.manifest.json" "backups/env-$STEM" backups/replay-removals.latest.json
SUCCESS=1
cp "backups/$STEM.manifest.json" backups/.observability-manifest.tmp
mv backups/.observability-manifest.tmp backups/observability.latest.json
chmod 600 backups/observability.latest.json
echo "Validated native backup: backups/$STEM.tgz"
