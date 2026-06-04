import { defineOccupationCard } from '../card-source'
import type { CardImpl } from '../registry'

const CARD_ID = 'C124_StoneImporter'
const harvestFoodCosts: Record<number, number> = {
  4: 2,
  7: 2,
  9: 3,
  11: 3,
  13: 4,
  14: 1,
}

const cardImpl = {
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

export const C124_StoneImporter = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: "Stone Importer",
    deck: "C",
    number: 124,
    category: "BUILDING_RESOURCE_PROVIDER",
    desc: ["In the breeding phase of the 1st/2nd/3rd/4th/5th/6th harvest, you can use this card to buy exactly 2 <STONE> for 2/2/3/3/4/1 <FOOD>."],
    cost: {},
    players: "1+",
  },
  impl: cardImpl,
})

export const C124_StoneImporter_impl = C124_StoneImporter.impl
