import { defineOccupationCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { registerHarvestFeedingRequirementModifier } from '../../../actions/helpers/harvest-feeding-requirement'

const CARD_ID = 'CFL041_FryCook'

registerHarvestFeedingRequirementModifier(CARD_ID, ({ familySize, newbornCount }) => {
  const adults = familySize - newbornCount
  return Math.max(0, adults - 2) - Math.min(2, adults)
})

const cardImpl = {
  effect: { id: CARD_ID },
} satisfies CardImpl

export const CFL041_FryCook = defineOccupationCard({
  meta: {
    id: 'CFL041_FryCook',
    name: 'Fry Cook',
    deck: 'CFL',
    number: 41,
    players: '1+',
    desc: [
      'During each feeding phase, two of your adults require 1 less <FOOD> each. Each of your other adults requires 1 more <FOOD>.',
    ],
    implemented: true,
    artUrl: 'assets/classic/CFL/CFL041.png',
  },
  impl: cardImpl,
})
