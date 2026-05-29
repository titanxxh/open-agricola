import { payLeaf, gainLeaf } from '../helpers/pay-gain-node'
import { getEmptyUnfencedStableCountForCards } from '../../domain/stables'
import type { CardImpl } from '../registry'
import { C49_BeerStall } from '../../cards-display/C/C49_BeerStall'

const CARD_ID = C49_BeerStall.id

export const C49_BeerStall_impl = {
  effect: {
  id: CARD_ID,
  onHarvestFeedingPhase: (_state, player) => {
    const emptyStables = getEmptyUnfencedStableCountForCards(player)
    if (emptyStables <= 0 || player.resources.grain < 1) return
    const maxExchanges = Math.min(emptyStables, player.resources.grain)
    if (maxExchanges === 1) {
      return {
        type: 'seq',
        optional: true,
        children: [
          payLeaf({ cardId: CARD_ID, cost: { grain: 1 } }),
          gainLeaf(CARD_ID, { food: 5 }),
        ],
      }
    }
    // Multiple exchanges: offer XOR with 1..maxExchanges options
    const children = Array.from({ length: maxExchanges }, (_, i) => {
      const count = i + 1
      return {
        type: 'seq' as const,
        children: [
          payLeaf({ cardId: CARD_ID, cost: { grain: count } }),
          gainLeaf(CARD_ID, { food: count * 5 }),
        ],
      }
    })
    return {
      type: 'xor',
      optional: true,
      children,
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
