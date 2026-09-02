import { defineOccupationCard } from '../card-source'
import { gainLeaf, payLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { getLogicalFields } from '../helpers/card-field'
import type { ActionFlow } from '../../contract/types'

const CARD_ID = 'D113_FoodMerchant'
type SequenceFlow = { type: 'seq'; optional?: boolean; children: ActionFlow[] }

const purchaseFlow = (food: number, vegetable: number): SequenceFlow => ({
  type: 'seq',
  children: [
    payLeaf({ cardId: CARD_ID, cost: { food } }),
    gainLeaf(CARD_ID, { vegetable }),
  ],
})

const cardImpl = {
  effect: {
  id: CARD_ID,
  onAfterReap: (_state, player) => {
    const grainHarvested = _state.harvestReapSummary?.[player.id]?.harvestedCrops
      ?.filter((entry) => entry.crop === 'grain') ?? []
    const fields = getLogicalFields(player)
    const costs = grainHarvested.flatMap((harvested) => {
      const depleted = !fields.some((field) => field.slots.some((slot) =>
        slot.tile.row === harvested.row && slot.tile.col === harvested.col && slot.stack?.kind === 'grain',
      ))
      return Array.from({ length: harvested.amount }, (_, index) =>
        depleted && index === harvested.amount - 1 ? 2 : 3)
    }).sort((a, b) => a - b)
    let totalFood = 0
    const choices = costs.flatMap((cost, index) => {
      totalFood += cost
      return totalFood <= player.resources.food ? [purchaseFlow(totalFood, index + 1)] : []
    })
    if (choices.length === 0) return
    if (choices.length === 1) return { ...choices[0], optional: true }
    return {
      type: 'xor',
      optional: true,
      children: choices,
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D113_FoodMerchant = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Food Merchant',
    deck: 'D',
    number: 113,
    category: 'CROP_PROVIDER',
    desc: [
        'For each <GRAIN> you harvest from a <FIELD>, you can buy 1 <VEGETABLE> for 3 <FOOD>. If you harvest the last <GRAIN> from a <FIELD>, the <VEGETABLE> costs you only 2 <FOOD>.',
      ],
    cost: {},
    players: '1+',
  },
  impl: cardImpl,
})

export const D113_FoodMerchant_impl = D113_FoodMerchant.impl
