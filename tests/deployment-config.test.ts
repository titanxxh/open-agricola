import { stableConfiguration } from '../scripts/ci/candidate-verification'
import { execFileSync, spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { finalSnapshotMetadata } from '../scripts/__tests__/_helpers/candidate-provenance'

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

// Run the public candidate checker against local Git and controlled GitHub evidence.
// Capture the remote command without executing the deployment body or opening SSH.
function captureBackendDeployment(args: string[], policy?: string) {
  const directory = mkdtempSync(join(tmpdir(), 'open-agricola-deploy-'))
  const repository = process.cwd()
  const bin = join(directory, 'bin')
  const captures = {
    ssh: join(bin, 'ssh-args'),
    sudo: join(bin, 'sudo-args'),
    bash: join(bin, 'bash-args'),
    policy: join(bin, 'registration-policy'),
    ref: join(bin, 'candidate-ref'),
  }
  try {
    mkdirSync(join(directory, 'scripts'), { recursive: true })
    mkdirSync(join(directory, '.github/workflows'), { recursive: true })
    for (const path of ['scripts/ci', 'scripts/release', '.github/workflows/candidate-verification.yml', 'deploy-backend.sh', 'package.json', 'pnpm-lock.yaml']) {
      cpSync(join(repository, path), join(directory, path), { recursive: true })
    }
    writeFileSync(join(directory, '.gitignore'), 'bin/\n')
    const git = (...input: string[]) => execFileSync('git', input, { cwd: directory, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
    git('init', '-b', 'main')
    git('config', 'user.name', 'Deployment Test')
    git('config', 'user.email', 'deployment@example.test')
    git('add', '--all', '--', '.', ':(exclude)docs/superpowers/**')
    git('commit', '-m', 'deployment fixture')
    const sha = git('rev-parse', 'HEAD')
    const realGit = execFileSync('which', ['git'], { encoding: 'utf8' }).trim()
    mkdirSync(bin)
    writeFileSync(join(bin, 'git'), `#!${process.execPath}
import { spawnSync } from 'node:child_process';
const args = process.argv.slice(2);
if (!['cat-file', 'rev-parse', 'ls-tree', 'show', 'status', 'merge-base'].includes(args[0])) throw Error('Unexpected fixture git command: ' + args.join(' '));
const result = spawnSync(${JSON.stringify(realGit)}, args, { stdio: 'inherit' });
process.exit(result.status ?? 1);
`, { mode: 0o700 })
    writeFileSync(join(bin, 'ssh'), `#!/bin/bash
printf '%s\\0' "$@" > "$OA_DEPLOY_CAPTURE/ssh-args"
exec /bin/bash -c "$2"
`, { mode: 0o700 })
    writeFileSync(join(bin, 'sudo'), `#!/bin/bash
printf '%s\\0' "$@" > "$OA_DEPLOY_CAPTURE/sudo-args"
exit 99
`, { mode: 0o700 })
    writeFileSync(join(bin, 'bash'), `#!/bin/bash
printf '%s\\0' "$@" > "$OA_DEPLOY_CAPTURE/bash-args"
printf '%s' "\${ACCOUNT_REGISTRATION_POLICY:-}" > "$OA_DEPLOY_CAPTURE/registration-policy"
`, { mode: 0o700 })
    const env: NodeJS.ProcessEnv = {
      ...process.env, CI: '', GITHUB_ACTIONS: '', GITHUB_SHA: '', GITHUB_OUTPUT: '',
      RELEASE_REPOSITORY: 'titanxxh/open-agricola', OA_DEPLOY_CAPTURE: bin, OA_DEPLOY_SHA: sha,
      PATH: [bin, join(repository, 'node_modules/.bin'), process.env.PATH].join(delimiter),
    }
    const manifest: unknown = JSON.parse(execFileSync(join(repository, 'node_modules/.bin/tsx'), [
      'scripts/ci/candidate-verification.ts', 'manifest', '--sha', sha,
    ], { cwd: directory, env, encoding: 'utf8' }))
    if (typeof manifest !== 'object' || !manifest || !('configuration' in manifest) || typeof manifest.configuration !== 'string') {
      throw new Error('Missing fixture candidate configuration')
    }
    env.OA_DEPLOY_CONFIGURATION = stableConfiguration(directory, sha, sha)
    writeFileSync(join(bin, 'gh'), `#!${process.execPath}
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const args = process.argv.slice(2);
if (args[0] !== 'api' || args.includes('POST')) throw Error('Unexpected fixture GitHub command: ' + args.join(' '));
const endpoint = args[1].replace('repos/titanxxh/open-agricola/', '');
const sha = process.env.OA_DEPLOY_SHA;
const configuration = process.env.OA_DEPLOY_CONFIGURATION;
const output = value => console.log(JSON.stringify(value));
const step = name => ({ name, status: 'completed', conclusion: 'success' });
const tasks = ['quality', 'fast', 'slow', 'build', 'chromium-1', 'chromium-2', 'chromium-3', 'chromium-4', 'browser-sandbox', 'webkit'];
const provenance = ${JSON.stringify(finalSnapshotMetadata(sha))};
if (Object.hasOwn(provenance, args[1])) {
  const metadata = provenance[args[1]];
  if (Array.isArray(metadata) && args.includes('--paginate')) metadata.forEach(output); else output(metadata);
  if (endpoint === 'git/ref/heads/main' && !existsSync(join(process.env.OA_DEPLOY_CAPTURE, 'candidate-ref'))) writeFileSync(join(process.env.OA_DEPLOY_CAPTURE, 'candidate-ref'), 'main');
} else if (endpoint.startsWith('commits/')) {
  writeFileSync(join(process.env.OA_DEPLOY_CAPTURE, 'candidate-ref'), decodeURIComponent(endpoint.slice(8)));
  output({ sha });
} else if (endpoint === 'actions/workflows/candidate-verification.yml') {
  output({ id: 100, path: '.github/workflows/candidate-verification.yml' });
} else if (endpoint === 'actions/workflows/100/runs?event=workflow_dispatch&per_page=100') {
  output({ id: 1, workflow_id: 100, path: '.github/workflows/candidate-verification.yml', event: 'workflow_dispatch', head_sha: sha, head_branch: 'main', display_title: 'stable / ' + sha + ' / all',
    repository: { id: 1164782262, full_name: 'titanxxh/open-agricola' }, head_repository: { id: 1164782262 }, status: 'completed', run_attempt: 1,
    created_at: '2026-10-30T00:00:00Z', updated_at: '2026-10-30T00:15:00Z', html_url: 'https://example.test/run/1' });
} else if (endpoint === 'actions/runs/1/jobs?filter=all&per_page=100') {
  output({ id: 1, run_id: 1, run_attempt: 1, name: 'candidate-manifest', status: 'completed', conclusion: 'success', html_url: 'https://example.test/job/1',
    started_at: '2026-10-30T00:00:00Z', completed_at: '2026-10-30T00:01:00Z',
    steps: [step('Generate candidate manifest'), step('Stable manifest / 1164782262 / stable / ' + sha + ' / ' + configuration + ' / ' + sha + ' / ' + tasks.join(','))] });
  tasks.forEach((task, index) => output({ id: index + 2, run_id: 1, run_attempt: 1, name: 'candidate / ' + task + ' / ' + configuration,
    started_at: '2026-10-30T00:05:00Z', completed_at: '2026-10-30T00:10:00Z',
    status: 'completed', conclusion: 'success', html_url: 'https://example.test/job/' + task,
    steps: ['Checkout candidate', 'Install dependencies', 'Verify candidate checkout', 'Execute verification task', 'Install browsers', 'Prepare candidate isolation', 'Prove native candidate isolation', 'Stop candidate descendants and collect private diagnostics'].map(step) }));
} else throw Error('Unexpected fixture GitHub endpoint: ' + endpoint);
`, { mode: 0o700 })
    delete env.ACCOUNT_REGISTRATION_POLICY
    if (policy !== undefined) env.ACCOUNT_REGISTRATION_POLICY = policy
    const result = spawnSync('/bin/bash', ['deploy-backend.sh', ...args], { cwd: directory, env, encoding: 'utf8', timeout: 30_000 })
    if (result.error) throw result.error
    if (result.status !== 0) throw new Error(`deployment capture failed: ${result.stderr}`)
    const capturedArgs = (file: string) => existsSync(file)
      ? readFileSync(file, 'utf8').split('\0').slice(0, -1)
      : []
    return {
      sha,
      ref: readFileSync(captures.ref, 'utf8'),
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
    expect(deployment.ref).toBe('main')
    expect(deployment.args).toEqual(['-s', '/home/ubuntu/open-agricola', deployment.sha])
    expect(deployment.policy).toBe('invite_only')
  })

  it('supports an explicit SSH user, version and directory without privilege escalation', () => {
    const deployment = captureBackendDeployment(['operator@example.com', 'v0.7.9', '/srv/game'], 'open')
    expect(deployment.host).toBe('operator@example.com')
    expect(deployment.sudo).toEqual([])
    expect(deployment.ref).toBe('v0.7.9')
    expect(deployment.args).toEqual(['-s', '/srv/game', deployment.sha])
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
    expect(deployment.ref).toBe(ref)
    expect(deployment.args).toEqual(['-s', remoteDir, deployment.sha])
    expect(deployment.policy).toBe(policy)
  })

  it('records the target commit in the image before validating live storage', () => {
    const script = readFileSync('deploy-backend.sh', 'utf8')
    expect(script).toContain('TARGET_REF="$(git rev-parse \'FETCH_HEAD^{commit}\')"')
    expect(script).toContain('[[ "$TARGET_REF" == "$VERIFIED_SHA" ]]')
    expect(script).toContain('export GAME_BUILD_ID="$TARGET_REF"')
    expect(script).toContain('check-live "$TARGET_REF" --applications-stopped')
    const buildAt = script.indexOf('"${COMPOSE[@]}" build app')
    const backupAt = script.indexOf('bash scripts/backup-storage.sh "$STEM" --already-stopped')
    expect(buildAt).toBeGreaterThan(script.indexOf('export GAME_BUILD_ID="$TARGET_REF"'))
    expect(backupAt).toBeGreaterThan(buildAt)
    expect(script.indexOf('check-live "$TARGET_REF"')).toBeGreaterThan(backupAt)
    expect(script).not.toContain('reset --hard')
  })

  it('detaches deployment commands from the SSH script input', () => {
    const script = readFileSync('deploy-backend.sh', 'utf8')
    expect(script).toContain('deploy_backend() {')
    expect(script).toContain('deploy_backend "$@" < /dev/null')
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

  it('shares the native archive helper between scheduled and pre-deploy backups', () => {
    expect(readFileSync('backup-offsite.sh', 'utf8')).toContain('bash "$POLICY_ROOT/scripts/backup-storage.sh" "$BACKUP_STEM"')
    expect(readFileSync('deploy-backend.sh', 'utf8')).toContain('bash scripts/backup-storage.sh "$STEM" --already-stopped')
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
