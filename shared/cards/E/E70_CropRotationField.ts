import { defineMinorCard } from '../card-source'
import { makeCardFieldImpl } from '../helpers/card-field'
import { writeCardExtraData } from '../helpers/card-state'

const CARD_ID = 'E70_CropRotationField'
const VIRTUAL_KEY = '-1-5070'

const cardImpl = makeCardFieldImpl(
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

export const E70_CropRotationField = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Crop Rotation Field',
    deck: 'E',
    number: 70,
    category: 'CROPS_-_VEGETABLE',
    desc: [
        'This card is a field. Each time you remove the last <GRAIN> or <VEGETABLE> from this card, you can immediately sow <VEGETABLE> or <GRAIN> on this card, respectively.',
      ],
    cost: {},
    prerequisite: '1 Occupation',
    occupationPrerequisites: { min: 1 },
    isField: true,
    cardField: { allowedCrops: ['grain', 'vegetable'], capacity: 1 },
  },
  impl: cardImpl,
})

export const E70_CropRotationField_impl = E70_CropRotationField.impl
