import { defineMinorCard } from '../card-source'
import { makeCardFieldImpl } from '../helpers/card-field'

const CARD_ID = 'E72_ArtichokeField'

const cardImpl = makeCardFieldImpl(
  CARD_ID,
  { allowedCrops: ['grain', 'vegetable'], capacity: 1 },
  {
    onReap: ({ player, trigger }) => {
      if (trigger.phase !== 'harvest') return
      player.resources.food += 1
    },
  },
)

export const E72_ArtichokeField = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Artichoke Field',
    deck: 'E',
    number: 72,
    category: 'CROPS_-_GRAIN_AND_VEGETABLE',
    desc: [
        'This card is a field. During the field phase of each harvest, if you harvest at least 1\u00a0good from this card, you also get 1 <FOOD>.',
      ],
    cost: { wood: 1 },
    vp: 1,
    prerequisite: '2 Occupations',
    occupationPrerequisites: { min: 2 },
    isField: true,
    cardField: { allowedCrops: ['grain', 'vegetable'], capacity: 1 },
  },
  impl: cardImpl,
})

export const E72_ArtichokeField_impl = E72_ArtichokeField.impl
