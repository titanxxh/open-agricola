import { defineMinorCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { getRoundPersonPlacementOrder } from '../../helpers/round-placement'

const CARD_ID = 'CFL030_WildBoarHunt'

const cardImpl = {
  effect: {
    id: CARD_ID,
    onPreparation: (state) => {
      if (
        state.round % 2 === 0 &&
        state.roundActionOrder.indexOf('pig-market') < state.round &&
        state.roundActionOrder.includes('pig-market')
      )
        return {
          type: 'leaf',
          actionId: 'special-effect',
          sourceCard: CARD_ID,
          params: {
            kind: 'add-resource-to-space',
            spaceId: 'pig-market',
            resource: 'boar',
            amount: 1,
          },
        }
    },
  },
  listeners: [
    {
      id: CARD_ID + '-first-person',
      cardIds: [CARD_ID],
      actionSpaces: ['pig-market'],
      phases: ['isDoable'],
      scope: 'opponent',
      handler: (context) =>
        getRoundPersonPlacementOrder(context.triggerPlayer ?? context.player).length > 0
          ? { doable: false }
          : undefined,
    },
  ],
} satisfies CardImpl

export const CFL030_WildBoarHunt = defineMinorCard({
  meta: {
    id: 'CFL030_WildBoarHunt',
    name: 'Wild Boar Hunt',
    deck: 'CFL',
    number: 30,
    vp: 1,
    occupationPrerequisites: {
      min: 2,
    },
    desc: [
      'In each even-numbered round, place 1 additional <PIG> on the Wild Boar Market. Other players can use that space only with their first person of a round.',
    ],
    implemented: true,
    artUrl: 'assets/classic/CFL/CFL030.png',
  },
  impl: cardImpl,
})
