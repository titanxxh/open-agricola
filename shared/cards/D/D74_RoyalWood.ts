import { MinorImprovement } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { readCardExtraData, writeCardExtraData } from '../helpers/card-state'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'D74_RoyalWood'

/**
 * Track wood spent during construct, stables, and pay actions. The latter
 * covers improvement-any payments now that PR-2 routes those through the
 * `seq:[pay, apply-improvement]` flow — listening on `improvement-any`'s
 * `before/after` phase would still fire, but the `after` phase resolves
 * before the pay leaf has actually drained resources, leaving spent=0.
 *
 * Sticking with `before/after` for `construct` and `stables` because those
 * actions still mutate resources inline within their own execute() (they
 * don't go through the pay leaf). For pay we just diff `resourcesPaid` from
 * the result so we don't need a paired before-snapshot.
 */
const TRACKED_PAIRED_ACTIONS = ['construct', 'stables']

const beforeListener: CardListenerRegistration = {
  id: 'D74-royal-wood-before',
  cardIds: [CARD_ID],
  actions: TRACKED_PAIRED_ACTIONS,
  phases: ['before' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    writeCardExtraData(context.player, CARD_ID, 'woodBefore', context.player.resources.wood)
  },
}

const afterListener: CardListenerRegistration = {
  id: 'D74-royal-wood-after',
  cardIds: [CARD_ID],
  actions: TRACKED_PAIRED_ACTIONS,
  phases: ['after' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const before = readCardExtraData<number>(context.player, CARD_ID, 'woodBefore') ?? context.player.resources.wood
    const spent = Math.max(0, before - context.player.resources.wood)
    if (spent <= 0) return
    const total = (readCardExtraData<number>(context.player, CARD_ID, 'woodSpent') ?? 0) + spent
    writeCardExtraData(context.player, CARD_ID, 'woodSpent', total)
  },
}

const afterPayListener: CardListenerRegistration = {
  id: 'D74-royal-wood-after-pay',
  cardIds: [CARD_ID],
  actions: ['pay'],
  phases: ['after' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    // Only count payments that originate from an improvement build. PR-2
    // tags those payments via `actionContext.costType` ∈ {'major-improvement',
    // 'minor-improvement'}; everything else (occupation, lessons-2, …) is
    // out of scope for the Royal Wood refund. The engine spreads
    // actionContext keys directly into the listener context (see
    // engine.buildListenerEvent), so we read costType off the top level.
    const costType =
      (context as { costType?: string }).costType
      ?? context.actionContext?.costType
    if (costType !== 'major-improvement' && costType !== 'minor-improvement') return
    const result = context.result
    if (!result || result.type !== 'ok') return
    const wood = (result.resourcesPaid as { wood?: number } | undefined)?.wood
    if (!wood || wood <= 0) return
    const total = (readCardExtraData<number>(context.player, CARD_ID, 'woodSpent') ?? 0) + wood
    writeCardExtraData(context.player, CARD_ID, 'woodSpent', total)
  },
}

export const D74_RoyalWood = new MinorImprovement({
  id: CARD_ID,
  name: 'Royal Wood',
  deck: 'D',
  number: 74,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: [
    'At the end of each turn in which you use the __Farm Expansion__ action space or build an improvement, you get 1 <WOOD> back for every 2 <WOOD> paid during those actions (rounded down).',
  ],
  cost: { food: 1 },
})

export const D74_RoyalWood_impl = {
  listeners: [beforeListener, afterListener, afterPayListener],
  effect: {
  id: CARD_ID,
  onBuy: (_state, player) => {
    writeCardExtraData(player, CARD_ID, 'woodSpent', 0)
    writeCardExtraData(player, CARD_ID, 'woodBefore', 0)
  },
  onEndTurn: (_state, player) => {
    const totalSpent = readCardExtraData<number>(player, CARD_ID, 'woodSpent') ?? 0
    const refund = Math.floor(totalSpent / 2)
    writeCardExtraData(player, CARD_ID, 'woodSpent', 0)
    writeCardExtraData(player, CARD_ID, 'woodBefore', 0)
    if (refund <= 0) return
    return gainLeaf(CARD_ID, { wood: refund })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
