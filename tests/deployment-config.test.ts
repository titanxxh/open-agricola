import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('production deployment config', () => {
  it('requires an explicit registration policy so fresh deployments do not silently lock themselves', () => {
    const compose = readFileSync('docker-compose.prod.yml', 'utf8')
    expect(compose).toContain('ACCOUNT_REGISTRATION_POLICY=${ACCOUNT_REGISTRATION_POLICY:?')
    expect(compose).not.toContain('ACCOUNT_REGISTRATION_POLICY=${ACCOUNT_REGISTRATION_POLICY:-invite_only}')
  })

  it('passes the explicit registration policy through local backend deployment', () => {
    const script = readFileSync('deploy-backend.sh', 'utf8')
    expect(script).toContain(
      'REMOTE_ENV+=(ACCOUNT_REGISTRATION_POLICY="$ACCOUNT_REGISTRATION_POLICY")',
    )
    expect(script).toContain('ssh "$HOST" "${REMOTE_ENV[@]}" bash -s')
  })

  it('records the deployed remote commit as the game build ID', () => {
    const script = readFileSync('deploy-backend.sh', 'utf8')
    expect(script).toContain('GAME_BUILD_ID="$(git rev-parse HEAD)"')
    expect(script).toContain('GAME_BUILD_ID="$GAME_BUILD_ID" docker compose')
  })

  it('prevents container commands from consuming the remote deployment script', () => {
    const script = readFileSync('deploy-backend.sh', 'utf8')
    const sourceBuildRead = script.slice(
      script.indexOf('SOURCE_BUILD_ID="$('),
      script.indexOf('if [ -z "$SOURCE_BUILD_ID" ]'),
    )
    const backupValidationStart = script.indexOf('DB_PATH=/validation-data/open-agricola.db')
    const backupValidation = script.slice(
      backupValidationStart,
      script.indexOf('rm -rf -- "$VALIDATION_DIR"', backupValidationStart),
    )
    expect(sourceBuildRead).toContain('< /dev/null')
    expect(backupValidation).toContain('< /dev/null')
  })

  it('keeps Actions off self-hosted runners and long-lived repository secrets', () => {
    for (const file of readdirSync('.github/workflows').filter((name) => /\.ya?ml$/.test(name))) {
      const workflow = readFileSync(`.github/workflows/${file}`, 'utf8')
      expect(workflow).not.toContain('vars.RUNNER_LABEL')
      expect(workflow).not.toContain('self-hosted')
      expect(workflow).not.toMatch(/\bsecrets(?:\.|\[)/)
      for (const match of workflow.matchAll(/^\s*runs-on:\s*(.+)$/gm)) {
        expect(match[1]).toBe('ubuntu-latest')
      }
    }
  })

  it('validates each backup with the target image and writes a version manifest', () => {
    const dockerfile = readFileSync('Dockerfile', 'utf8')
    const script = readFileSync('deploy-backend.sh', 'utf8')
    expect(dockerfile).toContain('COPY scripts/validate-backup.ts ./scripts/')
    expect(script).toContain('SOURCE_BUILD_ID=')
    expect(script).toContain('BACKUP_SHA256=')
    expect(script).toContain('BACKUP_SIZE_BYTES=')
    expect(script).toContain('DB_PATH=/validation-data/open-agricola.db')
    expect(script).toContain('scripts/validate-backup.ts')
    expect(script).toContain('$BACKUP_STEM.manifest.json')
    expect(script).not.toContain('$VALIDATION_DIR:/validation-data:ro')
  })

  it('forwards replay recording settings into production', () => {
    for (const composePath of ['docker-compose.yml', 'docker-compose.prod.yml']) {
      const compose = readFileSync(composePath, 'utf8')
      for (const name of [
        'REPLAY_NEW_ROOMS_ENABLED',
        'REPLAY_VIEWER_BUILD_ID',
        'REPLAY_VIEWER_ROOT',
        'REPLAY_ASSET_ROOT',
        'GAME_BUILD_ID',
      ]) {
        expect(compose).toContain(`${name}=\${${name}`)
      }
    }
    expect(readFileSync('docker-compose.yml', 'utf8')).toContain(
      'REPLAY_TRUST_PROXY=${REPLAY_TRUST_PROXY:-false}',
    )
    const compose = readFileSync('docker-compose.prod.yml', 'utf8')
    expect(compose).toContain('REPLAY_TRUST_PROXY=true')
    expect(compose).toContain('app-data:/app/data')
    for (const composePath of ['docker-compose.yml', 'docker-compose.prod.yml']) {
      expect(readFileSync(composePath, 'utf8')).toContain(
        'BGA_CDN_BASE_URL=${BGA_CDN_BASE_URL:-}',
      )
    }
  })

  it('builds both frontends from the configured BGA CDN without checking out artwork', () => {
    for (const workflowPath of [
      '.github/workflows/ci.yml',
      '.github/workflows/ci-full.yml',
    ]) {
      const workflow = readFileSync(workflowPath, 'utf8')
      expect(workflow).toContain('BGA_CDN_BASE_URL: ${{ vars.BGA_CDN_BASE_URL }}')
      expect(workflow).not.toContain('bga-devs/bga-agricola')
      expect(workflow).not.toContain('BGA_IMAGE_DIR')
      expect(workflow).not.toContain('REPLAY_VIEWER_ALLOW_MISSING_BGA_ART')
    }
    const pages = readFileSync('.github/workflows/deploy-pages.yml', 'utf8')
    expect(pages).not.toContain('bga-devs/bga-agricola')
    expect(pages).not.toContain('BGA_IMAGE_DIR')
    expect(pages).not.toContain('PUBLIC_ASSET_LOCAL_DIR')
    expect(pages).toContain('BGA_CDN_BASE_URL: ${{ vars.BGA_CDN_BASE_URL }}')

    const replayViewer = readFileSync('replay-viewer/vite.config.ts', 'utf8')
    expect(replayViewer).toContain('bgaAssetUrls(bgaCdnBaseUrl)')
    expect(replayViewer).not.toContain('cpSync')
    expect(replayViewer).not.toContain('BGA_IMAGE_DIR')
  })

  it('uses commit-addressed public assets in both frontend builds', () => {
    const publicAssets = readFileSync('scripts/public-assets.ts', 'utf8')
    const site = readFileSync('vite.config.ts', 'utf8')
    const replayViewer = readFileSync('replay-viewer/vite.config.ts', 'utf8')
    expect(publicAssets).toContain(
      'raw.githubusercontent.com/titanxxh/open-agricola-assets/',
    )
    expect(site).toContain('publicAssetUrls(publicAssets')
    expect(replayViewer).toContain('loadPublicAssetConfig')
    expect(replayViewer).toContain('publicAssetUrls(publicAssets')
    expect(replayViewer).toContain('VITE_PUBLIC_ASSET_BASE_URL')
  })

  it('does not start the obsolete custom-code executor sidecar', () => {
    for (const composePath of ['docker-compose.yml', 'docker-compose.prod.yml']) {
      const compose = readFileSync(composePath, 'utf8')
      expect(compose).not.toContain('CUSTOM_CODE_EXECUTOR')
      expect(compose).not.toContain('server/custom-code-executor/index.ts')
      expect(compose).not.toContain('  executor:')
      expect(compose).not.toContain('      - executor')
    }
    const script = readFileSync('deploy-backend.sh', 'utf8')
    expect(script).toContain('up -d --remove-orphans')
  })

  it('restarts the app right after archiving so scheduled backup downtime only covers the tar step', () => {
    const script = readFileSync('backup-offsite.sh', 'utf8')
    const stopAt = script.indexOf('stop app')
    const tarAt = script.indexOf('tar -C /app/data -czf')
    const startAt = script.indexOf('restart_app || return 1')
    const validateAt = script.indexOf('scripts/validate-backup.ts')
    expect(stopAt).toBeGreaterThan(-1)
    expect(tarAt).toBeGreaterThan(stopAt)
    expect(startAt).toBeGreaterThan(tarAt)
    expect(validateAt).toBeGreaterThan(startAt)
  })

  it('shares one maintenance lock between deployment and scheduled backup', () => {
    const backup = readFileSync('backup-offsite.sh', 'utf8')
    const deploy = readFileSync('deploy-backend.sh', 'utf8')
    expect(backup).toContain('backups/.maintenance.lock')
    expect(deploy).toContain('backups/.maintenance.lock')
    expect(backup).toContain('flock -n 9')
    expect(deploy).toContain('flock -w 1800 9')
  })

  it('runs retention and offsite sync even when the daily backup fails', () => {
    const script = readFileSync('backup-offsite.sh', 'utf8')
    expect(script).toContain('if ! do_backup; then')
    const failureHandledAt = script.indexOf('if ! do_backup; then')
    const localPruneAt = script.indexOf('清理本地旧备份')
    const remotePruneAt = script.indexOf('清理远端旧备份')
    expect(localPruneAt).toBeGreaterThan(failureHandledAt)
    expect(remotePruneAt).toBeGreaterThan(localPruneAt)
    const rsyncFailureAt = script.indexOf('归档 rsync 失败，仍继续执行远端清理')
    expect(rsyncFailureAt).toBeGreaterThan(-1)
    expect(remotePruneAt).toBeGreaterThan(rsyncFailureAt)
  })

  it('restarts the app immediately when archiving fails instead of waiting for the exit trap', () => {
    const script = readFileSync('backup-offsite.sh', 'utf8')
    expect(script).toContain('discard_backup "打包"\n       restart_app || true\n       return 1')
    const restartFn = script.slice(script.indexOf('restart_app() {'), script.indexOf('do_backup() {'))
    expect(restartFn).toContain('RESTART_ON_EXIT=0')
    expect(restartFn).toContain('return 1')
  })

  it('propagates every ledger sync failure so cron reports it', () => {
    const script = readFileSync('backup-offsite.sh', 'utf8')
    expect(script).toContain('|| { echo ">>> ✗ 读取远端 ledger 大小失败"; return 1; }')
    expect(script).toContain('|| { echo ">>> ✗ ledger 推送失败"; return 1; }')
  })

  it('honors the configured removal ledger path in both backup modes', () => {
    const script = readFileSync('backup-offsite.sh', 'utf8')
    expect(script).toContain('REPLAY_REMOVAL_LEDGER_PATH')
    expect(script).toContain('cp app:"$CONTAINER_LEDGER" "$LEDGER"')
    expect(script).toContain('cp $CONTAINER_LEDGER /backup/replay-removals.latest.jsonl')
    expect(script).not.toContain('app:/app/data/replay-removals.jsonl')
  })

  it('enforces the offsite 30-day cap autonomously on the replica host', () => {
    const retention = readFileSync('deploy/offsite-retention.sh', 'utf8')
    const cron = readFileSync('deploy/open-agricola-offsite-retention.cron', 'utf8')
    expect(retention).toContain('MAX_AGE_MINUTES=$((30 * 24 * 60))')
    expect(retention).toContain('find . -maxdepth 1 -name \'*.tgz\' -mmin "+$MAX_AGE_MINUTES"')
    expect(retention).toContain('rm -f "$OLD" "$STEM.manifest.json" "env-$STEM"')
    expect(cron).toContain('CRON_TZ=UTC')
    expect(cron).toContain('/root/offsite-retention.sh')
  })

  it('protects the offsite removal ledger from rollback and syncs it on takedown', () => {
    const script = readFileSync('backup-offsite.sh', 'utf8')
    expect(script).toContain('cmp -s -n')
    expect(script).toContain("--exclude 'replay-removals.latest.jsonl'")
    expect(script).toContain('ledger-only')
  })

  it('validates each scheduled backup with the running image and writes a manifest', () => {
    const script = readFileSync('backup-offsite.sh', 'utf8')
    expect(script).toContain('BACKUP_SHA256=')
    expect(script).toContain('BACKUP_SIZE_BYTES=')
    expect(script).toContain('DB_PATH=/validation-data/open-agricola.db')
    expect(script).toContain('scripts/validate-backup.ts')
    expect(script).toContain('$BACKUP_STEM.manifest.json')
    expect(script).toContain('replay-removals.latest.jsonl')
  })

  it('keeps the offsite retention independent from local pruning and within the 30-day cap', () => {
    const script = readFileSync('backup-offsite.sh', 'utf8')
    const lines = script.split('\n')
    const rsyncStart = lines.findIndex((line) => line.trimStart().startsWith('rsync -az'))
    expect(rsyncStart).toBeGreaterThan(-1)
    let rsyncCommand = ''
    for (let i = rsyncStart; i < lines.length; i += 1) {
      rsyncCommand += lines[i]
      if (!lines[i]?.endsWith('\\')) break
    }
    expect(rsyncCommand).not.toContain('--delete')
    expect(rsyncCommand).toContain("--exclude '.validate-*'")
    expect(rsyncCommand).toContain('--exclude-from')
    expect(script).toContain('MAX_AGE_MINUTES=$((30 * 24 * 60))')
    const localAgePrunes =
      script.match(/find backups -maxdepth 1 -name '\*\.tgz' -mmin "\+\$MAX_AGE_MINUTES"/g) ?? []
    expect(localAgePrunes.length).toBeGreaterThanOrEqual(2)
    expect(script).toContain('find . -maxdepth 1 -name \'*.tgz\' -mmin "+$MAX_AGE_MINUTES"')
    expect(script).toContain("ls -1t daily-*.tgz 2>/dev/null | tail -n +31")
    expect(script).toContain("ls -1t pre-*.tgz 2>/dev/null | tail -n +11")
  })

  it('schedules the offsite backup via cron with log rotation', () => {
    const cron = readFileSync('deploy/open-agricola-backup.cron', 'utf8')
    const logrotate = readFileSync('deploy/open-agricola-backup.logrotate', 'utf8')
    expect(cron).toContain('CRON_TZ=UTC')
    expect(cron).toContain('/root/open-agricola/backup-offsite.sh')
    expect(cron).toContain('/var/log/open-agricola-backup.log')
    expect(logrotate).toContain('/var/log/open-agricola-backup.log')
  })
})
