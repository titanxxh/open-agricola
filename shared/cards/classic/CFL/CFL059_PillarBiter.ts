import { defineOccupationCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { countNewFenceEdges } from '../../helpers/fence-events'

const CARD_ID = 'CFL059_PillarBiter'

const cardImpl = {
  listeners: [
    {
      id: CARD_ID + '-fences',
      cardIds: [CARD_ID],
      actions: ['fence'],
      phases: ['after'],
      scope: 'opponent',
      handler: (context) => {
        if (countNewFenceEdges(context) < 1) return
        return {
          flow: {
            type: 'xor',
            optional: true,
            children: [3, 4].map((count) => ({
              type: 'leaf',
              actionId: 'fence',
              sourceCard: CARD_ID,
              actionContext: {
                trueAction: false,
                fencePolicy: {
                  allowedSegmentTypes: ['fence'],
                  segmentBounds: { fence: { min: count, max: count } },
                  costPolicy: { fence: { wood: 0 }, fixedWood: count - 1 },
                },
              },
            })),
          },
        }
      },
    },
  ],
} satisfies CardImpl

export const CFL059_PillarBiter = defineOccupationCard({
  meta: {
    id: 'CFL059_PillarBiter',
    name: 'Pillar Biter',
    deck: 'CFL',
    number: 59,
    players: '3+',
    desc: [
      'Whenever another player builds at least 1 <FENCE>, you may pay 2 <WOOD> to build exactly 3 <FENCE>, or 3 <WOOD> to build exactly 4 <FENCE>. The normal fencing rules apply.',
    ],
    implemented: true,
    artUrl: 'assets/classic/CFL/CFL059.png',
  },
  impl: cardImpl,
})
