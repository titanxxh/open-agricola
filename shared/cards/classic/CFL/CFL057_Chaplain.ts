import { defineOccupationCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { peopleLeftToPlace } from '../../../actions/guest-turns'

const CARD_ID = 'CFL057_Chaplain'

const cardImpl = {
  listeners: [
    {
      id: CARD_ID + '-growth',
      cardIds: [CARD_ID],
      actions: ['family-growth'],
      phases: ['after'],
      scope: 'opponent',
      handler: (context) => {
        const owner = context.ownerPlayer ?? context.player
        if (peopleLeftToPlace(context.state, owner, context.actionHooks) > 0)
          return {
            flow: {
              type: 'leaf',
              actionId: 'place-farmer',
              sourceCard: CARD_ID,
              optional: true,
              targetPlayerId: owner.id,
              actionContext: { trueAction: false },
            },
          }
      },
    },
  ],
} satisfies CardImpl

export const CFL057_Chaplain = defineOccupationCard({
  meta: {
    id: 'CFL057_Chaplain',
    name: 'Chaplain',
    deck: 'CFL',
    number: 57,
    players: '1+',
    desc: [
      'Whenever another player takes a Family Growth action, you may immediately place one of your remaining people.',
    ],
    implemented: true,
    artUrl: 'assets/classic/CFL/CFL057.png',
  },
  impl: cardImpl,
})
