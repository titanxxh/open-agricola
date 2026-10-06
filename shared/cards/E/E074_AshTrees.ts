import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { initCardState } from '../__stubs__/helpers'
import { writeCardInfobox } from '../helpers/card-state'
import { getTotalPastureCells, maxPastureCells, minimumFenceSegments } from '../../actions/effects/fencing'
import { getOwnOrdinaryFenceCount } from '../../domain/fence-segments'
import {
  getOwnOrdinaryFenceBuildLimit,
  getOwnOrdinaryFenceReserveCount,
} from '../../domain/supply-tokens'
import type { CardImpl } from '../registry'

const CARD_ID = 'E074_AshTrees'
const MAX_FREE_FENCES = 5

const isDoableListener: CardListenerRegistration = {
  id: 'E74-ash-trees-isdoable-fence',
  cardIds: [CARD_ID],
  phases: ['isDoable' as ActionHookPhase],
  actions: ['fence'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.doable) return
    if (context.actionContext?.skipBeforeTriggers === true) return
    const stored = context.player.cardStates?.[CARD_ID]?.counters?.fences ?? 0
    if (stored <= 0) return
    if ((context.player.resources.wood ?? 0) + stored < minimumFenceSegments) return
    const remainingBuildCapacity =
      getOwnOrdinaryFenceBuildLimit(context.player) -
      getOwnOrdinaryFenceCount(context.player)
    if (remainingBuildCapacity < minimumFenceSegments) return
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

const cardImpl = {
  listeners: [isDoableListener, beforeFenceListener, afterFenceListener],
  effect: {
  id: CARD_ID,
  getRuleContributions: (player) => ({ reservedSupply: { fence: player.cardStates?.[CARD_ID]?.counters?.fences ?? 0 } }),
  onBuy: (_state, player) => {
    const initial = Math.min(MAX_FREE_FENCES, getOwnOrdinaryFenceReserveCount(player))
    const counters = initCardState(player, CARD_ID)
    counters['fences'] = initial
    writeCardInfobox(player, CARD_ID, `${initial} / ${MAX_FREE_FENCES}`)
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E074_AshTrees = defineMinorCard({
  presentation: { counters: ['fences'] },
  meta: {
    id: CARD_ID,
    name: "Ash Trees",
    deck: "E",
    number: 74,
    desc: ["When you play this card, immediately place (up to) 5 <FENCE> from your supply on it. When you build <FENCE>, <FENCE> taken from this card cost you nothing."],
    cost: {},
    prerequisite: "2 Planted Fields",
    category: 'BUILDING_RESOURCES_-_WOOD',
  },
  impl: cardImpl,
})

export const E074_AshTrees_impl = E074_AshTrees.impl
