import { defineOccupationCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { bonusVpLeaf } from '../../helpers/pay-gain-node'
import { countNewFenceEdges } from '../../helpers/fence-events'

const CARD_ID = 'CWM026_HedgeMaster'

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: () => ({ type: 'leaf', actionId: 'fence', sourceCard: CARD_ID, optional: true }),
  },
  listeners: [
    {
      id: CARD_ID + '-fences',
      cardIds: [CARD_ID],
      actions: ['fence'],
      phases: ['after'],
      handler: (context) =>
        countNewFenceEdges(context) > 0
          ? { sourceCard: CARD_ID, flow: bonusVpLeaf(CARD_ID) }
          : undefined,
    },
  ],
} satisfies CardImpl

export const CWM026_HedgeMaster = defineOccupationCard({
  meta: {
    id: 'CWM026_HedgeMaster',
    name: "Hedge Master",
    deck: 'CWM',
    number: 26,
    desc: ["Whenever you build at least 1 <FENCE>, you get 1 bonus <SCORE>. When you play this card, you may immediately take a __Build Fences__ action."],
    cost: {},
    vp: 0,
    prerequisite: "",
    players: '1+',
    passing: false,
    extraVp: true,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM026.png',
  },
  impl: cardImpl,
})

export const CWM026_HedgeMaster_impl = CWM026_HedgeMaster.impl
