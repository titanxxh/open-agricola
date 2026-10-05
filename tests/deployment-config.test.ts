import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Execute the CLI and its remote command, replacing SSH/sudo/bash with capture tools.
// The deployment body is never executed and no network connection is opened.
function captureBackendDeployment(args: string[], policy?: string) {
  const directory = mkdtempSync(join(tmpdir(), 'open-agricola-deploy-'))
  const captures = {
    ssh: join(directory, 'ssh-args'),
    sudo: join(directory, 'sudo-args'),
    bash: join(directory, 'bash-args'),
    policy: join(directory, 'registration-policy'),
  }
  try {
    writeFileSync(join(directory, 'ssh'), `#!/bin/bash
printf '%s\\0' "$@" > "$OA_DEPLOY_CAPTURE/ssh-args"
exec /bin/bash -c "$2"
`, { mode: 0o700 })
    writeFileSync(join(directory, 'sudo'), `#!/bin/bash
printf '%s\\0' "$@" > "$OA_DEPLOY_CAPTURE/sudo-args"
exit 99
`, { mode: 0o700 })
    writeFileSync(join(directory, 'bash'), `#!/bin/bash
printf '%s\\0' "$@" > "$OA_DEPLOY_CAPTURE/bash-args"
printf '%s' "\${ACCOUNT_REGISTRATION_POLICY:-}" > "$OA_DEPLOY_CAPTURE/registration-policy"
`, { mode: 0o700 })
    const env: NodeJS.ProcessEnv = { ...process.env, PATH: `${directory}:${process.env.PATH}`, OA_DEPLOY_CAPTURE: directory }
    delete env.ACCOUNT_REGISTRATION_POLICY
    if (policy !== undefined) env.ACCOUNT_REGISTRATION_POLICY = policy
    const result = spawnSync('/bin/bash', ['deploy-backend.sh', ...args], { env, encoding: 'utf8' })
    if (result.error) throw result.error
    if (result.status !== 0) throw new Error(`deployment capture failed: ${result.stderr}`)
    const capturedArgs = (file: string) => existsSync(file)
      ? readFileSync(file, 'utf8').split('\0').slice(0, -1)
      : []
    return {
      host: capturedArgs(captures.ssh)[0],
      sudo: capturedArgs(captures.sudo),
      args: capturedArgs(captures.bash),
      policy: readFileSync(captures.policy, 'utf8'),
    }
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

describe('production deployment config', () => {
  it('requires an explicit registration policy so fresh deployments do not silently lock themselves', () => {
    const compose = readFileSync('docker-compose.prod.yml', 'utf8')
    expect(compose).toContain('ACCOUNT_REGISTRATION_POLICY=${ACCOUNT_REGISTRATION_POLICY:?')
    expect(compose).not.toContain('ACCOUNT_REGISTRATION_POLICY=${ACCOUNT_REGISTRATION_POLICY:-invite_only}')
  })

  it('passes the explicit registration policy through local backend deployment', () => {
    const deployment = captureBackendDeployment([], 'invite_only')
    expect(deployment.host).toBe('ubuntu@ten-kr')
    expect(deployment.sudo).toEqual([])
    expect(deployment.args).toEqual(['-s', '/home/ubuntu/open-agricola', 'main'])
    expect(deployment.policy).toBe('invite_only')
  })

  it('supports an explicit SSH user, version and directory without privilege escalation', () => {
    const deployment = captureBackendDeployment(['operator@example.com', 'v0.7.9', '/srv/game'], 'open')
    expect(deployment.host).toBe('operator@example.com')
    expect(deployment.sudo).toEqual([])
    expect(deployment.args).toEqual(['-s', '/srv/game', 'v0.7.9'])
    expect(deployment.policy).toBe('open')
  })

  it('treats remote paths, refs and registration policy as literal arguments', () => {
    // Shell evaluation would exit early or alter the captured arguments.
    const remoteDir = '/srv/game folder; exit 71'
    const ref = 'topic/$(exit 72)'
    const policy = 'invite_only; exit 73'
    const deployment = captureBackendDeployment(['ten-kr', ref, remoteDir], policy)
    expect(deployment.host).toBe('ubuntu@ten-kr')
    expect(deployment.sudo).toEqual([])
    expect(deployment.args).toEqual(['-s', remoteDir, ref])
    expect(deployment.policy).toBe(policy)
  })

  it('records the target commit in the image before validating live storage', () => {
    const script = readFileSync('deploy-backend.sh', 'utf8')
    expect(script).toContain('TARGET_REF="$(git rev-parse FETCH_HEAD)"')
    expect(script).toContain('export GAME_BUILD_ID="$TARGET_REF"')
    expect(script).toContain('check-live "$TARGET_REF" --applications-stopped')
    expect(script.indexOf('bash scripts/backup-storage.sh')).toBeLessThan(script.indexOf('check-live "$TARGET_REF"'))
    expect(script).not.toContain('reset --hard')
  })

  it('detaches deployment commands from the SSH script input', () => {
    const script = readFileSync('deploy-backend.sh', 'utf8')
    expect(script).toContain('deploy_backend() {')
    expect(script).toContain('deploy_backend "$@" < /dev/null')
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

  it('packages native backup tools and runs the application as the deployment user', () => {
    const dockerfile = readFileSync('Dockerfile', 'utf8')
    expect(dockerfile).toContain('COPY --chown=node:node scripts/ ./scripts/')
    expect(dockerfile).toContain('USER node')
    const compose = readFileSync('docker-compose.prod.yml', 'utf8')
    expect(compose.match(/user: "\$\{APP_UID:-1000\}:\$\{APP_GID:-1000\}"/g)).toHaveLength(2)
    for (const file of ['deploy-backend.sh', 'backup-offsite.sh', 'scripts/backup-storage.sh']) {
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
      '.github/workflows/ci-full.yml',
      '.github/workflows/deploy-pages.yml',
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
    const script = readFileSync('deploy-backend.sh', 'utf8')
    expect(script).toContain('up -d --remove-orphans')
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
    expect(script).toContain('if ! MAINTENANCE_LOCK_HELD=1 bash scripts/backup-storage.sh')
    const failureHandledAt = script.indexOf('if ! MAINTENANCE_LOCK_HELD=1 bash scripts/backup-storage.sh')
    const localPruneAt = script.indexOf('清理本地旧备份')
    const remotePruneAt = script.indexOf('清理远端旧备份')
    expect(localPruneAt).toBeGreaterThan(failureHandledAt)
    expect(remotePruneAt).toBeGreaterThan(localPruneAt)
    const rsyncFailureAt = script.indexOf('归档 rsync 失败，仍继续执行远端清理')
    expect(rsyncFailureAt).toBeGreaterThan(-1)
    expect(remotePruneAt).toBeGreaterThan(rsyncFailureAt)
  })



  it('propagates shared-ledger sync failures to the cron exit status', () => {
    const script = readFileSync('backup-offsite.sh', 'utf8')
    expect(script).toContain('sync_ledger || LEDGER_OK=0')
    expect(script).toContain('[ "$LEDGER_OK" != 1 ]')
    const sync = script.slice(script.indexOf('sync_ledger() {'), script.indexOf('if [ "$MODE" = "ledger-only" ]; then', script.indexOf('sync_ledger() {')))
    expect(sync.match(/\|\| return 1/g)).toHaveLength(4)
  })

  it('unions independent S3 erasure facts before copying them offsite', () => {
    const script = readFileSync('backup-offsite.sh', 'utf8')
    const mergeAt = script.indexOf('storage-archive-cli.ts ledger-merge')
    const exportAt = script.indexOf('storage-archive-cli.ts ledger-export')
    const uploadAt = script.indexOf('rsync -a -e')
    expect(mergeAt).toBeGreaterThan(-1)
    expect(exportAt).toBeGreaterThan(mergeAt)
    expect(uploadAt).toBeGreaterThan(exportAt)
    expect(script).not.toContain('REPLAY_REMOVAL_LEDGER_PATH')
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

  it('keeps the independent erasure ledger outside ordinary archive synchronization', () => {
    const script = readFileSync('backup-offsite.sh', 'utf8')
    expect(script).toContain("--exclude 'replay-removals.latest.json'")
    expect(script).toContain('ledger-only')
    expect(readFileSync('scripts/backup-storage.sh', 'utf8')).toContain('ledger-export /backup/replay-removals.latest.json')
  })

  it('shares the native archive helper between scheduled and pre-deploy backups', () => {
    expect(readFileSync('backup-offsite.sh', 'utf8')).toContain('bash scripts/backup-storage.sh "$BACKUP_STEM"')
    expect(readFileSync('deploy-backend.sh', 'utf8')).toContain('bash scripts/backup-storage.sh "$STEM" --already-stopped')
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
    expect(cron).toContain('0 20 * * * ubuntu /home/ubuntu/open-agricola/backup-offsite.sh')
    expect(cron).toContain('/home/ubuntu/open-agricola/logs/backup.log')
    expect(logrotate).toContain('/home/ubuntu/open-agricola/logs/backup.log')
    expect(logrotate).toContain('su ubuntu ubuntu')
    expect(logrotate).toContain('create 600 ubuntu ubuntu')
  })
})
