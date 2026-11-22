import { defineOccupationCard } from '../../card-source'
import type { CardImpl } from '../../registry'

const CARD_ID = 'CWM021_FenceDealer'

const cardImpl = {
  effect: { id: CARD_ID, getRuleContributions: () => ({ reservedSupply: { fence: 3 } }) },
  listeners: [
    {
      id: CARD_ID + '-two-for-one',
      cardIds: [CARD_ID],
      actions: ['fence'],
      phases: ['computeCosts'],
      monotoneFenceCost: true,
      handler: (context) => {
        const edges = context.params?.newFenceEdges
        if (!Array.isArray(edges) || edges.length < 2) return
        const costs = { wood: -Math.floor(edges.length / 2) }
        return { costs, costAttribution: [{ sourceCard: CARD_ID, costs }] }
      },
    },
  ],
} satisfies CardImpl

export const CWM021_FenceDealer = defineOccupationCard({
  meta: {
    id: 'CWM021_FenceDealer',
    name: "Fence Dealer",
    deck: 'CWM',
    number: 21,
    desc: ["You may build only 12 fences. Each wood you pay for fences builds 2 fences."],
    cost: {},
    vp: 0,
    prerequisite: "",
    players: '1+',
    passing: false,
    extraVp: false,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM021.png',
  },
  impl: cardImpl,
})

export const CWM021_FenceDealer_impl = CWM021_FenceDealer.impl
