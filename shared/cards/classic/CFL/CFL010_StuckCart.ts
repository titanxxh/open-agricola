import { defineMinorCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { workersAvailable } from '../../../domain/player'
import { getRoundPersonPlacementOrder } from '../../helpers/round-placement'

const CARD_ID = 'CFL010_StuckCart'

const cardImpl = {
  prerequisiteCheck: (player) => getRoundPersonPlacementOrder(player).length >= 2,
  effect: {
    id: CARD_ID,
    onBuy: (state, player) => ({
      type: 'seq',
      children: Array.from({ length: workersAvailable(state, player) }, () => ({
        type: 'leaf',
        actionId: 'place-farmer',
        sourceCard: CARD_ID,
        actionContext: { trueAction: false },
      })),
    }),
  },
} satisfies CardImpl

export const CFL010_StuckCart = defineMinorCard({
  meta: {
    id: 'CFL010_StuckCart',
    name: 'Stuck Cart',
    deck: 'CFL',
    number: 10,
    cost: {
      wood: 1,
    },
    vp: 1,
    passing: true,
    desc: [
      'Immediately place all your remaining family members, one after another. Then pass this card to the player on your left.',
    ],
    implemented: true,
    artUrl: 'assets/classic/CFL/CFL010.png',
    prerequisite: '2 placed family members',
  },
  impl: cardImpl,
})
