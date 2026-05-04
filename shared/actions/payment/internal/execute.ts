/**
 * Side-effecting execution path: executePaymentSolution, applyTradeSideEffect,
 * getCheapestSolution, buildBonusReductions. Mutates the player state to apply
 * a chosen PaymentSolution (deduct resources, fire trade side effects, record
 * bonus attribution).
 *
 * Internal to shared/actions/payment/. Not exported from the package
 * barrel (shared/actions/payment/index.ts). Use PaymentSolver from
 * the public API instead.
 */

import type {
  BonusModifier,
  CostModifierType,
  GameState,
  PaymentSolution,
  PlayerState,
  Resource,
  ResourceKey,
  TradeSideEffect,
} from '../../../game/types'
import { recordPaymentStats } from '../../../cards/helpers/payment-stats'

const buildBonusReductions = (
  player: PlayerState,
  solution: PaymentSolution,
  costType?: CostModifierType,
): Record<string, Partial<Resource>> => {
  const result: Record<string, Partial<Resource>> = {}
  const csv = solution.bonusUsed
  if (!csv) return result
  const sourceIds = new Set<string>()
  for (const raw of csv.split(',')) {
    const id = raw.trim()
    if (id) sourceIds.add(id)
  }
  if (sourceIds.size === 0) return result
  for (const mod of player.activeModifiers ?? []) {
    if (mod.type !== 'bonus') continue
    const bonusMod = mod as BonusModifier
    if (!sourceIds.has(bonusMod.cardId)) continue
    if (costType && !bonusMod.appliesTo.includes(costType)) continue
    const discount = bonusMod.discount
    if (!discount) continue
    const accum = result[bonusMod.cardId] ?? {}
    for (const [key, value] of Object.entries(discount)) {
      if (typeof value !== 'number' || value <= 0) continue
      const k = key as keyof Resource
      accum[k] = (accum[k] ?? 0) + value
    }
    if (Object.keys(accum).length > 0) {
      result[bonusMod.cardId] = accum
    }
  }
  return result
}

export const applyTradeSideEffect = (
  state: GameState,
  player: PlayerState,
  eff: TradeSideEffect,
  times: number,
  sourceCard: string,
): void => {
  if (times <= 0) return
  switch (eff.type) {
    case 'drainSpace': {
      const space = state.actionSpaces.find((s) => s.id === eff.spaceId)
      if (!space?.resources) return
      const cur = space.resources[eff.resource] ?? 0
      space.resources[eff.resource] = Math.max(0, cur - times)
      return
    }
    case 'bonusVp': {
      player.cardStates ??= {}
      player.cardStates[sourceCard] ??= { extraData: {} } as PlayerState['cardStates'][string]
      const cs = player.cardStates[sourceCard]
      cs.extraData ??= {}
      const cur = (cs.extraData.bonusVpEarned as number | undefined) ?? 0
      cs.extraData.bonusVpEarned = cur + eff.amount * times
      return
    }
    case 'pushExtraDataValue': {
      player.cardStates ??= {}
      player.cardStates[eff.sourceCard] ??= { extraData: {} } as PlayerState['cardStates'][string]
      const cs = player.cardStates[eff.sourceCard]
      cs.extraData ??= {}
      const existing = cs.extraData[eff.key]
      const arr = Array.isArray(existing) ? (existing as string[]) : []
      if (!arr.includes(eff.value)) arr.push(eff.value)
      cs.extraData[eff.key] = arr
      return
    }
  }
}

export const executePaymentSolution = (
  player: PlayerState,
  solution: PaymentSolution,
  options: { trackStats?: boolean; costType?: CostModifierType; state?: GameState } = {},
): string | undefined => {
  const paidKeys = Object.keys(solution.resourcesPaid) as ResourceKey[]
  for (const key of paidKeys) {
    const amount = solution.resourcesPaid[key] ?? 0
    player.resources[key] -= amount
  }
  if (options.state) {
    for (const { trade, times } of solution.tradesUsed) {
      if (trade.sideEffect && times > 0) {
        applyTradeSideEffect(
          options.state,
          player,
          trade.sideEffect,
          times,
          trade.sourceId ?? trade.source ?? 'unknown',
        )
      }
    }
  }
  if (solution.bonusUsed && player._activeActionBonusSources) {
    const seen = new Set(player._activeActionBonusSources)
    for (const source of solution.bonusUsed.split(',')) {
      const trimmed = source.trim()
      if (trimmed && !seen.has(trimmed)) {
        player._activeActionBonusSources.push(trimmed)
        seen.add(trimmed)
      }
    }
  }
  if (options.trackStats !== false) {
    const bonusReductions = buildBonusReductions(player, solution, options.costType)
    recordPaymentStats(player, solution, bonusReductions)
  }
  return solution.cardUsed
}

export const getCheapestSolution = (
  solutions: PaymentSolution[],
): PaymentSolution | undefined => {
  if (solutions.length === 0) return undefined

  return solutions.reduce((cheapest, current) => {
    const cheapestTotal = Object.values(cheapest.resourcesPaid)
      .reduce((sum, val) => sum + (val ?? 0), 0)
    const currentTotal = Object.values(current.resourcesPaid)
      .reduce((sum, val) => sum + (val ?? 0), 0)
    return currentTotal < cheapestTotal ? current : cheapest
  })
}
