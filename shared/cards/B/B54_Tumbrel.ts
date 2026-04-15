import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'B54_Tumbrel'

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

registerCardEffect({
  id: CARD_ID,
  onBuy: (_state, _player) => gainLeaf(CARD_ID, { food: 2 }),
})

const listener: CardListenerRegistration = {
  id: 'B54-tumbrel-after-sow',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['sow'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.minorPlayed.includes(CARD_ID)) return
    if (!isUnconditionalSow(context)) return
    const stableCount = context.player.stableTiles.length
    if (stableCount <= 0) return
    return { flow: gainLeaf(CARD_ID, { food: stableCount }), sourceCard: CARD_ID }
  },
}

registerCardListener(listener)

export const B54_Tumbrel = new MinorImprovement({
  id: CARD_ID,
  name: 'Tumbrel',
  deck: 'B',
  number: 54,
  category: 'FOOD_PROVIDER',
  desc: [
    'When you play this card, you immediately get 2 <FOOD>. Each time after you take an unconditional __Sow__ action, you get 1 <FOOD> for each stable you have.',
  ],
  cost: { wood: 1 },
  newSet: true,
})
