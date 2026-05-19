import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { getStoredResource } from '../helpers/card-storage'
import type { CardImpl } from '../registry'
import { A81_InterimStorage } from '../../cards-display/A/A81_InterimStorage'

const CARD_ID = A81_InterimStorage.id

const PAYOUT_ROUNDS = new Set([7, 11, 14])

const COLLECT_MAP = {
  clay: 'wood',
  reed: 'clay',
  stone: 'reed',
} as const

const collectListener: CardListenerRegistration = {
  id: 'A81-interim-storage-before-collect',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const storedEntry = Object.entries(COLLECT_MAP).find(
      ([resource]) => (context.space.resources?.[resource as keyof typeof context.space.resources] ?? 0) > 0,
    )
    if (!storedEntry) return
    const [, storedResource] = storedEntry
    return {
      flow: {
        type: 'leaf',
        actionId: 'store-on-card',
        params: { [storedResource]: 1 },
        sourceCard: CARD_ID,
      },
      sourceCard: CARD_ID,
    }
  },
}

export const A81_InterimStorage_impl = {
  listeners: [collectListener],
  effect: {
  id: CARD_ID,
  onRoundStart: (state, player) => {
    if (!PAYOUT_ROUNDS.has(state.round)) return

    const takeable = (['wood', 'clay', 'reed'] as const)
      .map((resource) => ({
        resource,
        amount: getStoredResource(player, CARD_ID, resource),
      }))
      .filter((entry) => entry.amount > 0)

    if (takeable.length === 0) return

    return {
      type: 'seq',
      children: takeable.map((entry) => ({
        type: 'leaf' as const,
        actionId: 'take-from-card',
        params: { [entry.resource]: entry.amount },
        sourceCard: CARD_ID,
      })),
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
