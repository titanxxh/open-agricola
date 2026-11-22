import { defineMinorCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { getRoundPersonPlacementOrder } from '../../helpers/round-placement'

const CARD_ID = 'CFL012_Cart'

const cardImpl = {
  listeners: [
    {
      id: CARD_ID + '-first-person',
      cardIds: [CARD_ID],
      actionSpaces: 'all',
      phases: ['isDoable'],
      scope: 'opponent',
      handler: (context) => {
        const actor = context.triggerPlayer ?? context.player
        if (getRoundPersonPlacementOrder(actor).length !== 0 || !context.space) return
        const resources = context.space.resources
        if (
          (resources.wood ?? 0) >= 6 ||
          (resources.clay ?? 0) >= 5 ||
          (resources.reed ?? 0) >= 4 ||
          (resources.stone ?? 0) >= 3
        )
          return { doable: false }
      },
    },
  ],
} satisfies CardImpl

export const CFL012_Cart = defineMinorCard({
  meta: {
    id: 'CFL012_Cart',
    name: 'Cart',
    deck: 'CFL',
    number: 12,
    cost: {
      wood: 3,
    },
    desc: [
      'Only you may use a space with at least 6 <WOOD>, 5 <CLAY>, 4 <REED>, or 3 <STONE> with your first person of a round. Other players may use it with a later person.',
    ],
    implemented: true,
    artUrl: 'assets/classic/CFL/CFL012.png',
  },
  impl: cardImpl,
})
