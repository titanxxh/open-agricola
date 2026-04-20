import { MinorImprovement } from '../types'
import { payLeaf, gainLeaf } from '../helpers/pay-gain-node'
import { getLooseStableKeys } from '../../actions/effects/animals'
import type { CardImpl } from '../registry'

const CARD_ID = 'C49_BeerStall'

export const C49_BeerStall = new MinorImprovement({
  id: CARD_ID,
  name: "Beer Stall",
  deck: "C",
  number: 49,
  category: "FOOD_PROVIDER",
  desc: ['In the feeding phase of each harvest, for each empty unfenced stable you have, you can exchange 1 <GRAIN> for 5 <FOOD>.'],
  cost: { wood: 1 },
})

export const C49_BeerStall_impl = {
  effect: {
  id: CARD_ID,
  onHarvestFeedingPhase: (_state, player) => {
    const looseKeys = getLooseStableKeys(player)
    const emptyStables = looseKeys.filter(k => !player.stableAnimals?.[k]).length
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
        choiceLabelKey: 'ui.interactionResourceExchange',
        choiceLabelParams: { resourcesPaid: { grain: count }, resourcesGained: { food: count * 5 } },
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
