import type {
  PlayerState,
  Resource,
  ComplexCost,
  PaymentSolution,
  Trade,
  Bonus,
  ResourceKey,
} from '../../game/types'
import {
  convertResources,
  hasValidResources,
} from './exchange'

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

type InternalSolution = {
  resourcesRemaining: Partial<Resource>
  tradesUsed: { trade: Trade; times: number }[]
  bonusUsed?: string
}

const subtractResources = (
  a: Partial<Resource>,
  b: Partial<Resource>,
): Partial<Resource> => {
  const result: Partial<Resource> = { ...a }
  const keys = Object.keys(b) as ResourceKey[]
  for (const key of keys) {
    result[key] = (result[key] ?? 0) - (b[key] ?? 0)
  }
  return result
}

const dominates = (a: PaymentSolution, b: PaymentSolution): boolean => {
  const aPaid = a.resourcesPaid
  const bPaid = b.resourcesPaid
  const allKeys = new Set([
    ...(Object.keys(aPaid) as ResourceKey[]),
    ...(Object.keys(bPaid) as ResourceKey[]),
  ])

  let hasStrictlyLess = false
  for (const key of allKeys) {
    const aVal = aPaid[key] ?? 0
    const bVal = bPaid[key] ?? 0
    if (aVal > bVal) return false
    if (aVal < bVal) hasStrictlyLess = true
  }
  return hasStrictlyLess
}

export const keepOnlyOptimals = (
  solutions: PaymentSolution[],
): PaymentSolution[] => {
  if (solutions.length <= 1) return solutions

  const optimal: PaymentSolution[] = []
  for (const candidate of solutions) {
    let isDominated = false
    for (const existing of optimal) {
      if (dominates(existing, candidate)) {
        isDominated = true
        break
      }
    }
    if (!isDominated) {
      for (let i = optimal.length - 1; i >= 0; i--) {
        if (dominates(candidate, optimal[i])) {
          optimal.splice(i, 1)
        }
      }
      optimal.push(candidate)
    }
  }
  return optimal
}

const applyBonus = (
  cost: Partial<Resource>,
  bonus: Bonus,
): Partial<Resource> => {
  const result = { ...cost }
  const discountKeys = Object.keys(bonus.discount) as ResourceKey[]
  for (const key of discountKeys) {
    const discountAmount = bonus.discount[key] ?? 0
    result[key] = Math.max(0, (result[key] ?? 0) - discountAmount)
  }
  return result
}

const getMaxTradeTimesFromPartial = (
  trade: Trade,
  resources: Partial<Resource>,
): number => {
  const fromResources = trade.from
  const resourceKeys = Object.keys(fromResources) as ResourceKey[]

  let maxFromResources = Infinity
  for (const key of resourceKeys) {
    const requiredPerTrade = fromResources[key] ?? 0
    if (requiredPerTrade > 0) {
      const available = resources[key] ?? 0
      const timesFromThisResource = Math.floor(available / requiredPerTrade)
      maxFromResources = Math.min(maxFromResources, timesFromThisResource)
    }
  }

  const tradeMax = trade.max ?? Infinity
  return Math.min(maxFromResources, tradeMax)
}

const generateTradeCombinations = (
  trades: Trade[],
  playerResources: Partial<Resource>,
): { tradesUsed: { trade: Trade; times: number }[]; result: Partial<Resource> }[] => {
  if (trades.length === 0) {
    return [{ tradesUsed: [], result: { ...playerResources } }]
  }

  const [firstTrade, ...restTrades] = trades
  const restCombinations = generateTradeCombinations(restTrades, playerResources)
  const maxTimes = getMaxTradeTimesFromPartial(firstTrade, playerResources)

  const results: { tradesUsed: { trade: Trade; times: number }[]; result: Partial<Resource> }[] = []
  
  for (const combo of restCombinations) {
    for (let t = 0; t <= maxTimes; t++) {
      const afterTrade = convertResources(combo.result, firstTrade, t)
      if (hasValidResources(afterTrade)) {
        results.push({
          tradesUsed: [...combo.tradesUsed, { trade: firstTrade, times: t }],
          result: afterTrade,
        })
      }
    }
  }

  return results
}

const canCoverCost = (
  resources: Partial<Resource>,
  cost: Partial<Resource>,
): boolean => {
  const keys = Object.keys(cost) as ResourceKey[]
  return keys.every((key) => (resources[key] ?? 0) >= (cost[key] ?? 0))
}

export const computeAllBuyableCombinations = (
  player: PlayerState,
  cost: ComplexCost,
): PaymentSolution[] => {
  const playerResources: Partial<Resource> = { ...player.resources }
  const rawSolutions: InternalSolution[] = []

  const baseFees: Partial<Resource>[] = cost.fees && cost.fees.length > 0
    ? cost.fees
    : cost.fee
      ? [cost.fee]
      : [{}]

  for (const baseFee of baseFees) {
    const tradeCombos = cost.trades && cost.trades.length > 0
      ? generateTradeCombinations(cost.trades, playerResources)
      : [{ tradesUsed: [], result: { ...playerResources } }]

    for (const tradeCombo of tradeCombos) {
      const bonuses = cost.bonuses ?? [undefined]
      
      for (const bonus of bonuses) {
        let effectiveCost = baseFee
        let bonusId: string | undefined

        if (bonus) {
          effectiveCost = applyBonus(baseFee, bonus)
          bonusId = bonus.sources?.join(',') ?? 'unknown'
        }

        if (canCoverCost(tradeCombo.result, effectiveCost)) {
          const remaining = subtractResources(tradeCombo.result, effectiveCost)
          
          rawSolutions.push({
            resourcesRemaining: remaining,
            tradesUsed: tradeCombo.tradesUsed,
            bonusUsed: bonusId,
          })
        }
      }
    }
  }

  const paymentSolutions: PaymentSolution[] = rawSolutions.map((sol) => ({
    resourcesPaid: subtractResources(playerResources, sol.resourcesRemaining),
    tradesUsed: sol.tradesUsed,
    bonusUsed: sol.bonusUsed,
  }))

  return keepOnlyOptimals(paymentSolutions)
}

export const canPayCost = (
  player: PlayerState,
  cost: ComplexCost | Partial<Resource>,
): boolean => {
  if (!('fee' in cost) && !('fees' in cost) && !('trades' in cost)) {
    return canPayResources(player, cost as Partial<Resource>)
  }

  const complexCost = cost as ComplexCost
  const solutions = computeAllBuyableCombinations(player, complexCost)
  return solutions.length > 0
}

export const executePaymentSolution = (
  player: PlayerState,
  solution: PaymentSolution,
): void => {
  const paidKeys = Object.keys(solution.resourcesPaid) as ResourceKey[]
  for (const key of paidKeys) {
    const amount = solution.resourcesPaid[key] ?? 0
    player.resources[key] -= amount
  }
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
