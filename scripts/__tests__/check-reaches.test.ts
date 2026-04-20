import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { checkReaches } from '../check-reaches'

const fixtures = path.resolve(__dirname, 'fixtures/reaches-samples')

describe('check-reaches', () => {
  it('returns no violations for cards without _impl', () => {
    const result = checkReaches([path.join(fixtures, 'A_no_impl.ts')])
    expect(result.violations).toEqual([])
    expect(result.cardsChecked).toBe(0)
  })

  it('returns no violations for clean _impl card', () => {
    const result = checkReaches([path.join(fixtures, 'B_impl_clean.ts')])
    expect(result.violations).toEqual([])
    expect(result.cardsChecked).toBe(1)
  })

  it('detects missing reach declaration', () => {
    const result = checkReaches([path.join(fixtures, 'C_impl_missing.ts')])
    expect(result.violations.length).toBeGreaterThan(0)
    expect(result.violations[0]).toMatchObject({
      cardId: 'C1_Missing',
      missingReach: 'D99_SomeOtherCard',
    })
  })
})
