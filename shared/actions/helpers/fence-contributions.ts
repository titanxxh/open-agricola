import type { ActionCostAttribution, PlayerState } from '../../contract/types'

export type FenceCostDiscount = { sourceCard: string; fenceCount: number }
export type FenceSupplyReservation = { sourceCard: string; counterKey: string; selectedCount: number }
export type FenceSupplyUsage = { sourceCard: string; counterKey: string; usedCount: number }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0

export const readFenceCostDiscounts = (context?: Record<string, unknown>): FenceCostDiscount[] => {
  if (!Array.isArray(context?.fenceCostDiscounts)) return []
  return context.fenceCostDiscounts.filter((entry): entry is FenceCostDiscount =>
    isRecord(entry) && typeof entry.sourceCard === 'string' && isCount(entry.fenceCount))
}

export const readFenceSupplyReservations = (
  player: PlayerState,
  context?: Record<string, unknown>,
): FenceSupplyReservation[] => {
  if (!isRecord(context?.fenceSupplyReservations)) return []
  return Object.entries(context.fenceSupplyReservations).flatMap(([sourceCard, entry]) => {
    if (!isRecord(entry) || typeof entry.counterKey !== 'string' || !isCount(entry.selectedCount)) return []
    const available = Math.max(0, player.cardStates[sourceCard]?.counters?.[entry.counterKey] ?? 0)
    return [{ sourceCard, counterKey: entry.counterKey, selectedCount: Math.min(entry.selectedCount, available) }]
  }).sort((left, right) => left.sourceCard.localeCompare(right.sourceCard))
}

export const selectedFenceSupplyCount = (player: PlayerState, context?: Record<string, unknown>): number =>
  readFenceSupplyReservations(player, context).reduce((sum, entry) => sum + entry.selectedCount, 0)

export const fenceCostDiscountCount = (context?: Record<string, unknown>): number =>
  readFenceCostDiscounts(context).reduce((sum, entry) => sum + entry.fenceCount, 0)

export const settleFenceContributions = (
  player: PlayerState,
  context: Record<string, unknown> | undefined,
  ordinaryFenceCount: number,
  woodPerFence: number,
): { supplyUsage: FenceSupplyUsage[]; costAttribution: ActionCostAttribution[] } => {
  let remaining = ordinaryFenceCount
  const costAttribution: ActionCostAttribution[] = []
  const supplyUsage = readFenceSupplyReservations(player, context).map(entry => {
    const usedCount = Math.min(remaining, entry.selectedCount)
    remaining -= usedCount
    if (usedCount > 0) costAttribution.push({ sourceCard: entry.sourceCard, costs: { wood: -usedCount * woodPerFence } })
    return { sourceCard: entry.sourceCard, counterKey: entry.counterKey, usedCount }
  })
  for (const discount of readFenceCostDiscounts(context)) {
    const used = Math.min(remaining, discount.fenceCount)
    remaining -= used
    if (used > 0) costAttribution.push({ sourceCard: discount.sourceCard, costs: { wood: -used * woodPerFence } })
  }
  return { supplyUsage, costAttribution }
}
