import { defineMinorCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { cardResourceWithdrawal } from '../../helpers/card-resource-withdrawal'

const CARD_ID = 'CWM096_OakCask'

const cardImpl = {
  listeners: [cardResourceWithdrawal(CARD_ID, 'food')],
  effect: {
    id: CARD_ID,
    onBuy: () => ({
      type: 'leaf',
      actionId: 'store-on-card',
      sourceCard: CARD_ID,
      params: { food: 1 },
    }),
    onHarvestFieldPhase: (_state, player) =>
      (player.cardStates[CARD_ID]?.counters?.food ?? 0) > 0
        ? { type: 'leaf', actionId: 'store-on-card', sourceCard: CARD_ID, params: { food: 1 } }
        : undefined,
  },
} satisfies CardImpl

export const CWM096_OakCask = defineMinorCard({
  meta: {
    id: 'CWM096_OakCask',
    name: "Oak Cask",
    deck: 'CWM',
    number: 96,
    desc: ["Immediately place 1 food from the supply on this card. During each harvest field phase, if any food remains here, add 1 food. You may take its food at any time."],
    cost: {
      wood: 1,
    },
    vp: 0,
    prerequisite: "",
    passing: false,
    extraVp: false,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM096.png',
  },
  presentation: { counters: ['food'] },
  impl: cardImpl,
})

export const CWM096_OakCask_impl = CWM096_OakCask.impl
