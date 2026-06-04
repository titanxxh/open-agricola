import { defineOccupationCard } from '../card-source'
import { familySize } from '../../domain/player'
import { registerHarvestFeedingRequirementModifier } from '../../actions/helpers/harvest-feeding-requirement'
import type { CardImpl } from '../registry'

const CARD_ID = 'E159_OldMiser'
registerHarvestFeedingRequirementModifier(CARD_ID, ({ familySize }) => -familySize)

const cardImpl = {
  effect: {
    id: CARD_ID,
    computeBonusScore: (_state, player) => {
      return -familySize(player)
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E159_OldMiser = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Old Miser',
    deck: 'E',
    number: 159,
    category: 'FOOD',
    desc: ['In the feeding phase of each harvest, each of your people requires 1\u00a0less <FOOD>. During scoring, your people are worth 2 points each instead of 3.'],
    players: '4+',
  },
  impl: cardImpl,
})

export const E159_OldMiser_impl = E159_OldMiser.impl
