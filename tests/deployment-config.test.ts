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
  })

  it('limits private BGA image checkouts to Replay Viewer CI', () => {
    for (const workflowPath of [
      '.github/workflows/ci.yml',
      '.github/workflows/ci-full.yml',
    ]) {
      const workflow = readFileSync(workflowPath, 'utf8')
      expect(workflow).toMatch(
        /repository: bga-devs\/bga-agricola\n\s+token: \$\{\{ secrets\.GH_TOKEN \}\}\n\s+persist-credentials: false/,
      )
    }
    const pages = readFileSync('.github/workflows/deploy-pages.yml', 'utf8')
    expect(pages).not.toContain('bga-devs/bga-agricola')
    expect(pages).not.toContain('BGA_IMAGE_DIR')
    expect(pages).not.toContain('PUBLIC_ASSET_LOCAL_DIR')

    const ci = readFileSync('.github/workflows/ci.yml', 'utf8')
    expect(ci).toContain(
      "if: github.event_name != 'pull_request' || github.event.pull_request.head.repo.full_name == github.repository",
    )
    expect(ci).toContain(
      "REPLAY_VIEWER_ALLOW_MISSING_BGA_ART: ${{ github.event_name == 'pull_request' && github.event.pull_request.head.repo.full_name != github.repository && '1' || '0' }}",
    )
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
    expect(script).toContain('up -d --build --remove-orphans')
  })
})
