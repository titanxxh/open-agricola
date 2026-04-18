import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { gainLeaf } from '../helpers/pay-gain-node'
import { fieldHasCrop, fieldIsEmpty } from '../../game/field'

const CARD_ID = 'B61_ThreeFieldRotation'

registerCardEffect({
  id: CARD_ID,
  onStartHarvestFieldPhase: (_state, player) => {
    if (!player.minorPlayed.includes(CARD_ID)) return
    const hasGrain = player.fields.some(f => fieldHasCrop(f, 'grain'))
    const hasVeg = player.fields.some(f => fieldHasCrop(f, 'vegetable'))
    const hasEmpty = player.fields.some(f => fieldIsEmpty(f))
    if (!hasGrain || !hasVeg || !hasEmpty) return
    return gainLeaf(CARD_ID, { food: 3 })
  },
})

export const B61_ThreeFieldRotation = new MinorImprovement({
  id: CARD_ID,
  name: 'Three-Field Rotation',
  deck: 'B',
  number: 61,
  category: 'FOOD_PROVIDER',
  desc: ['At the start of the field phase of each harvest, if you have at least 1 <GRAIN> field, 1 <VEGETABLE> field, and 1 empty field, you get 3 <FOOD>.'],
  cost: {},
  prerequisite: '3 Occupations',
  occupationPrerequisites: { min: 3 },
})
