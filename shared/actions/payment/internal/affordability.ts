/**
 * Affordability primitives: payResources, canPayResources, canPayCost,
 * applyCostOverride, isComplexCost. Used by PaymentSolver.canAfford fast-path
 * (simple cost) and by enumerate.ts during ComplexCost enumeration.
 *
 * Internal to shared/actions/payment/. Not exported from the package
 * barrel (shared/actions/payment/index.ts). Use PaymentSolver from
 * the public API instead.
 */

import type {
  ComplexCost,
  GameState,
  PaymentResourceMap,
  PlayerState,
  Resource,
  SupplyTokenKey,
} from '../../../contract/types'
import {
  addConsumedSupplyTokenCount,
  getAvailableStableSupplyCount,
  getOwnOrdinaryFenceReserveCount,
} from '../../../domain/supply-tokens'

const SUPPLY_TOKEN_KEYS = new Set<SupplyTokenKey>(['fence', 'stable'])

export const splitSupplyTokenCost = (cost: PaymentResourceMap) => {
  const resources: Partial<Resource> = {}
  const supplyTokens: Partial<Record<SupplyTokenKey, number>> = {}
  for (const [key, value] of Object.entries(cost)) {
    if (typeof value !== 'number' || value <= 0) continue
    if (SUPPLY_TOKEN_KEYS.has(key as SupplyTokenKey)) {
      supplyTokens[key as SupplyTokenKey] = value
    } else {
      resources[key as keyof Resource] = value
    }
  }
  return { resources, supplyTokens }
}

export const canPaySupplyTokens = (
  state: GameState | undefined,
  player: PlayerState,
  cost: PaymentResourceMap,
): boolean => {
  const { supplyTokens } = splitSupplyTokenCost(cost)
  const fence = supplyTokens.fence ?? 0
  const stable = supplyTokens.stable ?? 0
  if (fence <= 0 && stable <= 0) return true
  if (!state) return false
  return fence <= getOwnOrdinaryFenceReserveCount(player)
    && stable <= getAvailableStableSupplyCount(state, player)
}

export const paySupplyTokens = (
  player: PlayerState,
  cost: PaymentResourceMap,
): void => {
  const { supplyTokens } = splitSupplyTokenCost(cost)
  if (supplyTokens.fence) addConsumedSupplyTokenCount(player, 'fence', supplyTokens.fence)
  if (supplyTokens.stable) addConsumedSupplyTokenCount(player, 'stable', supplyTokens.stable)
}

export const payResources = (
  player: PlayerState,
  cost: PaymentResourceMap,
) => {
  const { resources } = splitSupplyTokenCost(cost)
  Object.keys(resources).forEach((key) => {
    const resourceKey = key as keyof Resource
    const amount = resources[resourceKey] ?? 0
    if (amount > 0) {
      player.resources[resourceKey] -= amount
    }
  })
}

export const applyCostOverride = (
  base: PaymentResourceMap,
  override?: Partial<Resource>,
) => {
  if (!override) return base
  const result: PaymentResourceMap = { ...base }
  Object.entries(override).forEach(([key, value]) => {
    if (typeof value !== 'number') return
    const resourceKey = key as keyof Resource
    const current = result[resourceKey] ?? 0
    result[resourceKey] = Math.max(0, current + value)
  })
  return result
}

export const canPayResources = (
  player: PlayerState,
  cost: PaymentResourceMap,
) =>
  Object.keys(splitSupplyTokenCost(cost).resources).every((key) => {
    const resourceKey = key as keyof Resource
    const amount = cost[resourceKey] ?? 0
    return amount <= 0 || player.resources[resourceKey] >= amount
  })

export const isComplexCost = (
  cost: PaymentResourceMap | ComplexCost | undefined,
): cost is ComplexCost => {
  if (!cost) return false
  return (
    'fee' in cost ||
    'fees' in cost ||
    'trades' in cost ||
    'cards' in cost ||
    'bonuses' in cost ||
    'unitFee' in cost ||
    'nb' in cost
  )
}
