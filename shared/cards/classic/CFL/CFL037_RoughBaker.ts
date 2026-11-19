import { defineOccupationCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { gainLeaf } from '../../helpers/pay-gain-node'
import { registerBakeRateProvider } from '../../helpers/exchange-registry'

const CARD_ID = 'CFL037_RoughBaker'

registerBakeRateProvider(CARD_ID, (_player, rates) =>
  rates.flatMap((rate) => {
    const clay = ['Major_ClayOven', 'Major_ClayOven2'].includes(rate.cardId)
    const stone = ['Major_StoneOven', 'Major_StoneOven2'].includes(rate.cardId)
    return clay || stone
      ? [
          {
            cardId: `${CARD_ID}:${rate.cardId}`,
            exclusiveGroup: rate.cardId,
            rate: clay ? 4 : 5,
            max: clay ? 2 : 1,
            labelKey: `cards.${CARD_ID}.name`,
          },
        ]
      : []
  }),
)

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: () => ({
      type: 'seq',
      children: [
        gainLeaf(CARD_ID, { grain: 1 }),
        {
          type: 'leaf',
          actionId: 'bake-bread',
          sourceCard: CARD_ID,
          optional: true,
          actionContext: { trueAction: false },
        },
      ],
    }),
  },
} satisfies CardImpl

export const CFL037_RoughBaker = defineOccupationCard({
  meta: {
    id: 'CFL037_RoughBaker',
    name: 'Rough Baker',
    deck: 'CFL',
    number: 37,
    players: '1+',
    desc: [
      'You immediately get 1 <GRAIN> and may Bake Bread. Whenever you Bake Bread, you may use each Clay Oven as a Stone Oven, or each Stone Oven as a Clay Oven.',
    ],
    implemented: true,
    artUrl: 'assets/classic/CFL/CFL037.png',
  },
  impl: cardImpl,
})
