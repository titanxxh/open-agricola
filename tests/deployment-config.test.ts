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
