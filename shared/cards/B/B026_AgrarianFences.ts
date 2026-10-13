import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration } from '../card-listeners'
import type { CardImpl } from '../registry'

const CARD_ID = 'B026_AgrarianFences'

const computeReplaceListener: CardListenerRegistration = {
  id: 'B26-agrarian-fences-replace-grain-utilization',
  cardIds: [CARD_ID],
  phases: ['computeReplace'],
  actions: ['grain-utilization'],
  handler: (context) => {
    if (context.space.id !== 'grain-utilization') return
    return {
      decline: true,
      sourceCard: CARD_ID,
      alternativeFlow: {
        type: 'xor',
        choiceLabelKey: 'cards.B026_AgrarianFences.name',
        children: [
          {
            type: 'or',
            choiceLabelKey: 'ui.interactionAgrarianFencesSowAndFence',
            children: [
              { type: 'leaf', actionId: 'fence', sourceCard: CARD_ID, choiceLabelKey: 'actions.fencing.name' },
              { type: 'leaf', actionId: 'sow' },
            ],
          },
          {
            type: 'or',
            choiceLabelKey: 'ui.interactionAgrarianFencesBakeAndFence',
            children: [
              { type: 'leaf', actionId: 'fence', sourceCard: CARD_ID, choiceLabelKey: 'actions.fencing.name' },
              { type: 'leaf', actionId: 'bake-bread' },
            ],
          },
        ],
      },
    }
  },
}

const cardImpl = {
  listeners: [computeReplaceListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B026_AgrarianFences = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Agrarian Fences',
    deck: 'B',
    number: 26,
    category: 'ACTIONS_BOOSTER',
    desc: [
        'Each time you use the __Grain Utilization__ action space, you can take a __Build Fences__ action instead of one of the two actions provide by the action space.',
      ],
  },
  impl: cardImpl,
})

export const B026_AgrarianFences_impl = B026_AgrarianFences.impl
