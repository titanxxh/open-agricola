import { defineOccupationCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { gainLeaf } from '../../helpers/pay-gain-node'

const CARD_ID = 'CWM001_Amazon'

const cardImpl = {
  listeners: [
    {
      id: CARD_ID + '-fishing',
      cardIds: [CARD_ID],
      actionSpaces: ['fishing'],
      phases: ['after'],
      handler: ({ state }) =>
        [7, 9, 11, 13].includes(state.round)
          ? {
              sourceCard: CARD_ID,
              flow: {
                type: 'xor',
                children: ['sheep', 'boar', 'cattle'].map((animal) =>
                  gainLeaf(CARD_ID, { [animal]: 1 }),
                ),
              },
            }
          : undefined,
    },
  ],
} satisfies CardImpl

export const CWM001_Amazon = defineOccupationCard({
  meta: {
    id: 'CWM001_Amazon',
    name: "Amazon",
    deck: 'CWM',
    number: 1,
    desc: ["Whenever you use the __Fishing__ accumulation space in round 7, 9, 11, or 13, you also get 1 animal of your choice."],
    cost: {},
    vp: 0,
    prerequisite: "",
    players: '1+',
    passing: false,
    extraVp: false,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM001.png',
  },
  impl: cardImpl,
})

export const CWM001_Amazon_impl = CWM001_Amazon.impl
