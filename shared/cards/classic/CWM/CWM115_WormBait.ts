import { defineMinorCard } from '../../card-source'
import type { CardImpl } from '../../registry'

const CARD_ID = 'CWM115_WormBait'

const cardImpl = {
  listeners: [
    {
      id: CARD_ID + '-store',
      cardIds: [CARD_ID],
      actionSpaces: ['farmland'],
      phases: ['after'],
      handler: () => ({
        sourceCard: CARD_ID,
        flow: { type: 'leaf', actionId: 'store-on-card', sourceCard: CARD_ID, params: { food: 2 } },
      }),
    },
    {
      id: CARD_ID + '-fish',
      cardIds: [CARD_ID],
      actionSpaces: ['fishing'],
      phases: ['after'],
      handler: (context) => {
        const food = context.player.cardStates[CARD_ID]?.counters?.food ?? 0
        return food > 0
          ? {
              sourceCard: CARD_ID,
              flow: {
                type: 'leaf',
                actionId: 'take-from-card',
                sourceCard: CARD_ID,
                params: { food },
              },
            }
          : undefined
      },
    },
  ],
  effect: {
    id: CARD_ID,
    onStartHarvest: (_state, player) =>
      (player.cardStates[CARD_ID]?.counters?.food ?? 0) > 0
        ? {
            type: 'leaf',
            actionId: 'special-effect',
            sourceCard: CARD_ID,
            params: { kind: 'increment-counter', key: 'food', amount: -1 },
          }
        : undefined,
  },
} satisfies CardImpl

export const CWM115_WormBait = defineMinorCard({
  meta: {
    id: 'CWM115_WormBait',
    name: "Worm Bait",
    deck: 'CWM',
    number: 115,
    desc: ["Whenever you use Farmland, put 2 food from the supply on this card. Whenever you use Fishing, take all its food. At the start of each harvest, return 1 food from this card."],
    cost: {},
    vp: 0,
    prerequisite: "",
    passing: false,
    extraVp: false,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM115.png',
  },
  presentation: { counters: ['food'] },
  impl: cardImpl,
})

export const CWM115_WormBait_impl = CWM115_WormBait.impl
