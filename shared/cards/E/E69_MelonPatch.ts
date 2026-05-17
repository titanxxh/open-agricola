import { makeCardFieldImpl } from '../helpers/card-field'
import { E69_MelonPatch } from '../../cards-display/E/E69_MelonPatch'

const CARD_ID = E69_MelonPatch.id

export const E69_MelonPatch_impl = makeCardFieldImpl(
  CARD_ID,
  { allowedCrops: ['vegetable'], capacity: 1 },
  {
    onReap: ({ isLast }) => {
      if (!isLast) return
      return { type: 'leaf', actionId: 'plow', sourceCard: CARD_ID, optional: true }
    },
  },
)
