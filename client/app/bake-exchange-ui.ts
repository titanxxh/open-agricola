import type { ActionChoiceOption } from '../../shared/contract/types'

export type BakeExchangeInfo = { food: number; max: number }

export const buildBakeExchangeInfo = (options: readonly ActionChoiceOption[]): Record<string, BakeExchangeInfo> =>
  Object.fromEntries(options.flatMap((option) => {
    const effect = option.effectPreview
    if (effect?.kind !== 'resourceExchange' || !option.quantityLimit) return []
    const grain = effect.resourcesPaid?.grain ?? 0
    const food = effect.resourcesGained?.food ?? 0
    return grain > 0 && food > 0 ? [[option.value, { food: food / grain, max: option.quantityLimit }]] : []
  }))

export const hasSelectedBakeGrain = (counts: Record<string, number>) =>
  Object.values(counts).some((count) => count > 0)

export const buildBakeBulkChoice = (counts: Record<string, number>) => {
  const entries = Object.entries(counts)
    .filter(([, count]) => count > 0)
    .map(([id, count]) => `${id}=${count}`)

  return entries.length > 0 ? `bulk:${entries.join(',')}` : null
}
