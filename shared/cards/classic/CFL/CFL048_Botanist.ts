import { defineOccupationCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { gainLeaf } from '../../helpers/pay-gain-node'
import { sumActionSpaceMovedToTriggerPlayerFromSpace } from '../../helpers/event-provenance'

const CARD_ID = 'CFL048_Botanist'

const cardImpl = {
  listeners: [
    {
      id: CARD_ID + '-wood',
      cardIds: [CARD_ID],
      actions: ['collect'],
      phases: ['after'],
      scope: 'opponent',
      handler: (context) => {
        if ((context.space?.gainPerRound?.wood ?? 0) <= 0) return
        if (sumActionSpaceMovedToTriggerPlayerFromSpace(context, 'wood') === 3)
          return { flow: gainLeaf(CARD_ID, { food: 1 }) }
      },
    },
  ],
} satisfies CardImpl

export const CFL048_Botanist = defineOccupationCard({
  meta: {
    id: 'CFL048_Botanist',
    name: 'Botanist',
    deck: 'CFL',
    number: 48,
    players: '1+',
    desc: [
      'Whenever another player takes exactly 3 <WOOD> from a wood accumulation space, you get 1 <FOOD>.',
    ],
    implemented: true,
    artUrl: 'assets/classic/CFL/CFL048.png',
  },
  impl: cardImpl,
})
