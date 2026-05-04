import type {
  ComplexCost,
  CostModifierType,
  PaymentSolution,
  PlayerState,
  Resource,
  ResourceKey,
  Trade,
} from '../../../game/types'
import {
  convertResources,
  hasValidResources,
} from '../../effects/exchange'
import { isFireplaceIdentityCard } from '../../../cards/helpers/card-type'
import { solutionCache, makeCacheKey } from './cache'
import { isComplexCost, canPayResources } from './affordability'
import {
  applyCostModifiers,
  evaluateConditions,
  getModifiersForCostType,
  validateBonus,
} from './cost-modifiers'
import type { InternalSolution } from './types'

const RESOURCE_ID: Record<string, number> = {
  wood: 1, food: 2, reed: 3, clay: 4, stone: 5,
  sheep: 6, pig: 7, cattle: 8, grain: 9, vegetable: 10
}

const PAYMENT_RESOURCE_ORDER: ResourceKey[] = [
  'wood',
  'clay',
  'reed',
  'stone',
  'food',
  'grain',
  'vegetable',
  'sheep',
  'boar',
  'cattle',
  'begging',
]

const hashSolution = (solution: PaymentSolution): number => {
  let h = 0
  const paid = solution.resourcesPaid
  for (const [res, amount] of Object.entries(paid)) {
    const resId = RESOURCE_ID[res] || 0
    h = ((h + resId * 17 + ((amount ?? 0) * 31)) * 31) >>> 0
  }
  for (const { trade, times } of solution.tradesUsed) {
    h = ((h + (trade.from?.wood ?? 0) * 13 + times * 7) * 31) >>> 0
  }
  if (solution.bonusUsed) {
    h = ((h + solution.bonusUsed.charCodeAt(0) * 17) * 31) >>> 0
  }
  if (solution.bonusChoiceIndex) {
    const entries = Object.entries(solution.bonusChoiceIndex).sort(
      (a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0),
    )
    for (const [k, v] of entries) {
      for (const ch of k) {
        h = ((h + ch.charCodeAt(0) * 23) * 31) >>> 0
      }
      h = ((h + (v + 1) * 41) * 31) >>> 0
    }
  }
  if (solution.cardUsed) {
    for (const ch of solution.cardUsed) {
      h = ((h + ch.charCodeAt(0) * 19) * 31) >>> 0
    }
  }
  return h
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

  const aCard = a.cardUsed ? 1 : 0
  const bCard = b.cardUsed ? 1 : 0
  if (aCard > bCard) return false
  if (aCard < bCard) hasStrictlyLess = true

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

const getPositiveResourceEntries = (solution: PaymentSolution) =>
  PAYMENT_RESOURCE_ORDER
    .map((key) => [key, solution.resourcesPaid[key] ?? 0] as const)
    .filter(([, amount]) => amount > 0)

const comparePositiveResourceEntries = (
  left: ReturnType<typeof getPositiveResourceEntries>,
  right: ReturnType<typeof getPositiveResourceEntries>,
) => {
  const maxLength = Math.max(left.length, right.length)
  for (let index = 0; index < maxLength; index += 1) {
    const a = left[index]
    const b = right[index]
    if (!a && !b) return 0
    if (!a) return -1
    if (!b) return 1
    const keyCompare = PAYMENT_RESOURCE_ORDER.indexOf(a[0]) - PAYMENT_RESOURCE_ORDER.indexOf(b[0])
    if (keyCompare !== 0) return keyCompare
    if (a[1] !== b[1]) return a[1] - b[1]
  }
  return 0
}

export const sortPaymentSolutions = (
  solutions: PaymentSolution[],
): PaymentSolution[] => {
  return [...solutions].sort((left, right) => {
    const leftEntries = getPositiveResourceEntries(left)
    const rightEntries = getPositiveResourceEntries(right)

    const leftTotal = leftEntries.reduce((sum, [, amount]) => sum + amount, 0)
    const rightTotal = rightEntries.reduce((sum, [, amount]) => sum + amount, 0)
    if (leftTotal !== rightTotal) return leftTotal - rightTotal

    if (leftEntries.length !== rightEntries.length) {
      return leftEntries.length - rightEntries.length
    }

    const leftTradeTimes = left.tradesUsed.reduce((sum, entry) => sum + entry.times, 0)
    const rightTradeTimes = right.tradesUsed.reduce((sum, entry) => sum + entry.times, 0)
    if (leftTradeTimes !== rightTradeTimes) return leftTradeTimes - rightTradeTimes

    const leftTradeKinds = left.tradesUsed.filter((entry) => entry.times > 0).length
    const rightTradeKinds = right.tradesUsed.filter((entry) => entry.times > 0).length
    if (leftTradeKinds !== rightTradeKinds) return leftTradeKinds - rightTradeKinds

    const entryCompare = comparePositiveResourceEntries(leftEntries, rightEntries)
    if (entryCompare !== 0) return entryCompare

    const leftBonus = left.bonusUsed ?? ''
    const rightBonus = right.bonusUsed ?? ''
    if (leftBonus !== rightBonus) return leftBonus.localeCompare(rightBonus)

    const leftCard = left.cardUsed ?? ''
    const rightCard = right.cardUsed ?? ''
    if (leftCard !== rightCard) return leftCard.localeCompare(rightCard)

    const leftFeeIndex = left.feeIndex ?? -1
    const rightFeeIndex = right.feeIndex ?? -1
    if (leftFeeIndex !== rightFeeIndex) return leftFeeIndex - rightFeeIndex

    return JSON.stringify(left.tradesUsed).localeCompare(JSON.stringify(right.tradesUsed))
  })
}

const applyBonus = (
  cost: Partial<Resource>,
  discount: Partial<Resource>,
): Partial<Resource> => {
  const result = { ...cost }
  const discountKeys = Object.keys(discount) as ResourceKey[]
  for (const key of discountKeys) {
    const discountAmount = discount[key] ?? 0
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

export const generateTradeCombinations = (
  trades: Trade[],
  playerResources: Partial<Resource>,
): { tradesUsed: { trade: Trade; times: number }[]; result: Partial<Resource> }[] => {
  if (trades.length === 0) {
    return [{ tradesUsed: [], result: { ...playerResources } }]
  }

  const [firstTrade, ...restTrades] = trades
  const restCombinations = generateTradeCombinations(restTrades, playerResources)
  const results: { tradesUsed: { trade: Trade; times: number }[]; result: Partial<Resource> }[] = []

  for (const combo of restCombinations) {
    const maxTimes = getMaxTradeTimesFromPartial(firstTrade, combo.result)
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

const cardMatchesCostList = (
  cardId: string,
  costList: readonly string[],
): boolean => {
  if (costList.includes(cardId)) return true
  if (costList.some(isFireplaceIdentityCard) && isFireplaceIdentityCard(cardId)) {
    return true
  }
  return false
}

export const computeAllBuyableCombinations = (
  player: PlayerState,
  cost: ComplexCost,
  playedCards?: string[],
  costType?: CostModifierType,
): PaymentSolution[] => {
  const effectiveCost = costType
    ? applyCostModifiers(cost, getModifiersForCostType(player, costType))
    : cost

  const cacheKey = makeCacheKey(player, effectiveCost, costType, playedCards)
  const cached = solutionCache.get(cacheKey)
  if (cached) return cached

  const playerResources: Partial<Resource> = { ...player.resources }
  const rawSolutions: InternalSolution[] = []

  const baseFees: Partial<Resource>[] = effectiveCost.fees && effectiveCost.fees.length > 0
    ? effectiveCost.fees
    : effectiveCost.fee
      ? [effectiveCost.fee]
      : [{}]

  for (const bonus of effectiveCost.bonuses ?? []) {
    validateBonus(bonus)
  }

  for (let feeIdx = 0; feeIdx < baseFees.length; feeIdx++) {
    const baseFee = baseFees[feeIdx]
    const tradeCombos = effectiveCost.trades && effectiveCost.trades.length > 0
      ? generateTradeCombinations(effectiveCost.trades, playerResources)
      : [{ tradesUsed: [], result: { ...playerResources } }]

    for (const tradeCombo of tradeCombos) {
      type BonusPath = {
        cost: Partial<Resource>
        sources: string[]
        choiceIndices: Record<string, number>
      }
      let bonusPaths: BonusPath[] = [
        { cost: baseFee, sources: [], choiceIndices: {} },
      ]

      for (const bonus of effectiveCost.bonuses ?? []) {
        if (!evaluateConditions(player, bonus.conditions)) {
          continue
        }

        const expanded: BonusPath[] = []
        if (bonus.optional) {
          for (const path of bonusPaths) {
            expanded.push({
              cost: path.cost,
              sources: [...path.sources],
              choiceIndices: { ...path.choiceIndices },
            })
          }
        }
        const rawCandidates: {
          discount: Partial<Resource>
          sources?: string[]
          conditions?: Record<string, number>
          _origIndex: number
        }[] = bonus.choices
          ? bonus.choices.map((c, i) => ({ ...c, _origIndex: i }))
          : [
              {
                discount: bonus.discount!,
                sources: bonus.sources,
                _origIndex: 0,
              },
            ]
        const candidates = rawCandidates.filter((c) =>
          evaluateConditions(player, c.conditions),
        )
        if (candidates.length === 0) {
          continue
        }
        const isMultiChoice = (bonus.choices?.length ?? 0) > 0
        const bonusKey = bonus.sources?.[0]
        for (const path of bonusPaths) {
          for (const candidate of candidates) {
            const nextCost = applyBonus(path.cost, candidate.discount)
            const combined = new Set([
              ...path.sources,
              ...(bonus.sources ?? []),
              ...(candidate.sources ?? []),
            ])
            const nextSources = [...combined]
            const nextChoiceIndices =
              isMultiChoice && bonusKey
                ? { ...path.choiceIndices, [bonusKey]: candidate._origIndex }
                : { ...path.choiceIndices }
            expanded.push({
              cost: nextCost,
              sources: nextSources,
              choiceIndices: nextChoiceIndices,
            })
          }
        }
        bonusPaths = expanded
      }

      for (const { cost: effectiveCostFee, sources, choiceIndices } of bonusPaths) {
        if (canCoverCost(tradeCombo.result, effectiveCostFee)) {
          const remaining = subtractResources(tradeCombo.result, effectiveCostFee)
          rawSolutions.push({
            resourcesRemaining: remaining,
            tradesUsed: tradeCombo.tradesUsed,
            bonusUsed: sources.length > 0 ? sources.join(',') : undefined,
            bonusChoiceIndex:
              Object.keys(choiceIndices).length > 0 ? choiceIndices : undefined,
            feeIndex: baseFees.length > 1 ? feeIdx : undefined,
          })
        }
      }
    }
  }

  const paymentSolutions: PaymentSolution[] = []
  const seenHashes = new Set<number>()

  for (const sol of rawSolutions) {
    const resourcesPaid = subtractResources(playerResources, sol.resourcesRemaining)
    const tradesActuallyUsed = sol.tradesUsed.filter((entry) => entry.times > 0)
    const exemptFromNegativeFilter =
      tradesActuallyUsed.length === 1 && tradesActuallyUsed[0]!.times === 1
    if (
      costType
      && !exemptFromNegativeFilter
      && Object.values(resourcesPaid).some((value) => (value ?? 0) < 0)
    ) {
      continue
    }
    const solution: PaymentSolution = {
      resourcesPaid,
      tradesUsed: sol.tradesUsed,
      bonusUsed: sol.bonusUsed,
      bonusChoiceIndex: sol.bonusChoiceIndex,
      feeIndex: sol.feeIndex,
    }

    const hash = hashSolution(solution)
    if (!seenHashes.has(hash)) {
      seenHashes.add(hash)
      paymentSolutions.push(solution)
    }
  }

  if (cost.cards?.list && cost.cards.list.length > 0) {
    const eligibleCards = playedCards
      ? playedCards.filter((cardId) => cardMatchesCostList(cardId, cost.cards!.list))
      : []

    if (cost.cards.required) {
      const requiredCardSolutions: PaymentSolution[] = []
      if (eligibleCards.length > 0) {
        paymentSolutions.forEach((solution) => {
          eligibleCards.forEach((cardId) => {
            requiredCardSolutions.push({
              ...solution,
              cardUsed: cardId,
            })
          })
        })
      }
      paymentSolutions.length = 0
      paymentSolutions.push(...requiredCardSolutions)
    } else {
      eligibleCards.forEach((cardId) => {
        const cardSolution: PaymentSolution = {
          resourcesPaid: cost.cards?.cost ?? {},
          tradesUsed: [],
          cardUsed: cardId,
        }
        paymentSolutions.push(cardSolution)
      })
    }
  }

  const result = sortPaymentSolutions(keepOnlyOptimals(paymentSolutions))
  solutionCache.set(cacheKey, result)
  return result
}

export const canPayCost = (
  player: PlayerState,
  cost: ComplexCost | Partial<Resource>,
  costType?: CostModifierType,
): boolean => {
  if (!isComplexCost(cost)) {
    return canPayResources(player, cost as Partial<Resource>)
  }

  const complexCost = cost as ComplexCost
  const solutions = computeAllBuyableCombinations(player, complexCost, undefined, costType)
  return solutions.length > 0
}
