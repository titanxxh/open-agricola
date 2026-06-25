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
})
