import { makeCardFieldImpl } from '../helpers/card-field'
import { writeCardExtraData } from '../helpers/card-state'
import { E70_CropRotationField } from '../../cards-display/E/E70_CropRotationField'

const CARD_ID = E70_CropRotationField.id
const VIRTUAL_KEY = '-1-5070'

export const E70_CropRotationField_impl = makeCardFieldImpl(
  CARD_ID,
  { allowedCrops: ['grain', 'vegetable'], capacity: 1 },
  {
    onReap: ({ player, crop, isLast }) => {
      if (!isLast) return
      const oppositeCrop = crop === 'grain' ? 'vegetable' : 'grain'
      if ((player.resources[oppositeCrop] ?? 0) < 1) return
      writeCardExtraData(player, CARD_ID, 'selectedPositions', [VIRTUAL_KEY])
      return {
        type: 'leaf',
        actionId: 'sow',
        sourceCard: CARD_ID,
        optional: true,
        actionContext: { allowedFields: 'fromSelectedFields', sourceCard: CARD_ID },
      }
    },
  },
)
