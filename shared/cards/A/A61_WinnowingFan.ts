import { getPlayerBakeRates } from '../helpers/exchange-registry'
import type { ActionFlow } from '../../contract/types'
import type { CardImpl } from '../registry'
import { A61_WinnowingFan } from '../../cards-display/A/A61_WinnowingFan'

const CARD_ID = A61_WinnowingFan.id

export const A61_WinnowingFan_impl = {
  effect: {
  id: CARD_ID,
  onEndHarvestFieldPhase: (_state, player) => {
    if (player.resources.grain < 1) return

    const bakeRates = getPlayerBakeRates(player)
    if (bakeRates.length === 0) return

    // Build one option per unique food gain for exactly 1 grain → food
    // (each baking improvement that converts grain to food)
    const children: ActionFlow[] = []
    const seenFood = new Set<number>()
    for (const rate of bakeRates) {
      const food = Math.floor(rate.rate) // rate.rate is food per grain
      if (food > 0 && !seenFood.has(food)) {
        seenFood.add(food)
        children.push({
          type: 'seq',
          children: [
            { type: 'leaf', actionId: 'pay', params: { grain: 1 }, sourceCard: CARD_ID },
            { type: 'leaf', actionId: 'gain', params: { food }, sourceCard: CARD_ID },
          ],
        })
      }
    }

    if (children.length === 0) return

    return {
      type: 'xor',
      optional: true,
      children,
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
