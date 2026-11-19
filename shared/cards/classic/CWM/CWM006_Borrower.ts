import { defineOccupationCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { gainLeaf, payGainActionFlow } from '../../helpers/pay-gain-node'

const CARD_ID = 'CWM006_Borrower'

const cardImpl = {
  effect: { id: CARD_ID, onBuy: () => gainLeaf(CARD_ID, { food: 7, begging: 2 }) },
  listeners: [
    {
      id: CARD_ID + '-repay',
      cardIds: [CARD_ID],
      actions: ['anytime'],
      phases: ['anytime'],
      handler: ({ state, player }) => {
        // Returns consume feeding markers first, then markers issued by this card.
        const issued = state.events
          .filter(
            (e) =>
              e.type === 'resource.moved' &&
              e.sourceCardId === CARD_ID &&
              e.to.kind === 'player' &&
              e.to.playerId === player.id,
          )
          .reduce(
            (sum, e) => sum + (e.type === 'resource.moved' ? (e.resources.begging ?? 0) : 0),
            0,
          )
        const returned = state.events
          .filter(
            (e) =>
              e.type === 'resource.paid' &&
              e.actorPlayerId === player.id &&
              e.paymentFor !== 'feeding',
          )
          .reduce(
            (sum, e) => sum + (e.type === 'resource.paid' ? (e.resources.begging ?? 0) : 0),
            0,
          )
        const feeding = state.events
          .filter(
            (e) =>
              e.type === 'resource.paid' &&
              e.actorPlayerId === player.id &&
              e.paymentFor === 'feeding',
          )
          .reduce(
            (sum, e) => sum + (e.type === 'resource.paid' ? (e.resources.begging ?? 0) : 0),
            0,
          )
        if (
          player.resources.food < 3 ||
          player.resources.begging < 1 ||
          issued + feeding - returned <= 0
        )
          return
        return {
          sourceCard: CARD_ID,
          flow: payGainActionFlow({ cardId: CARD_ID, cost: { food: 3, begging: 1 } }),
        }
      },
    },
  ],
} satisfies CardImpl

export const CWM006_Borrower = defineOccupationCard({
  meta: {
    id: 'CWM006_Borrower',
    name: "Borrower",
    deck: 'CWM',
    number: 6,
    desc: ["Immediately get 7 food and 2 begging cards. At any time, you may pay 3 food to discard one begging card received from this card or from failing to feed your family."],
    cost: {},
    vp: 0,
    prerequisite: "",
    players: '1+',
    passing: false,
    extraVp: false,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM006.png',
  },
  impl: cardImpl,
})

export const CWM006_Borrower_impl = CWM006_Borrower.impl
