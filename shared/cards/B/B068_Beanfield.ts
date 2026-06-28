import { defineMinorCard } from '../card-source'
import { makeCardFieldImpl } from '../helpers/card-field'

const CARD_ID = 'B068_Beanfield'

const cardImpl = makeCardFieldImpl(CARD_ID, {
  allowedCrops: ['vegetable'],
  capacity: 1,
})

export const B068_Beanfield = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Beanfield',
    deck: 'B',
    number: 68,
    category: 'CROP_PROVIDER',
    desc: ['This card is a field that can only grow vegetables.'],
    cost: { food: 1 },
    vp: 1,
    prerequisite: '2 Occupations',
    occupationPrerequisites: { min: 2 },
    isField: true,
    cardField: { allowedCrops: ['vegetable'], capacity: 1 },
  },
  impl: cardImpl,
})

export const B068_Beanfield_impl = B068_Beanfield.impl
