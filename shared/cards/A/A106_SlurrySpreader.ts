import { defineOccupationCard } from '../card-source'
import { gainLeaf } from '../helpers/pay-gain-node'
import { fieldHasCrop } from '../../domain/field'
import type { CardImpl } from '../registry'

const CARD_ID = 'A106_SlurrySpreader'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onAfterReap: (state, player) => {

    const summary = state.harvestReapSummary?.[player.id]
    if (!summary) return

    const remainingGrainFields = player.fields.filter((field) => fieldHasCrop(field, 'grain')).length
    const remainingVegetableFields = player.fields.filter((field) => fieldHasCrop(field, 'vegetable')).length

    const depletedGrainFields = Math.max(0, (summary.grainFields ?? 0) - remainingGrainFields)
    const depletedVegetableFields = Math.max(0, (summary.vegetableFields ?? 0) - remainingVegetableFields)
    const food = depletedGrainFields * 2 + depletedVegetableFields

    if (food <= 0) return
    return gainLeaf(CARD_ID, { food })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A106_SlurrySpreader = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Slurry Spreader',
    deck: 'A',
    number: 106,
    category: 'FOOD_PROVIDER',
    desc: ['In the field phase of each harvest, each time you take the last <GRAIN>/<VEGETABLE> from a <FIELD>, you also get 2 <FOOD>/1 <FOOD>.'],
    cost: {},
    players: '1+',
  },
  impl: cardImpl,
})

export const A106_SlurrySpreader_impl = A106_SlurrySpreader.impl
