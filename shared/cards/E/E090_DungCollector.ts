import { defineOccupationCard } from '../card-source'
import { getPlowableTiles } from '../../actions/effects/plow'
import type { CardImpl } from '../registry'

const CARD_ID = 'E090_DungCollector'

const cardImpl = {
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

export const E090_DungCollector = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: "Dung Collector",
    deck: "E",
    number: 90,
    desc: ["Each time you get 2 or more newborn animals, you can pay 1 <FOOD> to plow 1 field."],
    cost: {},
    players: "1+",
    category: 'FARMYARD_-_PLOWING',
  },
  impl: cardImpl,
})

export const E090_DungCollector_impl = E090_DungCollector.impl
