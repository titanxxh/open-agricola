import type { CardImpl } from '../registry'
import { E84_DollysMother } from '../../cards-display/E/E84_DollysMother'

const CARD_ID = E84_DollysMother.id

export const E84_DollysMother_impl = {
  effect: {
  id: CARD_ID,
  computeBreedThreshold: (_state, _player, animalType, { sourceCard }) => {
    if (sourceCard !== 'harvest') return
    if (animalType !== 'sheep') return
    return 1
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
