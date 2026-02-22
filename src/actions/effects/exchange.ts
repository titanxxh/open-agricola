import type { ActionExecutionResult, PlayerState, Resource } from '../../game/types'
import { canPayResources, payResources } from './pay'
import { gainResources } from './gain'

const scaleResources = (resources: Partial<Resource>, times: number) => {
  const scaled: Partial<Resource> = {}
  Object.keys(resources).forEach((key) => {
    const resourceKey = key as keyof Resource
    const value = resources[resourceKey] ?? 0
    if (value !== 0) {
      scaled[resourceKey] = value * times
    }
  })
  return scaled
}

export const exchangeResources = (
  player: PlayerState,
  cost: Partial<Resource>,
  gain: Partial<Resource>,
  times = 1,
): ActionExecutionResult => {
  if (times <= 0) {
    return { type: 'ok' }
  }
  const scaledCost = scaleResources(cost, times)
  if (!canPayResources(player, scaledCost)) {
    return { type: 'ok' }
  }
  payResources(player, scaledCost)
  gainResources(player, scaleResources(gain, times))
  return { type: 'ok' }
}
