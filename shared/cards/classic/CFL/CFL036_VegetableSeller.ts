import { defineOccupationCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { gainLeaf } from '../../helpers/pay-gain-node'

const CARD_ID = 'CFL036_VegetableSeller'

const cardImpl = {
  effect: {
    id: CARD_ID,
    timedRules: [
      {
        key: 'repay-borrowed-vegetables',
        retainAfterCardLeaves: true,
        at: { kind: 'rounds', rounds: [14], phase: 'onBeforeEndGame' },
        body: {
          kind: 'operation',
          operation: {
            kind: 'repay-resource-debt',
            fact: 'borrowed',
            resource: 'vegetable',
            shortfallResource: 'begging',
          },
        },
      },
    ],
  },
  listeners: [
    {
      id: CARD_ID + '-borrow',
      cardIds: [CARD_ID],
      actions: ['anytime'],
      phases: ['anytime'],
      handler: () => ({
        flow: {
          type: 'seq',
          children: [
            {
              type: 'leaf',
              actionId: 'special-effect',
              sourceCard: CARD_ID,
              params: { kind: 'increment-extra-data', key: 'borrowed', amount: 1 },
            },
            gainLeaf(CARD_ID, { vegetable: 1 }),
          ],
        },
      }),
    },
  ],
} satisfies CardImpl

export const CFL036_VegetableSeller = defineOccupationCard({
  meta: {
    id: 'CFL036_VegetableSeller',
    name: 'Vegetable Seller',
    deck: 'CFL',
    number: 36,
    players: '1+',
    desc: [
      'At any time, you may borrow 1 <VEGETABLE> from the general supply, and you may convert a vegetable to 2 <FOOD>. Before final scoring, return every borrowed vegetable; take 1 <BEGGING> marker for each missing vegetable.',
    ],
    implemented: true,
    artUrl: 'assets/classic/CFL/CFL036.png',
    exchanges: [
      {
        from: {
          vegetable: 1,
        },
        to: {
          food: 2,
        },
        triggers: ['anytime', 'harvest'],
      },
    ],
  },
  impl: cardImpl,
})
