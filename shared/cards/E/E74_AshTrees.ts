import { MinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import { registerCardEffect } from '../card-effects'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { initCardState, incCounter } from '../__stubs__/helpers'

const CARD_ID = 'E74_AshTrees'
const MAX_FREE_FENCES = 5

registerCardEffect({
  id: CARD_ID,
  onBuy: (_state, player) => {
    if (!player.minorPlayed.includes(CARD_ID)) return
    const counters = initCardState(player, CARD_ID)
    counters['fences'] = MAX_FREE_FENCES
  },
})

const computeCostsListener: CardListenerRegistration = {
  id: 'E74-ash-trees-costs-fence',
  cardIds: [CARD_ID],
  phases: ['computeCosts' as ActionHookPhase],
  actions: ['fence'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.minorPlayed.includes(CARD_ID)) return
    const counters = initCardState(context.player, CARD_ID)
    const stored = counters['fences'] ?? 0
    if (stored <= 0) return
    const discount = Math.min(stored, 3)
    counters['fences'] = stored - discount
    incCounter(context.player, CARD_ID, 'triggerCount')
    return { costs: { wood: -discount } }
  },
}

registerCardListener(computeCostsListener)

export const E74_AshTrees = new MinorImprovement({
  id: CARD_ID,
  name: "Ash Trees",
  deck: "E",
  number: 74,
  desc: ["When you play this card, immediately place (up to) 5 fences from your supply on it. When you build fences, fences taken from this card cost you nothing."],
  cost: {},
  prerequisite: "2 Planted Fields",
})
