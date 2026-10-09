import type { ActionFlow, ChoiceDescriptionPreview, GameState, PlayerState } from '../contract/types'
import type { PurchaseOutcomeRule } from '../contract/rule-plans'
import type { CardEffect } from '../cards/card-effects'
import { describeFutureSchedule } from './future-schedule'
import { futureMeeplesNode } from './effects/internal/future-meeples'

const buildOutcome = (state: GameState, player: PlayerState, cardId: string, rule: PurchaseOutcomeRule): Extract<ActionFlow, { type: 'leaf' }> => {
  if (rule.kind === 'gain') return { type: 'leaf', actionId: 'gain', sourceCard: cardId, params: { ...rule.resources } }
  return futureMeeplesNode({ cardId, playerId: player.id, startRound: state.round + rule.offset, count: rule.count, resources: { ...rule.resources } })
}

/** One executable declaration is used by the purchase hook and the payment preview. */
export const paymentPathOnBuy = (cardId: string, paymentPaths: readonly PurchaseOutcomeRule[]): NonNullable<CardEffect['onBuy']> =>
  Object.assign((state: GameState, player: PlayerState, payment?: Parameters<NonNullable<CardEffect['onBuy']>>[2]) => {
    const index = payment?.originalFeeIndex ?? payment?.feeIndex
    const rule = index === undefined ? undefined : paymentPaths[index]
    return rule ? buildOutcome(state, player, cardId, rule) : undefined
  }, { paymentPaths })

export const describePurchaseOutcome = (state: GameState, player: PlayerState, cardId: string, rule: PurchaseOutcomeRule): ChoiceDescriptionPreview | undefined => {
  const flow = buildOutcome(state, player, cardId, rule)
  const effectPreview = flow.actionId === 'gain'
    ? { kind: 'resourceExchange' as const, resourcesGained: { ...rule.resources } }
    : describeFutureSchedule(state.round, flow.params!.__futureMeepleRequest as import('../contract/types').FutureMeepleRequest)
  return effectPreview ? { kind: 'action', labelKey: '', showLabel: false, effectPreview } : undefined
}
