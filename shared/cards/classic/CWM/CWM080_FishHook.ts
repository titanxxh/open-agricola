import { defineMinorCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { getClassicAdjacentSpaceIds } from '../../helpers/classic-board-topology'

const CARD_ID = 'CWM080_FishHook'

const cardImpl = {
  listeners: [
    {
      id: CARD_ID + '-neighbor',
      cardIds: [CARD_ID],
      actionSpaces: 'all',
      phases: ['after'],
      handler: (context) => {
        if (!getClassicAdjacentSpaceIds(context.state, 'fishing').includes(context.space.id)) return
        if (
          (context.state.actionSpaces.find((space) => space.id === 'fishing')?.resources.food ??
            0) <= 0
        )
          return
        return {
          sourceCard: CARD_ID,
          flow: {
            type: 'leaf',
            actionId: 'collect',
            optional: true,
            sourceCard: CARD_ID,
            actionContext: { spaceId: 'fishing', resource: 'food', amount: 1 },
          },
        }
      },
    },
  ],
} satisfies CardImpl

export const CWM080_FishHook = defineMinorCard({
  meta: {
    id: 'CWM080_FishHook',
    name: "Fish Hook",
    deck: 'CWM',
    number: 80,
    desc: ["Whenever you use an action space orthogonally adjacent to Fishing, you may immediately take 1 food from the Fishing accumulation space."],
    cost: {
      wood: 1,
    },
    vp: 1,
    prerequisite: "2 occupations",
    occupationPrerequisites: {
      min: 2,
    },
    passing: false,
    extraVp: false,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM080.png',
  },
  impl: cardImpl,
})

export const CWM080_FishHook_impl = CWM080_FishHook.impl
