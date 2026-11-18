import { defineOccupationCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { getCardDefinitionById } from '../../helpers/card-type'

const CARD_ID = 'CFL058_GoldWeigher'

const cardImpl = {
  listeners: [
    {
      id: CARD_ID + '-improvement-fee',
      cardIds: [CARD_ID],
      actions: ['improvement'],
      phases: ['computeCosts'],
      scope: 'opponent',
      handler: (context) => {
        const owner = context.ownerPlayer
        const card =
          typeof context.cardId === 'string' ? getCardDefinitionById(context.cardId) : undefined
        if (!owner || !card || (card.vp ?? 0) < 2) return
        return {
          paymentTransfers: [
            { recipientPlayerId: owner.id, sourceCard: CARD_ID, resources: { food: 1 } },
          ],
          sourceCard: CARD_ID,
        }
      },
    },
  ],
} satisfies CardImpl

export const CFL058_GoldWeigher = defineOccupationCard({
  meta: {
    id: 'CFL058_GoldWeigher',
    name: 'Gold Weigher',
    deck: 'CFL',
    number: 58,
    players: '3+',
    desc: [
      'Before another player plays an improvement with at least 2 printed victory points, that player must pay you 1 <FOOD>. Bonus points do not count.',
    ],
    implemented: true,
    artUrl: 'assets/classic/CFL/CFL058.png',
  },
  impl: cardImpl,
})
