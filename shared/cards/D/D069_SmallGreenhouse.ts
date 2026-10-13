import { defineMinorCard } from '../card-source'
import { scheduleOffersNode } from '../../actions/effects/internal/schedule-offers'
import { getDueScheduledOffers, scheduledOffersRoundStartFlow, type ScheduledOffer } from '../../actions/effects/internal/scheduled-offers'
import type { CardImpl } from '../registry'

const CARD_ID = 'D069_SmallGreenhouse'

const cardImpl = {
  effect: {
  id: CARD_ID,
  stageEligibility: { onRoundStart: (state, player) => getDueScheduledOffers(state, player, CARD_ID).length > 0 },
  onBuy: (state) => {
    const offsets = [4, 7]
    const targetRounds = offsets
      .map((offset) => state.round + offset)
      .filter((r) => r <= 14)
    if (targetRounds.length === 0) return
    const offers: ScheduledOffer[] = targetRounds.map((round) => ({
      id: `${CARD_ID}-${round}`, kind: 'resource-purchase', dueRound: round,
      resources: { vegetable: 1 }, cost: { food: 1 }, consumed: false,
    }))
    return scheduleOffersNode(CARD_ID, offers)
  },
  onRoundStart: (state, player) => scheduledOffersRoundStartFlow(state, player, CARD_ID),
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D069_SmallGreenhouse = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Small Greenhouse',
    deck: 'D',
    number: 69,
    category: 'CROP_PROVIDER',
    desc: ['Add 4 and 7 to the current round and place 1 <VEGETABLE> on each corresponding round space. At the start of these rounds, you can buy the <VEGETABLE> for 1 <FOOD>.'],
    cost: { wood: 2 },
    vp: 1,
    prerequisite: '1 Occupation',
    occupationPrerequisites: { min: 1 },
  },
  impl: cardImpl,
})

export const D069_SmallGreenhouse_impl = D069_SmallGreenhouse.impl
