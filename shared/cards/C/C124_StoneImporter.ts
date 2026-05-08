import type { CardImpl } from '../registry'
import { C124_StoneImporter } from '../../cards-display/C/C124_StoneImporter'
export { C124_StoneImporter }

const CARD_ID = C124_StoneImporter.id

const harvestFoodCosts: Record<number, number> = {
  4: 2,
  7: 2,
  9: 3,
  11: 3,
  13: 4,
  14: 1,
}

export const C124_StoneImporter_impl = {
  effect: {
  id: CARD_ID,
  onEndHarvest: (state, player) => {
    const foodCost = harvestFoodCosts[state.round]
    if (foodCost === undefined) return
    if (player.resources.food < foodCost) return

    return {
      type: 'seq',
      optional: true,
      children: [
        { type: 'leaf', actionId: 'pay', params: { food: foodCost }, sourceCard: CARD_ID },
        { type: 'leaf', actionId: 'gain', params: { stone: 2 }, sourceCard: CARD_ID },
      ],
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
