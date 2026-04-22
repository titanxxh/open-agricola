import { describe, it } from 'vitest'
import { execSync } from 'node:child_process'

describe('register-all.ts is in sync with generator', () => {
  it('running generate:register-all produces no diff', () => {
    execSync('pnpm run generate:register-all', { stdio: 'pipe' })
    try {
      execSync(
        'git diff --exit-code -- shared/cards/register-all.ts shared/cards/community/auto-catalog.ts',
        { stdio: 'pipe' },
      )
    } catch {
      throw new Error(
        'register-all.ts or auto-catalog.ts is out of sync with generator. Run: pnpm run generate:register-all',
      )
    }
  }, 30_000)
})
