import { defineMinorCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { queueFutureMeeplesFlow } from '../../../actions/effects/internal/future-meeples'

const CARD_ID = 'CWM082_FlowerPots'

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: (state, player) =>
      queueFutureMeeplesFlow(state, {
        cardId: CARD_ID,
        playerId: player.id,
        entries: state.round <= 6 ? [{ round: 8, resources: { vegetable: 1 } }] : [],
      }),
  },
} satisfies CardImpl

export const CWM082_FlowerPots = defineMinorCard({
  meta: {
    id: 'CWM082_FlowerPots',
    name: "Flower Pots",
    deck: 'CWM',
    number: 82,
    desc: ["If played in round 6 or earlier, place 1 vegetable on round 8. At the start of round 8, you get it."],
    cost: {
      clay: 1,
    },
    vp: 1,
    prerequisite: "",
    passing: false,
    extraVp: false,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM082.png',
  },
  impl: cardImpl,
})

export const CWM082_FlowerPots_impl = CWM082_FlowerPots.impl
