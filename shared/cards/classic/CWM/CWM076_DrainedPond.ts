import { defineMinorCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { readCardExtraData, writeCardExtraData } from '../../helpers/card-state'
import { payGainFlow } from '../../helpers/pay-gain-node'

const CARD_ID = 'CWM076_DrainedPond'

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: (state, player) => {
      writeCardExtraData(player, CARD_ID, 'dueRound', state.round + 4)
    },
    stageEligibility: {
      onRoundStart: (state, player) =>
        readCardExtraData(player, CARD_ID, 'dueRound') === state.round,
    },
    onRoundStart: (state, player) =>
      readCardExtraData(player, CARD_ID, 'dueRound') === state.round
        ? payGainFlow({
            cardId: CARD_ID,
            cost: { food: 1 },
            followUp: [{ type: 'leaf', actionId: 'plow', sourceCard: CARD_ID }],
          })
        : undefined,
  },
} satisfies CardImpl

export const CWM076_DrainedPond = defineMinorCard({
  meta: {
    id: 'CWM076_DrainedPond',
    name: "Drained Pond",
    deck: 'CWM',
    number: 76,
    desc: ["Place a field tile on the round space 4 rounds after the current round. At the start of that round, you may pay 1 food to plow that field."],
    cost: {
      reed: 1,
    },
    vp: 1,
    prerequisite: "2 occupations",
    occupationPrerequisites: {
      min: 2,
    },
    passing: false,
    extraVp: false,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM076.png',
  },
  impl: cardImpl,
})

export const CWM076_DrainedPond_impl = CWM076_DrainedPond.impl
