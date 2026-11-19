import { defineOccupationCard } from '../../card-source'
import type { CardImpl } from '../../registry'

const CARD_ID = 'CWM007_BranchCollector'

const cardImpl = {
  effect: {
    id: CARD_ID,
    computePaymentResourceGrants: (_state, _player, payment) => {
      if (
        !['construct', 'renovation', 'minor-improvement', 'major-improvement'].includes(
          payment.costType ?? '',
        )
      )
        return
      if ((payment.resourcesPaid.clay ?? 0) <= 0 && (payment.resourcesPaid.stone ?? 0) <= 0) return
      return { wood: payment.costType === 'construct' ? payment.units : 1 }
    },
  },
} satisfies CardImpl

export const CWM007_BranchCollector = defineOccupationCard({
  meta: {
    id: 'CWM007_BranchCollector',
    name: "Branch Collector",
    deck: 'CWM',
    number: 7,
    desc: ["Immediately before you build rooms, renovate, or play an improvement, if you will actually pay clay or stone, you get 1 wood per room built, renovation, or improvement."],
    cost: {},
    vp: 0,
    prerequisite: "",
    players: '1+',
    passing: false,
    extraVp: false,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM007.png',
  },
  impl: cardImpl,
})

export const CWM007_BranchCollector_impl = CWM007_BranchCollector.impl
