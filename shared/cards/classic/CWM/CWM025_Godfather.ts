import { defineOccupationCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { getClassicAdjacentSpaceIds } from '../../helpers/classic-board-topology'
import { gainLeaf } from '../../helpers/pay-gain-node'

const CARD_ID = 'CWM025_Godfather'

const cardImpl = {
  listeners: [
    {
      id: CARD_ID + '-neighbor',
      cardIds: [CARD_ID],
      actionSpaces: 'all',
      phases: ['before'],
      handler: (context) => {
        const neighbor = context.state.actionSpaces.some(
          (space) =>
            ['wish-children', 'urgent-wish-children'].includes(space.id) &&
            space.takenBy.length > 0 &&
            getClassicAdjacentSpaceIds(context.state, space.id).includes(context.space.id),
        )
        return neighbor ? { sourceCard: CARD_ID, flow: gainLeaf(CARD_ID, { grain: 1 }) } : undefined
      },
    },
  ],
} satisfies CardImpl

export const CWM025_Godfather = defineOccupationCard({
  meta: {
    id: 'CWM025_Godfather',
    name: "Godfather",
    deck: 'CWM',
    number: 25,
    desc: ["Immediately before you use an action space orthogonally adjacent to an occupied Family Growth or Urgent Wish for Children action space, you get 1 grain."],
    cost: {},
    vp: 0,
    prerequisite: "",
    players: '1+',
    passing: false,
    extraVp: false,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM025.png',
  },
  impl: cardImpl,
})

export const CWM025_Godfather_impl = CWM025_Godfather.impl
