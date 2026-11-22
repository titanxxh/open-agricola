import { defineMinorCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { payGainFlow } from '../../helpers/pay-gain-node'

const CARD_ID = 'CWM097_OpenGate'

const cardImpl = {
  effect: {
    id: CARD_ID,
    onStartHarvestFeedingPhase: () =>
      payGainFlow({ cardId: CARD_ID, cost: { sheep: 1 }, gain: { score: 1 } }),
  },
} satisfies CardImpl

export const CWM097_OpenGate = defineMinorCard({
  meta: {
    id: 'CWM097_OpenGate',
    name: "Open Gate",
    deck: 'CWM',
    number: 97,
    desc: ["Before each harvest feeding phase, you may pay at most 1 <SHEEP> for 1 bonus <SCORE>."],
    cost: {
      stone: 1,
    },
    vp: 1,
    prerequisite: "",
    passing: false,
    extraVp: true,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM097.png',
  },
  impl: cardImpl,
})

export const CWM097_OpenGate_impl = CWM097_OpenGate.impl
