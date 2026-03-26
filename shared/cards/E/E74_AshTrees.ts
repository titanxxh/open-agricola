import { MinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import { registerCardEffect } from '../card-effects'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { initCardState, incCounter } from '../__stubs__/helpers'
import {
  clearPendingFenceBonus,
} from '../helpers/pending-fence-bonus'
import { getTotalPastureCells, maxFences, maxPastureCells, minimumFenceSegments } from '../../actions/effects/fencing'

const CARD_ID = 'E74_AshTrees'
const MAX_FREE_FENCES = 5

registerCardEffect({
  id: CARD_ID,
  onBuy: (_state, player) => {
    if (!player.minorPlayed.includes(CARD_ID)) return
    const counters = initCardState(player, CARD_ID)
    counters['fences'] = Math.min(MAX_FREE_FENCES, Math.max(0, maxFences - player.fences))
  },
})

const isDoableListener: CardListenerRegistration = {
  id: 'E74-ash-trees-isdoable-fence',
  cardIds: [CARD_ID],
  phases: ['isDoable' as ActionHookPhase],
  actions: ['fence'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.minorPlayed.includes(CARD_ID)) return
    const counters = initCardState(context.player, CARD_ID)
    const stored = counters['fences'] ?? 0
    if (stored <= 0) return
    if ((context.player.resources.wood ?? 0) + stored < minimumFenceSegments) return
    if (context.player.fences + minimumFenceSegments > maxFences) return
    if (getTotalPastureCells(context.player) >= maxPastureCells) return
    return { doable: true }
  },
}

const beforeFenceListener: CardListenerRegistration = {
  id: 'E74-ash-trees-before-fence',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['fence'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.minorPlayed.includes(CARD_ID)) return
    const counters = initCardState(context.player, CARD_ID)
    const stored = counters['fences'] ?? 0
    if (stored <= 0) return

    return {
      flow: {
        type: 'xor',
        promptKey: 'ui.interactionAshTrees',
        children: [
          ...Array.from({ length: stored }, (_, index) => {
            const count = index + 1
            return {
              type: 'leaf' as const,
              actionId: 'reserve-fence-bonus',
              sourceCard: CARD_ID,
              params: {
                freeFences: count,
                counterKey: 'fences',
              },
              choiceLabelKey: 'ui.interactionAshTreesUseCount',
              choiceLabelParams: { count },
            }
          }),
          {
            type: 'leaf',
            actionId: 'noop',
            choiceLabelKey: 'ui.interactionAshTreesSkip',
          },
        ],
      },
    }
  },
}

const afterFenceListener: CardListenerRegistration = {
  id: 'E74-ash-trees-after-fence',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['fence'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.minorPlayed.includes(CARD_ID)) return
    clearPendingFenceBonus(context.player)
  },
}

registerCardListener(isDoableListener)
registerCardListener(beforeFenceListener)
registerCardListener(afterFenceListener)

export const E74_AshTrees = new MinorImprovement({
  id: CARD_ID,
  name: "Ash Trees",
  deck: "E",
  number: 74,
  desc: ["When you play this card, immediately place (up to) 5 fences from your supply on it. When you build fences, fences taken from this card cost you nothing."],
  cost: {},
  prerequisite: "2 Planted Fields",
})
