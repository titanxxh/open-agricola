import { defineOccupationCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { futureMeeplesNode } from '../../../actions/effects/internal/future-meeples'
import { getAvailableStableSupplyCount } from '../../../domain/supply-tokens'

const CARD_ID = 'CWM045_StableDeliveryman'

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: (state, player) => ({
      ...futureMeeplesNode({
        cardId: CARD_ID,
        playerId: player.id,
        entries: [3, 5, 7, 9]
          .map((offset) => state.round + offset)
          .filter((round) => round <= 14)
          .slice(0, getAvailableStableSupplyCount(state, player))
          .map((round) => ({
            round,
            resources: { stable: 1 },
            actionContext: { exactCost: { wood: 1, max: 1 } },
          })),
      }),
      sourceCard: CARD_ID,
    }),
  },
} satisfies CardImpl

export const CWM045_StableDeliveryman = defineOccupationCard({
  meta: {
    id: 'CWM045_StableDeliveryman',
    name: "Stable Deliveryman",
    deck: 'CWM',
    number: 45,
    desc: ["Add 3, 5, 7, and 9 to the current round. Place up to one stable from your supply on each corresponding round space. At the start of those rounds, you may pay 1 wood to build that stable, otherwise return it to your supply."],
    cost: {},
    vp: 0,
    prerequisite: "",
    players: '3+',
    passing: false,
    extraVp: false,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM045.png',
  },
  impl: cardImpl,
})

export const CWM045_StableDeliveryman_impl = CWM045_StableDeliveryman.impl
