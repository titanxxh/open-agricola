import { defineMinorCard } from '../../card-source'
import type { CardImpl } from '../../registry'

const CARD_ID = 'CWM108_Steamer'

const cardImpl = {} satisfies CardImpl

export const CWM108_Steamer = defineMinorCard({
  meta: {
    exchanges: [
      { from: { grain: 1, vegetable: 1 }, to: { food: 5 }, triggers: ['anytime'] },
      { from: { grain: 1, sheep: 1 }, to: { food: 4 }, triggers: ['anytime'] },
      { from: { grain: 1, boar: 1 }, to: { food: 5 }, triggers: ['anytime'] },
      { from: { grain: 1, cattle: 1 }, to: { food: 6 }, triggers: ['anytime'] },
    ],

    id: CARD_ID,
    name: "Steamer",
    deck: 'CWM',
    number: 108,
    desc: ["At any time, you may convert 1 grain together with 1 vegetable, sheep, wild boar, or cattle into 5, 4, 5, or 6 food, respectively."],
    cost: {
      wood: 1,
    },
    vp: 0,
    prerequisite: "",
    passing: false,
    extraVp: false,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM108.png',
  },
  impl: cardImpl,
})

export const CWM108_Steamer_impl = CWM108_Steamer.impl
