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
  if (file === 'prerelease-runtime.yml') {
    const runtime = workflow.match(/^ {2}runtime:\n(?: {4}[^\n]*\n|\n)*/m)?.[0] ?? ''
    expect(runtime).toMatch(/^ {2}runtime:\n {4}if: github.ref == 'refs\/heads\/main'\n {4}runs-on: ubuntu-latest\n {4}timeout-minutes: 45\n {4}environment: prerelease-image-publish\n {4}steps:\n/)
    const publishStep = [
      '      - name: Publish runtime and produce the pin',
      '        env:',
      '          GH_TOKEN: ${{ github.token }}',
      '          GHCR_PUBLISH_TOKEN: ${{ secrets.GHCR_PUBLISH_TOKEN }}',
      '          GHCR_PUBLISH_USER: ${{ vars.GHCR_PUBLISH_USER }}',
      '          GHCR_PRIVATE_PACKAGE_ID: ${{ vars.GHCR_PRIVATE_PACKAGE_ID }}',
      '        run: node scripts/ci/publish-prerelease-runtime.ts',
      '',
    ].join('\n')
    expect(runtime).toContain(publishStep)
    expect(runtime).toContain('ref: ${{ github.sha }}')
    workflow = workflow.replace(publishStep, '')
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
    expect(readFileSync('scripts/backup-storage.sh', 'utf8')).toContain('export APP_UID="$(id -u)" APP_GID="$(id -g)"')
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

  it('keeps the independent erasure ledger outside ordinary archive synchronization', () => {
    const files = readFileSync('scripts/backup-files.mjs', 'utf8')
    expect(files).not.toContain('replay-removals.latest.json')
    expect(files).toContain('Number(process.env.BACKUP_RETENTION_DAYS ?? 30)')
    expect(readFileSync('scripts/backup-storage.sh', 'utf8')).toContain('ledger-export /backup/replay-removals.latest.json')
  })
})
