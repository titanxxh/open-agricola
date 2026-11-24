import { defineOccupationCard } from '../../card-source'
import { getStoredResource } from '../../helpers/card-storage'
import { gainLeaf } from '../../helpers/pay-gain-node'
import type { CardImpl } from '../../registry'

const CARD_ID = 'CFL049_Accountant'
const prices = [['sheep', 2], ['stone', 2], ['boar', 3], ['grain', 3], ['cattle', 4], ['vegetable', 4]] as const

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: (state) => {
      const wood = state.players.length === 3 ? 2 : state.players.length === 4 ? 1 : 0
      if (wood > 0) return gainLeaf(CARD_ID, { wood })
    },
  },
  listeners: [
    {
      id: CARD_ID + '-occupation',
      cardIds: [CARD_ID],
      actions: ['occupation'],
      phases: ['after'],
      scope: 'any',
      mandatory: true,
      handler: ({ eventQuery }) => {
        if (!eventQuery.filter('card.played').some(event => event.cardType === 'occupation')) return
        return { flow: { type: 'leaf', actionId: 'store-on-card', sourceCard: CARD_ID, params: { food: 1 } } }
      },
    },
    {
      id: CARD_ID + '-buy',
      cardIds: [CARD_ID],
      actions: ['anytime'],
      phases: ['anytime'],
      preScoring: true,
      handler: ({ player }) => {
        const food = getStoredResource(player, CARD_ID, 'food')
        const affordable = prices.filter(([, price]) => price <= food)
        if (!affordable.length) return
        return { flow: { type: 'xor', children: affordable.map(([good, price]) => ({
          type: 'seq',
          optionId: good,
          choiceLabelKey: 'ui.interactionResourceExchange',
          choiceLabelParams: { resourcesPaid: { food: price }, resourcesGained: { [good]: 1 } },
          children: [
            { type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID, params: { kind: 'increment-counter', key: 'food', amount: -price } },
            gainLeaf(CARD_ID, { [good]: 1 }),
          ],
        })) } }
      },
    },
  ],
} satisfies CardImpl

export const CFL049_Accountant = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Accountant',
    deck: 'CFL',
    artUrl: 'assets/classic/CFL/CFL049.png',
    number: 49,
    players: '3+',
    desc: ['When you play this card, you receive 2/1/0 <WOOD> in a 3/4/5-player game. Each time any player plays an Occupation, place 1 <FOOD> from the supply on this card. At any time you may spend <FOOD> from this card to buy a <SHEEP> or <STONE> for 2 <FOOD>, a <PIG> or <GRAIN> for 3 <FOOD>, or a <CATTLE> or <VEGETABLE> for 4 <FOOD>.'],
  },
  presentation: { counters: ['food'] },
  impl: cardImpl,
})
