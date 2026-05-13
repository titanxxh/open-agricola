import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { initCardState } from '../__stubs__/helpers'
import { writeCardInfobox } from '../helpers/card-state'
import { getFenceCount, getTotalPastureCells, maxFences, maxPastureCells, minimumFenceSegments } from '../../actions/effects/fencing'
import type { CardImpl } from '../registry'
import { E74_AshTrees } from '../../cards-display/E/E74_AshTrees'

const CARD_ID = E74_AshTrees.id

const MAX_FREE_FENCES = 5

const isDoableListener: CardListenerRegistration = {
  id: 'E74-ash-trees-isdoable-fence',
  cardIds: [CARD_ID],
  phases: ['isDoable' as ActionHookPhase],
  actions: ['fence'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const stored = context.player.cardStates?.[CARD_ID]?.counters?.fences ?? 0
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
    const stored = context.player.cardStates?.[CARD_ID]?.counters?.fences ?? 0
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
    const remaining = context.player.cardStates?.[CARD_ID]?.counters?.fences ?? 0
    return {
      flow: {
        type: 'seq',
        children: [
          {
            type: 'leaf',
            actionId: 'special-effect',
            sourceCard: CARD_ID,
            params: { kind: 'clear-pending-fence-bonus' },
          },
          {
            type: 'leaf',
            actionId: 'special-effect',
            sourceCard: CARD_ID,
            params: { kind: 'set-infobox', text: `${remaining} / ${MAX_FREE_FENCES}` },
          },
        ],
      },
      sourceCard: CARD_ID,
    }
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
