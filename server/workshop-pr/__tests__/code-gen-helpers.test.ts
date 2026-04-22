import { describe, it, expect } from 'vitest'
import { scanUsedHelpers } from '../code-gen'

describe('scanUsedHelpers', () => {
  it('returns only referenced helpers', () => {
    const code = `const CARD_IMPL = { effect: { onHarvest: () => gainLeaf('x', { food: 2 }) } }`
    const used = scanUsedHelpers(code)
    expect(used.has('gainLeaf')).toBe(true)
    expect(used.has('payLeaf')).toBe(false)
  })

  it('returns empty set when no helpers used', () => {
    expect(scanUsedHelpers(`const CARD_IMPL = { effect: {} }`).size).toBe(0)
  })

  it('detects multiple helpers across listeners', () => {
    const code = `
      const CARD_IMPL = {
        listeners: [{
          handler: (c) => {
            if (spaceHasPlayer(c.space, c.player.id)) {
              return payLeaf({ cardId: 'x', cost: { food: 1 } })
            }
          },
        }],
      }
    `
    const r = scanUsedHelpers(code)
    expect(r.has('spaceHasPlayer')).toBe(true)
    expect(r.has('payLeaf')).toBe(true)
  })
})
