import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { payLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'E18_SeedAlmanac'
const listener: CardListenerRegistration = {
  id: 'E18-seed-almanac-after-improvement',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['improvement'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const choice = context.choice ?? ''
    // Only trigger for minor improvements, not this card itself
    if (choice.startsWith('major:')) return
    const builtId = choice.replace(/^minor:/, '')
    if (!builtId || builtId === CARD_ID) return
    return {
      flow: {
        type: 'seq',
        optional: true,
        children: [
          payLeaf({ cardId: CARD_ID, cost: { food: 1 } }),
          { type: 'leaf', actionId: 'plow', sourceCard: CARD_ID },
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E18_SeedAlmanac = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Seed Almanac',
    deck: 'E',
    number: 18,
    category: 'FARMYARD_-_PLOWING',
    desc: [
        'Each time after you play a minor improvement after this one, you can pay 1 <FOOD> to plow 1 field.',
      ],
    cost: { reed: 1 },
    prerequisite: '4 Occupations',
    occupationPrerequisites: { min: 4 },
  },
  impl: cardImpl,
})

export const E18_SeedAlmanac_impl = E18_SeedAlmanac.impl
