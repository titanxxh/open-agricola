import { defineMinorCard } from '../card-source'
import { makeCardFieldImpl } from '../helpers/card-field'

const CARD_ID = 'E080_RockGarden'

const cardImpl = makeCardFieldImpl(CARD_ID, {
  allowedCrops: ['stone'],
  capacity: 3,
})

export const E080_RockGarden = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Rock Garden',
    deck: 'E',
    number: 80,
    category: 'BUILDING_RESOURCES_-_STONE',
    desc: [
        'You can only plant <STONE> on this card. Plant as though it were 3 fields, but it is considered 1 field. Sow and harvest <STONE> on this card as you would vegetables.',
      ],
    isField: true,
    cardField: { allowedCrops: ['stone'], capacity: 3 },
  },
  impl: cardImpl,
})

export const E080_RockGarden_impl = E080_RockGarden.impl
