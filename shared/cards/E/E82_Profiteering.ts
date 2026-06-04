import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf, payLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'E82_Profiteering'

const BUILDING_RESOURCES = ['wood', 'clay', 'reed', 'stone'] as const

/**
 * Each time you use Day Laborer, exchange 1 building resource for another.
 */
const listener: CardListenerRegistration = {
  id: 'E82-profiteering-day-laborer',
  cardIds: [CARD_ID],
  actions: ['place-farmer'],
  phases: ['after' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'day-laborer') return
    const children = BUILDING_RESOURCES
      .filter((pay) => (context.player.resources[pay] ?? 0) >= 1)
      .map((pay) => ({
        type: 'seq' as const,
        children: [
          payLeaf({ cardId: CARD_ID, cost: { [pay]: 1 } }),
          {
            type: 'xor' as const,
            children: BUILDING_RESOURCES
              .filter((gain) => gain !== pay)
              .map((gain) => gainLeaf(CARD_ID, { [gain]: 1 })),
          },
        ],
      }))
    if (children.length === 0) return
    return {
      flow: {
        type: 'xor',
        optional: true,
        children,
      },
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [listener],
  effect: {
  id: CARD_ID,
  onBuy: () => gainLeaf(CARD_ID, { food: 1 }),
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E82_Profiteering = defineMinorCard({
  meta: {
    id: "E82_Profiteering",
    name: "Profiteering",
    deck: "E",
    number: 82,
    desc: ["When you play this card, you immediately get 1 <FOOD>. Each time you use the __Day Laborer__ action space, you can exchange 1 building resource for another building resource."],
    cost: {},
    category: 'BUILDING_RESOURCES_-_ALL',
  },
  impl: cardImpl,
})

export const E82_Profiteering_impl = E82_Profiteering.impl
