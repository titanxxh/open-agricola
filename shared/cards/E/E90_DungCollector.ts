import { getPlowableTiles } from '../../actions/effects/plow'
import type { CardImpl } from '../registry'
import { E90_DungCollector } from '../../cards-display/E/E90_DungCollector'

const CARD_ID = E90_DungCollector.id

export const E90_DungCollector_impl = {
  effect: {
  id: CARD_ID,
  onEndHarvest: (state, player) => {

    const bredAnimalCount = state.harvestBreedSummary?.[player.id]?.animalCount ?? 0
    if (bredAnimalCount < 2) return
    if (getPlowableTiles(player).length === 0) return
    if (player.resources.food < 1) return

    return {
      type: 'seq',
      optional: true,
      children: [
        { type: 'leaf', actionId: 'pay', params: { food: 1 }, sourceCard: CARD_ID },
        { type: 'leaf', actionId: 'plow', sourceCard: CARD_ID },
      ],
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
