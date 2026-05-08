import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { B112_Silokeeper } from '../../cards-display/B/B112_Silokeeper'

const CARD_ID = B112_Silokeeper.id

const TRIGGER_ROUND_MAP: Record<number, number> = {
  1: -1, 2: -1, 3: -1, 4: -1,
  5: 4, 6: 4, 7: 4,
  8: 7, 9: 7,
  10: 9, 11: 9,
  12: 11, 13: 11,
  14: 13,
}

const listener: CardListenerRegistration = {
  id: 'B112-silokeeper-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const currentRound = context.state.round
    const triggerRevealRound = TRIGGER_ROUND_MAP[currentRound] ?? -1
    if (triggerRevealRound < 0) return
    // Find the space that was revealed in the trigger round
    const triggerSpaceId = context.state.roundActionOrder[triggerRevealRound - 1]
    if (!triggerSpaceId) return
    if (context.space?.id !== triggerSpaceId) return
    return { flow: gainLeaf(CARD_ID, { grain: 1 }), sourceCard: CARD_ID }
  },
}

export const B112_Silokeeper_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
