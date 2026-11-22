import { defineMinorCard } from '../../card-source'
import type { CardImpl } from '../../registry'

const CARD_ID = 'CFL018_Oce'

const cardImpl = {
  effect: { id: CARD_ID },
} satisfies CardImpl

export const CFL018_Oce = defineMinorCard({
  meta: {
    id: 'CFL018_Oce',
    name: 'Office',
    deck: 'CFL',
    number: 18,
    cost: {
      clay: 4,
      wood: 3,
      reed: 2,
    },
    vp: 1,
    desc: [
      'At any time, you can exchange 1 <CLAY> for 1 <STONE>, 1 <GRAIN> for 1 <VEGETABLE>, or 1 <PIG> for 1 <CATTLE>.',
    ],
    implemented: true,
    artUrl: 'assets/classic/CFL/CFL018.png',
    exchanges: [
      {
        from: {
          clay: 1,
        },
        to: {
          stone: 1,
        },
        triggers: ['anytime'],
      },
      {
        from: {
          grain: 1,
        },
        to: {
          vegetable: 1,
        },
        triggers: ['anytime'],
      },
      {
        from: {
          boar: 1,
        },
        to: {
          cattle: 1,
        },
        triggers: ['anytime'],
      },
    ],
  },
  impl: cardImpl,
})
