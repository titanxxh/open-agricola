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
