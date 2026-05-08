import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { E77_Mattock } from '../../cards-display/E/E77_Mattock'
export { E77_Mattock }

const CARD_ID = E77_Mattock.id

const isReedOrStoneAccumulationSpace = (context: CardListenerContext): boolean => {
  if (!context.space) return false
  const gpr = context.space.gainPerRound
  return (gpr?.reed ?? 0) > 0 || (gpr?.stone ?? 0) > 0
}

const collectListener: CardListenerRegistration = {
  id: 'E77-mattock-after-collect',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!isReedOrStoneAccumulationSpace(context)) return
    return { flow: gainLeaf(CARD_ID, { clay: 1 }), sourceCard: CARD_ID }
  },
}

const RESOURCE_MARKET_IDS = new Set(['resource-market-4'])

const placeFarmerListener: CardListenerRegistration = {
  id: 'E77-mattock-place-farmer',
  cardIds: [CARD_ID],
  phases: ['during' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.space || !RESOURCE_MARKET_IDS.has(context.space.id)) return
    return { flow: gainLeaf(CARD_ID, { clay: 1 }), sourceCard: CARD_ID }
  },
}

export const E77_Mattock_impl = {
  listeners: [collectListener, placeFarmerListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
