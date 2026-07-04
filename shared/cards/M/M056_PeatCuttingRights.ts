import { defineMinorCard } from '../card-source'
import type { CardImpl } from '../registry'
import {
  scheduledOffersRoundStartFlow,
  writeScheduledOffers,
  type ScheduledOffer,
} from '../../actions/effects/internal/scheduled-offers'

const CARD_ID = 'M056_PeatCuttingRights'

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: (state, player) => {
      const offers: ScheduledOffer[] = [4, 7]
        .map((offset): ScheduledOffer => ({
          id: `${CARD_ID}-${state.round + offset}`,
          kind: 'moor-special-action',
          dueRound: state.round + offset,
          actionId: 'cut-peat',
          cost: {},
          consumed: false,
        }))
        .filter((offer) => offer.dueRound <= 14)
      if (offers.length === 0) return
      writeScheduledOffers(player, CARD_ID, offers)
    },
    onRoundStart: (state, player) => scheduledOffersRoundStartFlow(state, player, CARD_ID),
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const M056_PeatCuttingRights = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Peat-Cutting Rights",
    deck: "M",
    number: 56,
    category: "ACTIONS_BOOSTER",
    desc: [
        "Add 4 and 7 to the current round and place 1 <FUEL> on each corresponding round space. At the start of these rounds, you can discard the <FUEL> and take the __Cut Peat__ special action by taking the appropriate special action card."
    ],
    cost: {},
    prerequisite: "1 Horse",
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M056_PeatCuttingRights_impl = M056_PeatCuttingRights.impl
