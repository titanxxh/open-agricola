import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { initCardState } from '../__stubs__/helpers'
import { writeCardInfobox } from '../helpers/card-state'
import {
  clearPendingFenceBonus,
} from '../helpers/pending-fence-bonus'
import { getFenceCount, getTotalPastureCells, maxFences, maxPastureCells, minimumFenceSegments } from '../../actions/effects/fencing'
import type { CardImpl } from '../registry'
import { E74_AshTrees } from '../../cards-display/E/E74_AshTrees'
export { E74_AshTrees }

const CARD_ID = E74_AshTrees.id

const MAX_FREE_FENCES = 5

const isDoableListener: CardListenerRegistration = {
  id: 'E74-ash-trees-isdoable-fence',
  cardIds: [CARD_ID],
  phases: ['isDoable' as ActionHookPhase],
  actions: ['fence'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const counters = initCardState(context.player, CARD_ID)
    const stored = counters['fences'] ?? 0
    if (stored <= 0) return
    if ((context.player.resources.wood ?? 0) + stored < minimumFenceSegments) return
    if (getFenceCount(context.player) + minimumFenceSegments > maxFences) return
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
    const counters = initCardState(context.player, CARD_ID)
    const stored = counters['fences'] ?? 0
    if (stored <= 0) return

    return {
      sourceCard: CARD_ID,
      flow: {
        type: 'xor',
        optional: true,
        promptKey: 'ui.interactionAshTrees',
        children: Array.from({ length: stored }, (_, index) => {
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
    clearPendingFenceBonus(context.player)
    const counters = initCardState(context.player, CARD_ID)
    const remaining = counters['fences'] ?? 0
    writeCardInfobox(context.player, CARD_ID, `${remaining} / ${MAX_FREE_FENCES}`)
  },
}

export const E74_AshTrees_impl = {
  listeners: [isDoableListener, beforeFenceListener, afterFenceListener],
  effect: {
  id: CARD_ID,
  onBuy: (_state, player) => {
    const counters = initCardState(player, CARD_ID)
    const initial = Math.min(MAX_FREE_FENCES, Math.max(0, maxFences - getFenceCount(player)))
    counters['fences'] = initial
    writeCardInfobox(player, CARD_ID, `${initial} / ${MAX_FREE_FENCES}`)
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
