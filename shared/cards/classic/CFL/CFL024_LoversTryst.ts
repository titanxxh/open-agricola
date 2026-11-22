import { defineMinorCard } from '../../card-source'
import type { CardImpl } from '../../registry'

const CARD_ID = 'CFL024_LoversTryst'

const cardImpl = {
  listeners: [
    {
      id: CARD_ID + '-meeting-place',
      cardIds: [CARD_ID],
      actionSpaces: ['meeting-place'],
      phases: ['computeReplace'],
      zones: ['hand'],
      handler: (context) => {
        if (
          !context.player.minorHand.includes(CARD_ID) ||
          context.state.players.length < 2 ||
          context.actionContext?.checkedReplaceAction === true
        )
          return
        return {
          decline: true,
          sourceCard: CARD_ID,
          alternativeFlow: {
            type: 'seq',
            choiceLabelKey: `cards.${CARD_ID}.name`,
            children: [
              {
                type: 'leaf',
                actionId: 'improvement',
                sourceCard: CARD_ID,
                params: { types: ['minor'], allowedPurchases: [CARD_ID] },
                actionContext: { purchaseActionCardId: 'meeting-place' },
              },
              { type: 'leaf', actionId: 'family-growth', sourceCard: CARD_ID },
            ],
          },
        }
      },
    },
  ],
} satisfies CardImpl

export const CFL024_LoversTryst = defineMinorCard({
  meta: {
    id: 'CFL024_LoversTryst',
    name: 'Lovers Tryst',
    deck: 'CFL',
    number: 24,
    passing: true,
    occupationPrerequisites: {
      min: 2,
    },
    desc: [
      'When you use Meeting Place to play this card, you may leave the starting-player marker where it is and take a Family Growth action requiring room instead. Then pass this card to the player on your left.',
    ],
    implemented: true,
    artUrl: 'assets/classic/CFL/CFL024.png',
  },
  impl: cardImpl,
})
