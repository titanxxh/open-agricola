import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { payLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { E18_SeedAlmanac } from '../../cards-display/E/E18_SeedAlmanac'
export { E18_SeedAlmanac }

const CARD_ID = E18_SeedAlmanac.id

const listener: CardListenerRegistration = {
  id: 'E18-seed-almanac-after-improvement',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['improvement-any', 'minor-improvement'],
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

export const E18_SeedAlmanac_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
