import { defineMinorCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { queueFutureMeeplesFlow } from '../../../actions/effects/internal/future-meeples'

const CARD_ID = 'CWM073_DiamondMine'

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: (state, player) =>
      queueFutureMeeplesFlow(state, {
        cardId: CARD_ID,
        playerId: player.id,
        entries: [state.round + 1, state.round + 2]
          .filter((round) => round <= 14)
          .map((round) => ({ round, resources: { stone: 1 } })),
      }),
  },
} satisfies CardImpl

export const CWM073_DiamondMine = defineMinorCard({
  meta: {
    id: 'CWM073_DiamondMine',
    name: "Diamond Mine",
    deck: 'CWM',
    number: 73,
    desc: ["Place 1 <STONE> on each of the next 2 round spaces. At the start of those rounds, you get the <STONE>."],
    cost: {},
    vp: 1,
    prerequisite: "3 occupations",
    occupationPrerequisites: {
      min: 3,
    },
    passing: false,
    extraVp: false,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM073.png',
  },
  impl: cardImpl,
})

export const CWM073_DiamondMine_impl = CWM073_DiamondMine.impl
