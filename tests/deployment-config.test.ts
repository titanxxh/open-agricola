import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function expectWorkflowSecrets(file: string, workflow: string): void {
  if (file === 'container-image-build.yml') {
    const imageJob = workflow.match(/^ {2}image:\n(?: {4}[^\n]*\n|\n)*/m)?.[0] ?? ''
    expect(workflow).toContain('jobs:\n' + imageJob)
    expect(imageJob).toMatch(/^ {2}image:\n {4}if: github.ref == 'refs\/heads\/main'\n {4}runs-on: ubuntu-latest\n {4}timeout-minutes: 60\n {4}environment: prerelease-image-publish\n {4}steps:\n/)
    const publishAfterStop = [
      '      - name: Build image and stop candidate execution',
      '        run: node policy/scripts/ci/container-image-build.ts build',
      '      - name: Verify stopped build output',
      '        run: node policy/scripts/ci/container-image-build.ts verify',
      '      - name: Publish private image',
      '        env:',
      '          GH_TOKEN: ${{ github.token }}',
      '          GHCR_PUBLISH_TOKEN: ${{ secrets.GHCR_PUBLISH_TOKEN }}',
      '          GHCR_PUBLISH_USER: ${{ vars.GHCR_PUBLISH_USER }}',
      '          GHCR_PRIVATE_PACKAGE_ID: ${{ vars.GHCR_PRIVATE_PACKAGE_ID }}',
      '        run: node policy/scripts/ci/container-image-build.ts publish',
      '',
    ].join('\n')
    expect(imageJob).toContain(publishAfterStop)
    workflow = workflow.replace(publishAfterStop, publishAfterStop.replace('${{ secrets.GHCR_PUBLISH_TOKEN }}', ''))
  }
  expect(workflow).not.toMatch(/\bsecrets\s*(?:\.|\[)/)
}

describe('production deployment config', () => {
  it('requires an explicit registration policy so fresh deployments do not silently lock themselves', () => {
    const compose = readFileSync('docker-compose.prod.yml', 'utf8')
    expect(compose).toContain('ACCOUNT_REGISTRATION_POLICY=${ACCOUNT_REGISTRATION_POLICY:?')
    expect(compose).not.toContain('ACCOUNT_REGISTRATION_POLICY=${ACCOUNT_REGISTRATION_POLICY:-invite_only}')
  })

  it('keeps Actions on hosted runners and permits only the protected image publish secret', () => {
    for (const file of readdirSync('.github/workflows').filter((name) => /\.ya?ml$/.test(name))) {
      const workflow = readFileSync(`.github/workflows/${file}`, 'utf8')
      expect(workflow).not.toContain('vars.RUNNER_LABEL')
      expect(workflow).not.toContain('self-hosted')
      expectWorkflowSecrets(file, workflow)
      for (const match of workflow.matchAll(/^\s*runs-on:\s*(.+)$/gm)) {
        expect(match[1]).toBe('ubuntu-latest')
      }
    }
  })

  it.each([
    ['another workflow', 'container-copy.yml', (workflow: string) => workflow],
    ['another secret', 'container-image-build.yml', (workflow: string) => workflow.replace('secrets.GHCR_PUBLISH_TOKEN', 'secrets.OTHER_TOKEN')],
    ['job-level secret', 'container-image-build.yml', (workflow: string) => workflow.replace('    steps:', '    env: { TOKEN: ${{ secrets.GHCR_PUBLISH_TOKEN }} }\n    steps:')],
    ['candidate secret', 'container-image-build.yml', (workflow: string) => workflow.replace('      - name: Build image and stop candidate execution', '      - run: echo ${{ secrets.GHCR_PUBLISH_TOKEN }}\n      - name: Build image and stop candidate execution')],
    ['unprotected branch', 'container-image-build.yml', (workflow: string) => workflow.replace("github.ref == 'refs/heads/main'", 'always()')],
    ['another environment', 'container-image-build.yml', (workflow: string) => workflow.replace('environment: prerelease-image-publish', 'environment: other')],
    ['missing stop', 'container-image-build.yml', (workflow: string) => workflow.replace('container-image-build.ts build', 'container-image-build.ts prepare')],
    ['skipped verification', 'container-image-build.yml', (workflow: string) => workflow.replace('      - name: Verify stopped build output', '      - name: Verify stopped build output\n        if: false')],
  ])('rejects image publish secret outside its approved boundary: %s', (_name, file, mutate) => {
    const workflow = readFileSync('.github/workflows/container-image-build.yml', 'utf8')
    expect(() => expectWorkflowSecrets(file, mutate(workflow))).toThrow()
  })

  it('packages native backup tools and runs the application as the deployment user', () => {
    const dockerfile = readFileSync('Dockerfile', 'utf8')
    expect(dockerfile).toContain('COPY --chown=node:node scripts/ ./scripts/')
    expect(dockerfile).toContain('USER node')
    const compose = readFileSync('docker-compose.prod.yml', 'utf8')
    expect(compose.match(/user: "\$\{APP_UID:-1000\}:\$\{APP_GID:-1000\}"/g)).toHaveLength(2)
    for (const file of ['backup-offsite.sh', 'scripts/backup-storage.sh']) {
      expect(readFileSync(file, 'utf8')).toContain('export APP_UID="$(id -u)" APP_GID="$(id -g)"')
    }
  })

  it('uses mandatory recording and shared dependencies in both container entry points', () => {
    for (const composePath of ['docker-compose.yml', 'docker-compose.prod.yml']) {
      const compose = readFileSync(composePath, 'utf8')
      expect(compose).toContain('dependencies.compose.env')
      expect(compose).toContain('APP_INSTANCES')
      for (const obsolete of ['REPLAY_NEW_ROOMS_ENABLED', 'PERSIST_ROOMS', 'DB_PATH', 'app-data:/app/data', 'BGA_CDN_BASE_URL']) {
        expect(compose).not.toContain(obsolete)
      }
    }
    expect(readFileSync('docker-compose.prod.yml', 'utf8')).toContain('REPLAY_TRUST_PROXY=true')
    expect(readFileSync('Dockerfile', 'utf8')).toContain('scripts/container-entry.ts')
  })

  it('builds both frontends from the pinned public asset repository only', () => {
    for (const workflowPath of [
      '.github/workflows/ci.yml',
      '.github/workflows/candidate-verification.yml',
      '.github/workflows/deploy-pages-broker.yml',
    ]) {
      const workflow = readFileSync(workflowPath, 'utf8')
      expect(workflow).not.toContain('BGA_CDN_BASE_URL')
      expect(workflow).not.toContain('BGA_IMAGE_DIR')
      expect(workflow).not.toContain('PUBLIC_ASSET_LOCAL_DIR')
    }

    const replayViewer = readFileSync('replay-viewer/vite.config.ts', 'utf8')
    expect(replayViewer).toContain('publicAssetUrls(publicAssets')
    expect(replayViewer).not.toContain('bgaAssetUrls')
    expect(replayViewer).not.toContain('cpSync')
    expect(replayViewer).not.toContain('BGA_IMAGE_DIR')
  })

  it('uses Pages public assets in both frontend builds', () => {
    const publicAssets = readFileSync('scripts/public-assets.ts', 'utf8')
    const site = readFileSync('vite.config.ts', 'utf8')
    const replayViewer = readFileSync('replay-viewer/vite.config.ts', 'utf8')
    expect(publicAssets).toContain(
      'https://titanxxh.github.io/open-agricola-assets/',
    )
    expect(publicAssets).not.toContain('raw.githubusercontent.com')
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
  })

  it('runs retention and offsite sync even when the daily backup fails', () => {
    const script = readFileSync('backup-offsite.sh', 'utf8')
    expect(script).toContain('if [[ "$MODE" == full ]] && ! MAINTENANCE_LOCK_HELD=1 bash "$POLICY_ROOT/scripts/backup-storage.sh" "$BACKUP_STEM"; then')
    const failureHandledAt = script.indexOf('if [[ "$MODE" == full ]] && ! MAINTENANCE_LOCK_HELD=1 bash "$POLICY_ROOT/scripts/backup-storage.sh" "$BACKUP_STEM"; then')
    const localPruneAt = script.indexOf('backup_command node "$POLICY_ROOT/scripts/backup-files.mjs" prune backups "${BACKUP_DAILY_COUNT:-7}" "${BACKUP_PRE_COUNT:-5}"')
    const remotePruneAt = script.indexOf('"$OFFSITE_BACKUP_REMOTE_DIR" "${BACKUP_RETENTION_DAYS:-30}" < "$POLICY_ROOT/deploy/offsite-retention.sh"')
    expect(localPruneAt).toBeGreaterThan(failureHandledAt)
    expect(remotePruneAt).toBeGreaterThan(localPruneAt)
    const rsyncFailureAt = script.indexOf('Offsite transfer failed')
    expect(rsyncFailureAt).toBeGreaterThan(-1)
    expect(remotePruneAt).toBeGreaterThan(rsyncFailureAt)
  })

  it('propagates shared-ledger sync failures to the cron exit status', () => {
    const script = readFileSync('backup-offsite.sh', 'utf8')
    expect(script).toContain('sync_ledger || LEDGER_OK=0')
    expect(script).toContain('"$LEDGER_OK" != 1')
  })

  it('unions independent S3 erasure facts before copying them offsite', () => {
    const script = readFileSync('backup-offsite.sh', 'utf8')
    const mergeAt = script.indexOf('backup_container ledger-merge')
    const exportAt = script.indexOf('backup_container ledger-export')
    const uploadAt = script.indexOf('rsync -a -e')
    expect(mergeAt).toBeGreaterThan(-1)
    expect(exportAt).toBeGreaterThan(mergeAt)
    expect(uploadAt).toBeGreaterThan(exportAt)
    expect(script).not.toContain('REPLAY_REMOVAL_LEDGER_PATH')
  })

  it('enforces the offsite 30-day cap autonomously on the replica host', () => {
    const retention = readFileSync('deploy/offsite-retention.sh', 'utf8')
    const cron = readFileSync('deploy/open-agricola-offsite-retention.cron', 'utf8')
    expect(retention).toContain('RETENTION_DAYS="${2:-30}"')
    expect(retention).toContain('RETENTION_DAYS >= 1 && RETENTION_DAYS <= 30')
    expect(retention).toContain('MAX_AGE_MINUTES=$((RETENTION_DAYS * 24 * 60))')
    expect(retention).toContain('find . -maxdepth 1 -name \'*.tgz\' -mmin "+$MAX_AGE_MINUTES"')
    expect(retention).toContain('rm -f "$OLD" "$STEM.manifest.json" "env-$STEM"')
    expect(cron).not.toMatch(/^CRON_TZ=/m)
    expect(cron).toContain('30 5 * * * root /root/offsite-retention.sh')
    expect(cron).toContain('/root/offsite-retention.sh')
  })

  it('keeps the independent erasure ledger outside ordinary archive synchronization', () => {
    const script = readFileSync('backup-offsite.sh', 'utf8')
    const files = readFileSync('scripts/backup-files.mjs', 'utf8')
    expect(files).not.toContain('replay-removals.latest.json')
    expect(script).toContain('backup_command node "$POLICY_ROOT/scripts/backup-files.mjs" list backups')
    expect(script).toContain('POLICY_ROOT="${BACKUP_POLICY_ROOT:-$(cd "$(dirname "$0")" && pwd)}"')
    expect(script).toContain('cd "${BACKUP_WORKING_DIRECTORY:-$POLICY_ROOT}"')
    expect(files).toContain('Number(process.env.BACKUP_RETENTION_DAYS ?? 30)')
    expect(script).toContain('ledger-only')
    expect(readFileSync('scripts/backup-storage.sh', 'utf8')).toContain('ledger-export /backup/replay-removals.latest.json')
  })

  it('uses the native archive helper for scheduled backups', () => {
    expect(readFileSync('backup-offsite.sh', 'utf8')).toContain('bash "$POLICY_ROOT/scripts/backup-storage.sh" "$BACKUP_STEM"')
  })

  it('keeps the offsite retention independent from local pruning and within the 30-day cap', () => {
    const script = readFileSync('backup-offsite.sh', 'utf8')
    const retention = readFileSync('deploy/offsite-retention.sh', 'utf8')
    const rsyncStart = script.indexOf('backup_rsync -az')
    expect(rsyncStart).toBeGreaterThan(-1)
    const rsyncEnd = script.indexOf('&& backup_rsync -a', rsyncStart)
    expect(rsyncEnd).toBeGreaterThan(rsyncStart)
    const rsyncCommand = script.slice(rsyncStart, rsyncEnd)
    expect(rsyncCommand).not.toContain('--delete')
    expect(rsyncCommand).toContain('--files-from=')
    expect(script).toContain('backup_command node "$POLICY_ROOT/scripts/backup-files.mjs" prune backups "${BACKUP_DAILY_COUNT:-7}" "${BACKUP_PRE_COUNT:-5}"')
    expect(retention).toContain('RETENTION_DAYS="${2:-30}"')
    expect(retention).toContain('RETENTION_DAYS >= 1 && RETENTION_DAYS <= 30')
    expect(retention).toContain('MAX_AGE_MINUTES=$((RETENTION_DAYS * 24 * 60))')
    expect(retention).toContain('DAILY_KEEP=30; PRE_KEEP=10')
    expect(retention).toContain('committed daily- | sort -nr | tail -n "+$((DAILY_KEEP + 1))"')
    expect(retention).toContain('committed pre- | sort -nr | tail -n "+$((PRE_KEEP + 1))"')
  })

  it('schedules the offsite backup at 04:00 in the host timezone with log rotation', () => {
    const cron = readFileSync('deploy/open-agricola-backup.cron', 'utf8')
    const logrotate = readFileSync('deploy/open-agricola-backup.logrotate', 'utf8')
    expect(cron).not.toMatch(/^CRON_TZ=/m)
    expect(cron).toContain('0 4 * * * ubuntu /home/ubuntu/open-agricola/backup-offsite.sh')
    expect(cron).toContain('/home/ubuntu/open-agricola/logs/backup.log')
    expect(logrotate).toContain('/home/ubuntu/open-agricola/logs/backup.log')
    expect(logrotate).toContain('su ubuntu ubuntu')
    expect(logrotate).toContain('create 600 ubuntu ubuntu')
  })
})
