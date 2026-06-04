import { defineMinorCard } from '../card-source'
import { gainLeaf } from '../helpers/pay-gain-node'
import { fieldHasCrop, fieldIsEmpty } from '../../domain/field'
import type { CardImpl } from '../registry'

const CARD_ID = 'B61_ThreeFieldRotation'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onStartHarvestFieldPhase: (_state, player) => {
    const hasGrain = player.fields.some(f => fieldHasCrop(f, 'grain'))
    const hasVeg = player.fields.some(f => fieldHasCrop(f, 'vegetable'))
    const hasEmpty = player.fields.some(f => fieldIsEmpty(f))
    if (!hasGrain || !hasVeg || !hasEmpty) return
    return gainLeaf(CARD_ID, { food: 3 })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B61_ThreeFieldRotation = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Three-Field Rotation',
    deck: 'B',
    number: 61,
    category: 'FOOD_PROVIDER',
    desc: ['At the start of the field phase of each harvest, if you have at least 1 <GRAIN> field, 1 <VEGETABLE> field, and 1 empty field, you get 3 <FOOD>.'],
    cost: {},
    prerequisite: '3 Occupations',
    occupationPrerequisites: { min: 3 },
  },
  impl: cardImpl,
})

export const B61_ThreeFieldRotation_impl = B61_ThreeFieldRotation.impl
