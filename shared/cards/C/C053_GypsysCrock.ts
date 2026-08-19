import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import {
  readCardExtraData,
} from '../helpers/card-state'
import { gainLeaf } from '../helpers/pay-gain-node'
import { getMajorCard } from '../major'
import type { CardImpl } from '../registry'
import { getRegisteredMinorImprovement } from '../registry-display'

const CARD_ID = 'C053_GypsysCrock'
const COUNTER_KEY = 'cookedCount'

/**
 * The reference `checkPairIsCooked`: only `Exchange.isCookingSource($source)` exchanges
 * (Fireplace1/2, Cooking Hearth 1/2, Oriental Fireplace, Earth Oven) where
 * the `to` side includes FOOD count toward "cooked goods this batch". Pairs
 * (≥2) trigger `floor(count / 2)` bonus food.
 *
 * We listen on the `trade-applied` synthetic event instead of diffing
 * before/after exchange totals, so non-cooking exchanges (e.g. anytime stone
 * → veg sales, B27 Toolbox) no longer count.
 */
const isCookingSource = (sourceId: string | null | undefined): boolean => {
  if (!sourceId) return false
  const major = getMajorCard(sourceId)
  if (major?.isCookery) return true
  const minor = getRegisteredMinorImprovement(sourceId)
  return !!minor?.isCookery
}

const tradeAppliedListener: CardListenerRegistration = {
  id: 'C53-gypsys-crock-trade-applied',
  cardIds: [CARD_ID],
  phases: ['immediatelyAfter' as ActionHookPhase],
  actions: ['trade-applied'],
  handler: (context): ActionHookResult | void => {
    const extra = (context.extraData ?? {}) as { sourceId?: string; times?: number }
    if (!isCookingSource(extra.sourceId)) return
    const times = typeof extra.times === 'number' ? extra.times : 0
    if (times <= 0) return
    const prior = readCardExtraData<number>(context.player, CARD_ID, COUNTER_KEY) ?? 0
    return {
      flow: {
        type: 'leaf',
        actionId: 'special-effect',
        sourceCard: CARD_ID,
        params: { kind: 'set-extra-data', key: COUNTER_KEY, value: prior + times },
      },
      sourceCard: CARD_ID,
    }
  },
}

/**
 * After the exchange action finishes, flush the accumulated counter into
 * `floor(count / 2)` bonus food. Single batch = single exchange invocation,
 * so we drain at the after-exchange phase and reset.
 */
const afterExchangeListener: CardListenerRegistration = {
  id: 'C53-gypsys-crock-after-exchange',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['exchange'],
  handler: (context): ActionHookResult | void => {
    const cooked = readCardExtraData<number>(context.player, CARD_ID, COUNTER_KEY) ?? 0
    if (cooked <= 0) return
    const bonus = Math.floor(cooked / 2)
    const reset = {
      type: 'leaf' as const,
      actionId: 'special-effect',
      sourceCard: CARD_ID,
      params: { kind: 'set-extra-data', key: COUNTER_KEY, value: 0 },
    }
    if (bonus <= 0) return { flow: reset, sourceCard: CARD_ID }
    return {
      flow: {
        type: 'seq',
        children: [reset, gainLeaf(CARD_ID, { food: bonus })],
      },
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [tradeAppliedListener, afterExchangeListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C053_GypsysCrock = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Gypsy's Crock",
    deck: 'C',
    number: 53,
    category: 'FOOD_PROVIDER',
    desc: ["Each time you use a cooking improvement to turn 2 goods into <FOOD> at the same time, you get 1 additional <FOOD>."],
    cost: { clay: 2 },
    vp: 1,
  },
  impl: cardImpl,
})

export const C053_GypsysCrock_impl = C053_GypsysCrock.impl
