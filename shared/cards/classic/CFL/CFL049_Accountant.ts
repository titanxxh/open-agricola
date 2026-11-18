import { defineOccupationCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { gainLeaf } from '../../helpers/pay-gain-node'
import { getStoredResource, payStoredResourceLeaf } from '../../helpers/card-storage'

const CARD_ID = 'CFL049_Accountant'

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: (state) => {
      const wood = Math.max(0, 5 - state.players.length)
      if (wood > 0) return gainLeaf(CARD_ID, { wood })
    },
  },
  listeners: [
    {
      id: CARD_ID + '-occupation',
      cardIds: [CARD_ID],
      actions: ['occupation'],
      phases: ['after'],
      scope: 'opponent',
      handler: () => ({
        flow: { type: 'leaf', actionId: 'store-on-card', sourceCard: CARD_ID, params: { food: 1 } },
      }),
    },
    {
      id: CARD_ID + '-buy',
      cardIds: [CARD_ID],
      actions: ['anytime'],
      phases: ['anytime'],
      handler: ({ player }) => {
        const food = getStoredResource(player, CARD_ID, 'food')
        const offers = (
          [
            ['sheep', 2],
            ['stone', 2],
            ['boar', 3],
            ['grain', 3],
            ['cattle', 4],
            ['vegetable', 4],
          ] as const
        ).filter(([, cost]) => cost <= food)
        if (!offers.length) return
        return {
          flow: {
            type: 'xor',
            children: offers.map(([resource, cost]) => ({
              type: 'seq',
              choiceLabelKey: `resources.${resource}`,
              children: [
                payStoredResourceLeaf(player, CARD_ID, 'food', cost),
                gainLeaf(CARD_ID, { [resource]: 1 }),
              ],
            })),
          },
        }
      },
    },
  ],
} satisfies CardImpl

export const CFL049_Accountant = defineOccupationCard({
  meta: {
    id: 'CFL049_Accountant',
    name: 'Accountant',
    deck: 'CFL',
    number: 49,
    players: '1+',
    desc: [
      'When you play this card, you get 2/1/0 <WOOD> in a 3/4/5-player game. Whenever another player plays an occupation, place 1 <FOOD> on this card. At any time, spend this food to buy a <SHEEP> or <STONE> for 2, a <PIG> or <GRAIN> for 3, or a <CATTLE> or <VEGETABLE> for 4.',
    ],
    implemented: true,
    artUrl: 'assets/classic/CFL/CFL049.png',
  },
  presentation: { counters: ['food'] },
  impl: cardImpl,
})
