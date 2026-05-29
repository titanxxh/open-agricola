import { makeCardFieldImpl } from '../helpers/card-field'
import { E72_ArtichokeField } from '../../cards-display/E/E72_ArtichokeField'

const CARD_ID = E72_ArtichokeField.id

export const E72_ArtichokeField_impl = makeCardFieldImpl(
  CARD_ID,
  { allowedCrops: ['grain', 'vegetable'], capacity: 1 },
  {
    onReap: ({ player, trigger }) => {
      if (trigger.phase !== 'harvest') return
      player.resources.food += 1
    },
  },
)
