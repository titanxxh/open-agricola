import { defineOccupationCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { payGainActionFlow } from '../../helpers/pay-gain-node'

const CARD_ID = 'CFL053_CafeSinger'

const cardImpl = {
  listeners: [
    {
      id: CARD_ID + '-sing',
      cardIds: [CARD_ID],
      actionSpaces: ['traveling-players', 'traveling-players-56'],
      phases: ['after'],
      handler: () => ({
        flow: {
          type: 'xor',
          optional: true,
          children: [
            payGainActionFlow({
              cardId: CARD_ID,
              cost: { sheep: 1 },
              gain: { vegetable: 1 },
              choiceLabelKey: 'ui.interactionResourceExchange',
            }),
            payGainActionFlow({
              cardId: CARD_ID,
              cost: { cattle: 1 },
              gain: { vegetable: 2 },
              choiceLabelKey: 'ui.interactionResourceExchange',
            }),
          ],
        },
      }),
    },
  ],
} satisfies CardImpl

export const CFL053_CafeSinger = defineOccupationCard({
  meta: {
    id: 'CFL053_CafeSinger',
    name: 'Cafe Singer',
    deck: 'CFL',
    number: 53,
    players: '4+',
    desc: [
      'Whenever you use the Traveling Players action space, you may exchange 1 <SHEEP> for 1 <VEGETABLE>, or 1 <CATTLE> for 2 <VEGETABLE>.',
    ],
    implemented: true,
    artUrl: 'assets/classic/CFL/CFL053.png',
  },
  impl: cardImpl,
})
