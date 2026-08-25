import { defineMinorCard } from '../card-source'
import { getPlayerBakeRates } from '../helpers/exchange-registry'
import type { ActionFlow } from '../../contract/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'A061_WinnowingFan'

const cardImpl = {
  effect: {
  id: CARD_ID,
  preHarvestGoodsWanted: ['grain'],
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

export const A061_WinnowingFan = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Winnowing Fan",
    deck: "A",
    number: 61,
    category: "FOOD_PROVIDER",
    desc: ["After the field phase of each harvest, you can use a <BAKE>-improvement but only to turn exactly 1 <GRAIN> into <FOOD>. (This is not considered a __Bake Bread__ action.)"],
    cost: { reed: 1 },
    prerequisite: "Baking Improvement",
  },
  impl: cardImpl,
})

export const A061_WinnowingFan_impl = A061_WinnowingFan.impl
