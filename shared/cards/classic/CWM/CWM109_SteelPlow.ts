import { defineMinorCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { classicPlow } from '../../helpers/classic-plow'

const CARD_ID = 'CWM109_SteelPlow'

const cardImpl = classicPlow(CARD_ID, 1, 3) satisfies CardImpl

export const CWM109_SteelPlow = defineMinorCard({
  meta: {
    id: 'CWM109_SteelPlow',
    name: "Steel Plow",
    deck: 'CWM',
    number: 109,
    desc: ["Once only, when you use Farmland or Cultivation, you may plow up to 4 fields instead of 1. Only one plow or Harrow effect may be used on that visit."],
    cost: {
      stone: 3,
    },
    vp: 2,
    prerequisite: "3 occupations",
    occupationPrerequisites: {
      min: 3,
    },
    passing: false,
    extraVp: false,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM109.png',
  },
  presentation: { stack: true },
  impl: cardImpl,
})

export const CWM109_SteelPlow_impl = CWM109_SteelPlow.impl
