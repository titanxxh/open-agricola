import { defineOccupationCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { gainLeaf } from '../../helpers/pay-gain-node'
import { countNewFenceEdges } from '../../helpers/fence-events'
import { getActionFarmOperations } from '../../helpers/farmyard-events'

const CARD_ID = 'CWM029_HillFarmer'

const cardImpl = {
  listeners: [
    {
      id: CARD_ID + '-farm',
      cardIds: [CARD_ID],
      actions: ['fence', 'plow'],
      phases: ['after'],
      handler: (context) => {
        const food = context.player.rooms === 2 ? 2 : context.player.rooms === 3 ? 1 : 0
        const built =
          context.actionId === 'fence'
            ? countNewFenceEdges(context) > 0
            : getActionFarmOperations(context)?.some((operation) => operation.kind === 'plow')
        return food && built
          ? { sourceCard: CARD_ID, flow: gainLeaf(CARD_ID, { food }) }
          : undefined
      },
    },
  ],
} satisfies CardImpl

export const CWM029_HillFarmer = defineOccupationCard({
  meta: {
    id: 'CWM029_HillFarmer',
    name: "Hill Farmer",
    deck: 'CWM',
    number: 29,
    desc: ["Whenever you build at least 1 <FENCE> or plow at least 1 <FIELD>, you get 2 or 1 <FOOD> if you have exactly 2 or 3 rooms, respectively."],
    cost: {},
    vp: 0,
    prerequisite: "",
    players: '3+',
    passing: false,
    extraVp: false,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM029.png',
  },
  impl: cardImpl,
})

export const CWM029_HillFarmer_impl = CWM029_HillFarmer.impl
