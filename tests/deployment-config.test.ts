import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('production deployment config', () => {
  it('requires an explicit registration policy so fresh deployments do not silently lock themselves', () => {
    const compose = readFileSync('docker-compose.prod.yml', 'utf8')
    expect(compose).toContain('ACCOUNT_REGISTRATION_POLICY=${ACCOUNT_REGISTRATION_POLICY:?')
    expect(compose).not.toContain('ACCOUNT_REGISTRATION_POLICY=${ACCOUNT_REGISTRATION_POLICY:-invite_only}')
  })

  it('passes the explicit registration policy through backend deployment', () => {
    const workflow = readFileSync('.github/workflows/deploy-backend.yml', 'utf8')
    const script = readFileSync('deploy-backend.sh', 'utf8')
    expect(workflow).toContain('ACCOUNT_REGISTRATION_POLICY: ${{ vars.ACCOUNT_REGISTRATION_POLICY }}')
    expect(script).toContain('ACCOUNT_REGISTRATION_POLICY="$ACCOUNT_REGISTRATION_POLICY"')
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

  it('fails the workflow when the deployed build does not match its checkout', () => {
    const workflow = readFileSync('.github/workflows/deploy-backend.yml', 'utf8')
    expect(workflow).toContain('- name: Verify deployed build')
    expect(workflow).toContain('ssh -n "$DEPLOY_USER@$DEPLOY_HOST"')
    expect(workflow).toContain('if [ "$DEPLOYED_BUILD_ID" != "$GITHUB_SHA" ]; then')
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
})
