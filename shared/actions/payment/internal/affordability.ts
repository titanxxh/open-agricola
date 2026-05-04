import type { ComplexCost, PlayerState, Resource } from '../../../game/types'

export const payResources = (
  player: PlayerState,
  cost: Partial<PlayerState['resources']>,
) => {
  Object.keys(cost).forEach((key) => {
    const resourceKey = key as keyof Resource
    const amount = cost[resourceKey] ?? 0
    if (amount > 0) {
      player.resources[resourceKey] -= amount
    }
  })
}

export const applyCostOverride = (
  base: Partial<PlayerState['resources']>,
  override?: Partial<PlayerState['resources']>,
) => {
  if (!override) return base
  const result: Partial<PlayerState['resources']> = { ...base }
  Object.entries(override).forEach(([key, value]) => {
    if (typeof value !== 'number') return
    const resourceKey = key as keyof PlayerState['resources']
    const current = result[resourceKey] ?? 0
    result[resourceKey] = Math.max(0, current + value)
  })
  return result
}

export const canPayResources = (
  player: PlayerState,
  cost: Partial<Resource>,
) =>
  Object.keys(cost).every((key) => {
    const resourceKey = key as keyof Resource
    const amount = cost[resourceKey] ?? 0
    return amount <= 0 || player.resources[resourceKey] >= amount
  })

export const isComplexCost = (
  cost: Partial<Resource> | ComplexCost | undefined,
): cost is ComplexCost => {
  if (!cost) return false
  return (
    'fee' in cost ||
    'fees' in cost ||
    'trades' in cost ||
    'cards' in cost ||
    'bonuses' in cost
  )
}
