import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { B54_Tumbrel } from '../../cards-display/B/B54_Tumbrel'

const CARD_ID = B54_Tumbrel.id

/**
 * B54 Tumbrel (Minor Improvement):
 * When you play this card, you immediately get 2 Food.
 * Each time after you take an unconditional Sow action,
 * you get 1 Food for each stable you have.
 */

const isUnconditionalSow = (context: CardListenerContext): boolean => {
  const actionContext = context.actionContext ?? {}
  if (actionContext.checkedReplaceAction === true) return false
  return actionContext.maxSelections === undefined && actionContext.cropType === undefined
}

const listener: CardListenerRegistration = {
  id: 'B54-tumbrel-after-sow',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['sow'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!isUnconditionalSow(context)) return
    const stableCount = context.player.stableTiles.length
    if (stableCount <= 0) return
    return { flow: gainLeaf(CARD_ID, { food: stableCount }), sourceCard: CARD_ID }
  },
}

export const B54_Tumbrel_impl = {
  listeners: [listener],
  effect: {
  id: CARD_ID,
  onBuy: (_state, _player) => gainLeaf(CARD_ID, { food: 2 }),
},
  reaches: [] as readonly string[],
} satisfies CardImpl
