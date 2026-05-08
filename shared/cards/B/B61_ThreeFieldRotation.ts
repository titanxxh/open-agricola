import { gainLeaf } from '../helpers/pay-gain-node'
import { fieldHasCrop, fieldIsEmpty } from '../../domain/field'
import type { CardImpl } from '../registry'
import { B61_ThreeFieldRotation } from '../../cards-display/B/B61_ThreeFieldRotation'
export { B61_ThreeFieldRotation }

const CARD_ID = B61_ThreeFieldRotation.id

export const B61_ThreeFieldRotation_impl = {
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
