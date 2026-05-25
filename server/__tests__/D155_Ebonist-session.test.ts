import { describe, expect, it } from 'vitest'
import { D155_Ebonist as DisplayD155 } from '../../shared/cards-display/D/D155_Ebonist'
import { D155_Ebonist as RuntimeD155 } from '../../shared/cards/D/D155_Ebonist'
import { getExchangesInWindow } from '../../shared/actions/effects/exchange'
import type { PlayerState } from '../../shared/contract/types'

const CARD_ID = 'D155_Ebonist'

describe('D155_Ebonist exchange metadata', () => {
  it.each([DisplayD155, RuntimeD155])('exposes a harvest exchange on both definitions', (definition) => {
    expect(definition.id).toBe(CARD_ID)
    expect(definition.exchanges).toHaveLength(1)

    const xch = definition.exchanges![0]!
    expect(xch).toMatchObject({
      from: { wood: 1 },
      to: { food: 1, grain: 1 },
      max: 1,
      sourceId: CARD_ID,
      triggers: ['harvest'],
    })
  })

  it('is visible in the harvest window but not the anytime window', () => {
    const player = {
      occupationPlayed: [CARD_ID],
      minorPlayed: [],
      improvements: [],
    } as unknown as PlayerState

    expect(getExchangesInWindow(player, 'anytime').some((trade) => trade.sourceId === CARD_ID)).toBe(false)
    expect(getExchangesInWindow(player, 'harvest').some((trade) => trade.sourceId === CARD_ID)).toBe(true)
  })
})
