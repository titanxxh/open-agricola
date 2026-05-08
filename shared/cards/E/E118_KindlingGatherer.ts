import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { E118_KindlingGatherer } from '../../cards-display/E/E118_KindlingGatherer'
export { E118_KindlingGatherer }

const CARD_ID = E118_KindlingGatherer.id

const PLACE_FARMER_FOOD_SPACES = new Set([
  'resource-market-4',
])

const COLLECT_FOOD_SPACES = new Set([
  'fishing',
  'traveling-players',
])

const GAIN_FOOD_SPACES = new Set([
  'day-laborer',
])

const placeFarmerListener: CardListenerRegistration = {
  id: 'E118-kindling-gatherer-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.space) return
    if (!PLACE_FARMER_FOOD_SPACES.has(context.space.id)) return
    return { flow: gainLeaf(CARD_ID, { wood: 1 }), sourceCard: CARD_ID }
  },
}

const collectListener: CardListenerRegistration = {
  id: 'E118-kindling-gatherer-after-collect',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.space) return
    if (!COLLECT_FOOD_SPACES.has(context.space.id)) return
    return { flow: gainLeaf(CARD_ID, { wood: 1 }), sourceCard: CARD_ID }
  },
}

const gainListener: CardListenerRegistration = {
  id: 'E118-kindling-gatherer-after-gain',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['gain'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.space) return
    if (!GAIN_FOOD_SPACES.has(context.space.id)) return
    // Only trigger if food was actually gained
    const gained = context.result?.type === 'ok' ? context.result.resourcesGained : undefined
    if (gained && (gained.food ?? 0) > 0) {
      return { flow: gainLeaf(CARD_ID, { wood: 1 }), sourceCard: CARD_ID }
    }
  },
}

export const E118_KindlingGatherer_impl = {
  listeners: [placeFarmerListener, collectListener, gainListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
