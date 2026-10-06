import { defineMinorCard } from '../card-source'
import { makeCardFieldImpl } from '../helpers/card-field'

const CARD_ID = 'D075_WoodField'

const cardImpl = makeCardFieldImpl(CARD_ID, {
  allowedCrops: ['wood'],
  capacity: 2,
})

export const D075_WoodField = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Wood Field',
    deck: 'D',
    number: 75,
    category: 'BUILDING_RESOURCE_PROVIDER',
    desc: [
        'You can plant <WOOD> on this card as though it were 2 <FIELD>, but it is considered 1 <FIELD>. Sow and harvest <WOOD> on this card as you would <GRAIN>.',
      ],
    vp: 1,
    cost: { food: 1 },
    prerequisite: '1 Occupation',
    occupationPrerequisites: { min: 1 },
    isField: true,
    cardField: { allowedCrops: ['wood'], capacity: 2 },
  },
  presentation: { cardFields: true },
  impl: cardImpl,
})

export const D075_WoodField_impl = D075_WoodField.impl
