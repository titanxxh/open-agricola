import { describe, expect, it } from 'vitest'
import { checkGeneratedCardsSync } from '../../../../scripts/check-generated-cards-sync'

// Compare in memory: rewriting the generated files here would race with tests
// that import the catalog in parallel.
describe('register-all.ts is in sync with generator', () => {
  it('generate:register-all would produce no diff', () => {
    const { staleFiles } = checkGeneratedCardsSync()
    expect(staleFiles, 'Run: pnpm run generate:register-all').toEqual([])
  }, 30_000)
})
