import type { ActionExecutionContext, PlayerState } from '../contract/types'
import type { ActionHookResult } from '../actions/hooks'

export const applyComputeCostResults = (
  executionContext: ActionExecutionContext,
  costResults: readonly ActionHookResult[],
): void => {
  const costOverride = costResults.reduce<Partial<PlayerState['resources']>>(
    (acc, entry) => {
      if (!entry.costs) return acc
      Object.entries(entry.costs).forEach(([key, value]) => {
        if (typeof value !== 'number') return
        const resourceKey = key as keyof PlayerState['resources']
        acc[resourceKey] = (acc[resourceKey] ?? 0) + value
      })
      return acc
    },
    {},
  )
  const costAttribution = costResults.flatMap((entry) => entry.costAttribution ?? [])
  executionContext.costs =
    Object.keys(costOverride).length > 0 ? costOverride : undefined
  executionContext.costAttribution =
    costAttribution.length > 0 ? costAttribution : undefined
}
