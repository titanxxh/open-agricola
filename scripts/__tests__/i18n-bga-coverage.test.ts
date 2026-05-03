import { describe, it, expect } from 'vitest'
import { computeCoverageReport } from '../i18n-bga-coverage'

describe('computeCoverageReport', () => {
  it('finds strings BGA has but ours doesn\'t', () => {
    const bgaUnique = new Map([
      ['Hello {player}', { count: 5, locations: ['a.php:1'] }],
      ['Goodbye', { count: 2, locations: ['b.php:1'] }],
      ['Already covered', { count: 1, locations: ['c.php:1'] }],
    ])
    const ourEnValues = new Set(['Already covered', 'unrelated'])
    const r = computeCoverageReport(bgaUnique, ourEnValues)
    expect(r.bgaTotal).toBe(3)
    expect(r.ourCovered).toBe(1)
    expect(r.gap).toHaveLength(2)
    // Sorted by frequency desc
    expect(r.gap[0].raw).toBe('Hello {player}')
    expect(r.gap[1].raw).toBe('Goodbye')
  })
})
