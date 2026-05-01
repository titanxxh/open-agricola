import { describe, expect, it } from 'vitest'
import { D155_Ebonist } from '../../shared/cards/D/D155_Ebonist'

const CARD_ID = 'D155_Ebonist'

describe('D155_Ebonist exchange metadata', () => {
  it('exposes a 1 wood → 1 food + 1 grain anytime exchange, max 1', () => {
    expect(D155_Ebonist.id).toBe(CARD_ID)
    expect(D155_Ebonist.exchanges).toBeDefined()
    expect(D155_Ebonist.exchanges).toHaveLength(1)

    const xch = D155_Ebonist.exchanges![0]!
    expect(xch.from?.wood).toBe(1)
    expect(xch.to?.food).toBe(1)
    expect(xch.to?.grain).toBe(1)
    expect(xch.max).toBe(1)
    expect(xch.triggers).toEqual(['anytime'])
  })
})
