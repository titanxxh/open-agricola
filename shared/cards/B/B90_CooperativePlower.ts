import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { isSpaceOccupied } from '../../domain/space'
import type { CardImpl } from '../registry'
import { B90_CooperativePlower } from '../../cards-display/B/B90_CooperativePlower'

const CARD_ID = B90_CooperativePlower.id

const listener: CardListenerRegistration = {
  id: 'B90-cooperative-plower-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'farmland') return
    const grainSeeds = context.state.actionSpaces.find((s) => s.id === 'grain-seeds')
    if (!grainSeeds || !isSpaceOccupied(grainSeeds)) return
    return {
      flow: {
        type: 'leaf',
        actionId: 'plow',
        optional: true,
        sourceCard: CARD_ID,
      },
      sourceCard: CARD_ID,
    }
  },
}

export const B90_CooperativePlower_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
