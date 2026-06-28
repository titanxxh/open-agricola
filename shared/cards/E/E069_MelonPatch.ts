import { defineMinorCard } from '../card-source'
import { makeCardFieldImpl } from '../helpers/card-field'

const CARD_ID = 'E069_MelonPatch'

const cardImpl = makeCardFieldImpl(
  CARD_ID,
  { allowedCrops: ['vegetable'], capacity: 1 },
  {
    onReap: ({ isLast }) => {
      if (!isLast) return
      return { type: 'leaf', actionId: 'plow', sourceCard: CARD_ID, optional: true }
    },
  },
)

export const E069_MelonPatch = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Melon Patch',
    deck: 'E',
    number: 69,
    category: 'CROPS_-_VEGETABLE',
    desc: [
        'This card is a field that can only grow vegetables. Each time you harvest the last <VEGETABLE> from this card, you can plow 1 field.',
      ],
    prerequisite: '2 Occupations',
    occupationPrerequisites: { min: 2 },
    isField: true,
    cardField: { allowedCrops: ['vegetable'], capacity: 1 },
  },
  impl: cardImpl,
})

export const E069_MelonPatch_impl = E069_MelonPatch.impl
