import { defineMinorCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { queueFutureMeeplesFlow } from '../../../actions/effects/internal/future-meeples'

const CARD_ID = 'CWM111_UndisturbedPond'

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: (state, player) =>
      queueFutureMeeplesFlow(state, {
        cardId: CARD_ID,
        playerId: player.id,
        entries: Array.from({ length: state.round - 1 }, (_, i) => state.round + i + 1)
          .filter((round) => round <= 14)
          .map((round) => ({ round, resources: { food: 1 } })),
      }),
  },
} satisfies CardImpl

export const CWM111_UndisturbedPond = defineMinorCard({
  meta: {
    id: 'CWM111_UndisturbedPond',
    name: "Undisturbed Pond",
    deck: 'CWM',
    number: 111,
    desc: ["Count the full rounds already completed. Place 1 <FOOD> on each of that many subsequent round spaces. At the start of those rounds, you get the <FOOD>."],
    cost: {},
    vp: 1,
    prerequisite: "No occupations",
    occupationPrerequisites: {
      max: 0,
    },
    passing: false,
    extraVp: false,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM111.png',
  },
  impl: cardImpl,
})

export const CWM111_UndisturbedPond_impl = CWM111_UndisturbedPond.impl
