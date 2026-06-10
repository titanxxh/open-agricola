/**
 * Combinatorial core: computeAllBuyableCombinations, keepOnlyOptimals,
 * sortPaymentSolutions, generateTradeCombinations. Builds the full set of
 * payment decompositions for a ComplexCost given the player's resources,
 * trade options, bonuses, and played cards.
 *
 * Future split candidate: split the enumeration core from the
 * post-processing (Pareto filter + sort) if it grows further.
 *
 * Internal to shared/actions/payment/. Not exported from the package
 * barrel (shared/actions/payment/index.ts). Use PaymentSolver from
 * the public API instead.
 */

import type {
  ComplexCost,
  CostModifierType,
  GameState,
  PaymentResourceKey,
  PaymentResourceMap,
  PaymentSolution,
  PlayerState,
  Resource,
  ResourceKey,
  Trade,
} from '../../../contract/types'
import {
  convertResources,
  hasValidResources,
} from '../../effects/exchange-resources'
import { isFireplaceIdentityCard } from '../../../cards/helpers/card-type'
import { solutionCache, makeCacheKey } from './cache'
import {
  canPayResources,
  canPaySupplyTokens,
  isComplexCost,
  splitSupplyTokenCost,
} from './affordability'
import {
  applyCostModifiers,
  evaluateConditions,
  getModifiersForCostType,
  validateBonus,
  validateComplexCost,
} from './cost-modifiers'
import { closeCandidates, type CandidateTransform } from './candidate-closure'
import type { InternalSolution } from './types'

const scaleResources = (r: PaymentResourceMap, n: number): PaymentResourceMap => {
  const out: PaymentResourceMap = {}
  for (const [k, v] of Object.entries(r)) {
    if (typeof v === 'number') out[k as PaymentResourceKey] = v * n
  }
  return out
}

const mergePaymentResources = (
  a: PaymentResourceMap,
  b: PaymentResourceMap,
): PaymentResourceMap => {
  const out: PaymentResourceMap = { ...a }
  for (const [key, value] of Object.entries(b)) {
    const paymentKey = key as PaymentResourceKey
    out[paymentKey] = (out[paymentKey] ?? 0) + (value ?? 0)
  }
  return out
}

const RESOURCE_ID: Record<string, number> = {
  wood: 1, food: 2, reed: 3, clay: 4, stone: 5,
  sheep: 6, pig: 7, cattle: 8, grain: 9, vegetable: 10,
  begging: 11, fence: 12, stable: 13,
}

const PAYMENT_RESOURCE_ORDER: PaymentResourceKey[] = [
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
  'fence',
  'stable',
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
  if (solution.feeIndex !== undefined) {
    h = ((h + (solution.feeIndex + 1) * 43) * 31) >>> 0
  }
  return h
}

const subtractResources = (
  a: PaymentResourceMap,
  b: PaymentResourceMap,
): PaymentResourceMap => {
  const result: PaymentResourceMap = { ...a }
  const keys = Object.keys(b) as PaymentResourceKey[]
  for (const key of keys) {
    result[key] = (result[key] ?? 0) - (b[key] ?? 0)
  }
  return result
}

export const keepOnlyOptimals = (
  solutions: PaymentSolution[],
): PaymentSolution[] => solutions

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
  cost: PaymentResourceMap,
  discount: Partial<Resource>,
  capDiscountAtCost = false,
): PaymentResourceMap => {
  const result: PaymentResourceMap = { ...cost }
  const discountKeys = Object.keys(discount) as ResourceKey[]
  for (const key of discountKeys) {
    const discountAmount = discount[key] ?? 0
    if (discountAmount === 0) continue
    const currentAmount = result[key] ?? 0
    const nextAmount = capDiscountAtCost && discountAmount > 0
      ? Math.max(0, currentAmount - discountAmount)
      : currentAmount - discountAmount
    if (nextAmount === 0) {
      delete result[key]
    } else {
      result[key] = nextAmount
    }
  }
  return result
}

const canApplyBonus = (
  cost: PaymentResourceMap,
  discount: Partial<Resource>,
  capDiscountAtCost = false,
): boolean => {
  const discountKeys = Object.keys(discount) as ResourceKey[]
  for (const key of discountKeys) {
    const discountAmount = discount[key] ?? 0
    if (discountAmount <= 0) continue
    const currentAmount = cost[key] ?? 0
    if (capDiscountAtCost) {
      if (currentAmount <= 0) return false
      continue
    }
    if (currentAmount - discountAmount < 0) return false
  }
  return true
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

type TradeCombo = {
  tradesUsed: { trade: Trade; times: number }[]
  result: Partial<Resource>
}

type UnitCostOption = {
  cost: PaymentResourceMap
  tradesUsed: { trade: Trade; times: number }[]
}

const normalizePositiveResources = (resources: PaymentResourceMap): PaymentResourceMap => {
  const out: PaymentResourceMap = {}
  for (const [key, value] of Object.entries(resources)) {
    if (typeof value === 'number' && value > 0) {
      out[key as PaymentResourceKey] = value
    }
  }
  return out
}

const resourceSignature = (resources: PaymentResourceMap) =>
  PAYMENT_RESOURCE_ORDER
    .map((key) => `${key}:${resources[key] ?? 0}`)
    .join('|')

const tradeSignature = (trade: Trade) =>
  [
    trade.sourceId ?? trade.source ?? '',
    trade.groupId ?? '',
    trade.groupMax ?? '',
    resourceSignature(trade.from),
    resourceSignature(trade.to),
    trade.replaceUpTo ? 'upTo' : 'exact',
  ].join('#')

const tradeUsageSignature = (tradesUsed: { trade: Trade; times: number }[]) =>
  tradesUsed
    .filter((entry) => entry.times > 0)
    .map((entry) => `${tradeSignature(entry.trade)}:${entry.times}`)
    .sort()
    .join('|')

const unitCostOptionSignature = (option: UnitCostOption) =>
  `${resourceSignature(option.cost)}::${tradeUsageSignature(option.tradesUsed)}`

const mergeTradeUsage = (
  left: { trade: Trade; times: number }[],
  right: { trade: Trade; times: number }[],
) => {
  const merged = left.map((entry) => ({ ...entry }))
  for (const entry of right) {
    if (entry.times <= 0) continue
    const existing = merged.find((candidate) => candidate.trade === entry.trade)
    if (existing) {
      existing.times += entry.times
    } else {
      merged.push({ ...entry })
    }
  }
  return merged
}

const incrementTradeUsage = (
  tradesUsed: { trade: Trade; times: number }[],
  trade: Trade,
) => mergeTradeUsage(tradesUsed, [{ trade, times: 1 }])

const getTradeUsage = (
  tradesUsed: { trade: Trade; times: number }[],
  trade: Trade,
) => tradesUsed.find((entry) => entry.trade === trade)?.times ?? 0

const getTradeGroupUsage = (
  tradesUsed: { trade: Trade; times: number }[],
  trade: Trade,
) => {
  if (!trade.groupId || trade.groupMax === undefined) return 0
  return tradesUsed.reduce(
    (sum, entry) => sum + (entry.trade.groupId === trade.groupId ? entry.times : 0),
    0,
  )
}

const getRemainingTradeGroupUses = (
  tradesUsed: { trade: Trade; times: number }[],
  trade: Trade,
) => {
  if (!trade.groupId || trade.groupMax === undefined) return Infinity
  return Math.max(0, trade.groupMax - getTradeGroupUsage(tradesUsed, trade))
}

const isWithinTradeGroupLimits = (
  tradesUsed: { trade: Trade; times: number }[],
) => {
  const groups = new Map<string, { max: number; used: number }>()
  for (const entry of tradesUsed) {
    if (entry.times <= 0 || !entry.trade.groupId || entry.trade.groupMax === undefined) continue
    const existing = groups.get(entry.trade.groupId)
    if (existing) {
      existing.used += entry.times
      existing.max = Math.min(existing.max, entry.trade.groupMax)
    } else {
      groups.set(entry.trade.groupId, { max: entry.trade.groupMax, used: entry.times })
    }
  }
  for (const group of groups.values()) {
    if (group.used > group.max) return false
  }
  return true
}

const applyUnitTradeToCost = (
  cost: PaymentResourceMap,
  trade: Trade,
): PaymentResourceMap | null => {
  const toEntries = (Object.entries(trade.to) as [ResourceKey, number][])
    .filter(([, amount]) => amount > 0)
  if (toEntries.length === 0) return null

  const next: PaymentResourceMap = { ...cost }
  for (const [key, amount] of toEntries) {
    const current = next[key] ?? 0
    const removed = trade.replaceUpTo ? Math.min(current, amount) : amount
    if (removed <= 0 || current < removed || (!trade.replaceUpTo && current < amount)) {
      return null
    }
    next[key] = current - removed
  }

  for (const [key, amount] of Object.entries(trade.from) as [ResourceKey, number][]) {
    if (amount <= 0) continue
    next[key] = (next[key] ?? 0) + amount
  }

  return normalizePositiveResources(next)
}

const dedupeUnitCostOptions = (options: UnitCostOption[]) => {
  const seen = new Set<string>()
  const deduped: UnitCostOption[] = []
  for (const option of options) {
    const key = unitCostOptionSignature(option)
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(option)
  }
  return deduped
}

const buildUnitCostOptions = (
  unitFee: PaymentResourceMap,
  unitTrades: Trade[],
): UnitCostOption[] => {
  // Candidate closure (ADR 0004): unit trades are optional transforms, the
  // reachable option set is order-independent by construction. Per-trade
  // `max` and trade-group limits live in the apply guard, which reads the
  // usage already encoded in the option's tradesUsed.
  const base: UnitCostOption = { cost: normalizePositiveResources(unitFee), tradesUsed: [] }
  if (unitTrades.length === 0) return [base]
  const transforms: CandidateTransform<UnitCostOption>[] = unitTrades.map((trade, index) => ({
    source: `${index}#${tradeSignature(trade)}`,
    maxUses: Number.POSITIVE_INFINITY,
    apply: (option) => {
      const maxPerUnit = Math.min(
        Math.max(0, Math.floor(trade.max ?? 1)),
        getRemainingTradeGroupUses(option.tradesUsed, trade),
      )
      if (getTradeUsage(option.tradesUsed, trade) >= maxPerUnit) return null
      const nextCost = applyUnitTradeToCost(option.cost, trade)
      if (!nextCost) return null
      return { cost: nextCost, tradesUsed: incrementTradeUsage(option.tradesUsed, trade) }
    },
  }))
  return closeCandidates([base], transforms, { key: unitCostOptionSignature })
}

const buildUnitTotalOptions = (
  unitFee: PaymentResourceMap,
  unitTrades: Trade[],
  nb?: number,
): UnitCostOption[] => {
  if (nb === undefined || nb <= 0) {
    return [{ cost: {}, tradesUsed: [] }]
  }
  if (unitTrades.length === 0) {
    return [{ cost: scaleResources(unitFee, nb), tradesUsed: [] }]
  }

  const unitOptions = buildUnitCostOptions(unitFee, unitTrades)
  let totals: UnitCostOption[] = [{ cost: {}, tradesUsed: [] }]

  for (let i = 0; i < nb; i += 1) {
    const nextTotals: UnitCostOption[] = []
    for (const total of totals) {
      for (const unitOption of unitOptions) {
        const tradesUsed = mergeTradeUsage(total.tradesUsed, unitOption.tradesUsed)
        if (!isWithinTradeGroupLimits(tradesUsed)) continue
        nextTotals.push({
          cost: normalizePositiveResources(mergePaymentResources(total.cost, unitOption.cost)),
          tradesUsed,
        })
      }
    }
    totals = dedupeUnitCostOptions(nextTotals)
  }

  return totals
}

const enumerateActionTradeCombos = (
  actionTrades: Trade[],
  playerResources: Partial<Resource>,
): TradeCombo[] => {
  if (actionTrades.length === 0) {
    return [{ tradesUsed: [], result: { ...playerResources } }]
  }
  const [firstTrade, ...restTrades] = actionTrades
  const restCombos = enumerateActionTradeCombos(restTrades, playerResources)
  const results: TradeCombo[] = []
  for (const combo of restCombos) {
    const maxTimes = Math.min(
      getMaxTradeTimesFromPartial(firstTrade, combo.result),
      getRemainingTradeGroupUses(combo.tradesUsed, firstTrade),
    )
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

export const generateTradeCombinations = (
  trades: Trade[],
  playerResources: Partial<Resource>,
  _nb?: number,
): TradeCombo[] => {
  const actionTrades = trades.filter((t) => (t.scope ?? 'action') === 'action')
  return enumerateActionTradeCombos(actionTrades, playerResources)
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

const hasSupplyTokenCost = (cost: ComplexCost): boolean => {
  const maps = [
    cost.fee,
    ...(cost.fees ?? []),
    cost.unitFee,
    cost.cards?.cost,
  ].filter(Boolean) as PaymentResourceMap[]
  return maps.some((map) => (map.fence ?? 0) > 0 || (map.stable ?? 0) > 0)
}

const normalizeTypedFlatUnitCost = (
  cost: ComplexCost,
  costType?: CostModifierType,
): ComplexCost => {
  if (
    cost.nb !== undefined ||
    cost.unitFee !== undefined ||
    cost.fees !== undefined ||
    cost.cards !== undefined ||
    (costType !== 'fencing' && costType !== 'stables') ||
    cost.fee === undefined
  ) {
    return cost
  }

  const positiveEntries = Object.entries(cost.fee)
    .filter(([, value]) => typeof value === 'number' && value > 0)
  if (
    positiveEntries.length > 1 ||
    (positiveEntries.length === 1 && positiveEntries[0]![0] !== 'wood')
  ) {
    return cost
  }

  const wood = cost.fee.wood ?? 0
  if (!Number.isInteger(wood) || wood < 0) return cost

  if (costType === 'fencing') {
    const { fee: _fee, ...rest } = cost
    return { ...rest, unitFee: { wood: 1 }, nb: wood }
  }

  const stableUnits = Math.floor(wood / 2)
  const remainder = wood % 2
  const { fee: _fee, ...rest } = cost
  return {
    ...rest,
    ...(remainder > 0 ? { fee: { wood: remainder } } : {}),
    unitFee: { wood: 2 },
    nb: stableUnits,
  }
}

export const computeAllBuyableCombinations = (
  player: PlayerState,
  cost: ComplexCost,
  playedCards?: string[],
  costType?: CostModifierType,
  state?: GameState,
): PaymentSolution[] => {
  const normalizedCost = normalizeTypedFlatUnitCost(cost, costType)
  validateComplexCost(normalizedCost)
  const effectiveCost = costType
    ? applyCostModifiers(normalizedCost, getModifiersForCostType(player, costType))
    : normalizedCost
  validateComplexCost(effectiveCost)

  const canUseCache = !hasSupplyTokenCost(effectiveCost)
  const cacheKey = canUseCache ? makeCacheKey(player, effectiveCost, costType, playedCards) : ''
  const cached = canUseCache ? solutionCache.get(cacheKey) : undefined
  if (cached) return cached

  const playerResources: PaymentResourceMap = { ...player.resources }
  const rawSolutions: InternalSolution[] = []
  const nb = effectiveCost.nb

  const baseFeesRaw: PaymentResourceMap[] = effectiveCost.fees && effectiveCost.fees.length > 0
    ? effectiveCost.fees
    : effectiveCost.fee
      ? [effectiveCost.fee]
      : [{}]
  // Clamp negative resource entries to 0 after merging fees + unitFee*nb.
  // Negative deltas (e.g. D154_ChimneySweep `costs: { stone: -2 }`) cancel
  // against the matching positive amount in unitFee×nb. They MUST NOT remain
  // negative — otherwise canCoverCost / resourcesPaid leak a phantom refund
  // on resources the player isn't actually paying (per spec §6.2 trace).
  const clampNonNegative = (fee: PaymentResourceMap): PaymentResourceMap => {
    const out: PaymentResourceMap = {}
    for (const [k, v] of Object.entries(fee)) {
      const value = v ?? 0
      if (value > 0) out[k as PaymentResourceKey] = value
    }
    return out
  }

  const allTrades = effectiveCost.trades ?? []
  const actionTrades = allTrades.filter((trade) => (trade.scope ?? 'action') === 'action')
  const unitTrades = allTrades.filter((trade) => trade.scope === 'unit')
  const unitTotals = buildUnitTotalOptions(effectiveCost.unitFee ?? {}, unitTrades, nb)

  for (const bonus of effectiveCost.bonuses ?? []) {
    validateBonus(bonus)
  }

  const costBoundsSatisfied = (
    currentCost: PaymentResourceMap,
    minCost?: Partial<Resource>,
    maxCost?: Partial<Resource>,
  ) => {
    for (const [key, value] of Object.entries(minCost ?? {})) {
      if ((currentCost[key as ResourceKey] ?? 0) < (value ?? 0)) return false
    }
    for (const [key, value] of Object.entries(maxCost ?? {})) {
      if ((currentCost[key as ResourceKey] ?? 0) > (value ?? 0)) return false
    }
    return true
  }

  for (let feeIdx = 0; feeIdx < baseFeesRaw.length; feeIdx++) {
    const baseFeeRaw = baseFeesRaw[feeIdx]
    for (const unitTotal of unitTotals) {
      const baseFee = clampNonNegative(mergePaymentResources(baseFeeRaw, unitTotal.cost))
      const tradeCombos = actionTrades.length > 0
        ? generateTradeCombinations(actionTrades, playerResources)
        : [{ tradesUsed: [], result: { ...playerResources } }]

      for (const tradeCombo of tradeCombos) {
        const tradesUsed = mergeTradeUsage(unitTotal.tradesUsed, tradeCombo.tradesUsed)
        if (!isWithinTradeGroupLimits(tradesUsed)) continue
        type BonusPath = {
          cost: PaymentResourceMap
          sources: string[]
          choiceIndices: Record<string, number>
        }
        let bonusPaths: BonusPath[] = [
          { cost: baseFee, sources: [], choiceIndices: {} },
        ]

        for (const bonus of effectiveCost.bonuses ?? []) {
          if (!evaluateConditions(player, bonus.conditions, nb)) {
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
            capDiscountAtCost?: boolean
            trackChoiceIndex?: boolean
            sources?: string[]
            conditions?: Record<string, number>
            minCost?: Partial<Resource>
            maxCost?: Partial<Resource>
            _origIndex: number
          }[] = bonus.choices
            ? bonus.choices.map((c, i) => ({
                ...c,
                capDiscountAtCost: c.capDiscountAtCost ?? bonus.capDiscountAtCost,
                trackChoiceIndex: c.trackChoiceIndex ?? bonus.trackChoiceIndex,
                minCost: c.minCost ?? bonus.minCost,
                maxCost: c.maxCost ?? bonus.maxCost,
                _origIndex: i,
              }))
            : [
                {
                  discount: bonus.discount!,
                  capDiscountAtCost: bonus.capDiscountAtCost,
                  trackChoiceIndex: bonus.trackChoiceIndex,
                  sources: bonus.sources,
                  minCost: bonus.minCost,
                  maxCost: bonus.maxCost,
                  _origIndex: 0,
                },
              ]
          const candidates = rawCandidates.filter((c) =>
            evaluateConditions(player, c.conditions, nb),
          )
          if (candidates.length === 0) {
            continue
          }
          const isMultiChoice = (bonus.choices?.length ?? 0) > 0
          const bonusKey = bonus.sources?.[0]
          for (const path of bonusPaths) {
            for (const candidate of candidates) {
              if (!costBoundsSatisfied(path.cost, candidate.minCost, candidate.maxCost)) {
                continue
              }
              if (!canApplyBonus(path.cost, candidate.discount, candidate.capDiscountAtCost)) {
                continue
              }
              const nextCost = applyBonus(path.cost, candidate.discount, candidate.capDiscountAtCost)
              const combined = new Set([
                ...path.sources,
                ...(bonus.sources ?? []),
                ...(candidate.sources ?? []),
              ])
              const nextSources = [...combined]
              const nextChoiceIndices =
                isMultiChoice && bonusKey && candidate.trackChoiceIndex !== false
                  ? { ...path.choiceIndices, [bonusKey]: candidate._origIndex }
                  : { ...path.choiceIndices }
              expanded.push({
                cost: nextCost,
                sources: nextSources,
                choiceIndices: nextChoiceIndices,
              })
            }
          }
          bonusPaths = expanded.length > 0 || bonus.optional ? expanded : bonusPaths
        }

        for (const { cost: effectiveCostFee, sources, choiceIndices } of bonusPaths) {
          const { resources: realCost, supplyTokens } = splitSupplyTokenCost(effectiveCostFee)
          if (canCoverCost(tradeCombo.result, realCost) && canPaySupplyTokens(state, player, effectiveCostFee)) {
            const remaining = subtractResources(tradeCombo.result, realCost)
            const remainingWithSupplyTokens = {
              ...remaining,
              ...Object.fromEntries(
                Object.entries(supplyTokens).map(([key, value]) => [key, -(value ?? 0)]),
              ),
            } as PaymentResourceMap
            rawSolutions.push({
              resourcesRemaining: remainingWithSupplyTokens as Partial<Resource>,
              tradesUsed,
              bonusUsed: sources.length > 0 ? sources.join(',') : undefined,
              bonusChoiceIndex:
                Object.keys(choiceIndices).length > 0 ? choiceIndices : undefined,
              feeIndex: baseFeesRaw.length > 1 ? feeIdx : undefined,
            })
          }
        }
      }
    }
  }

  const paymentSolutions: PaymentSolution[] = []
  const seenHashes = new Set<number>()

  for (const sol of rawSolutions) {
    const resourcesPaid = subtractResources(playerResources, sol.resourcesRemaining)
    if (
      costType
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
    const cardCost = cost.cards.cost ?? {}
    const canPayCardCost = canPayResources(player, cardCost)
      && canPaySupplyTokens(state, player, cardCost)

    if (cost.cards.required) {
      const requiredCardSolutions: PaymentSolution[] = []
      if (eligibleCards.length > 0 && canPayCardCost) {
        paymentSolutions.forEach((solution) => {
          eligibleCards.forEach((cardId) => {
            const resourcesPaid = mergePaymentResources(solution.resourcesPaid, cardCost)
            if (!canPayResources(player, resourcesPaid) || !canPaySupplyTokens(state, player, resourcesPaid)) {
              return
            }
            requiredCardSolutions.push({
              ...solution,
              resourcesPaid,
              cardUsed: cardId,
            })
          })
        })
      }
      paymentSolutions.length = 0
      paymentSolutions.push(...requiredCardSolutions)
    } else if (canPayCardCost) {
      eligibleCards.forEach((cardId) => {
        const cardSolution: PaymentSolution = {
          resourcesPaid: cardCost,
          tradesUsed: [],
          cardUsed: cardId,
        }
        paymentSolutions.push(cardSolution)
      })
    }
  }

  const result = sortPaymentSolutions(keepOnlyOptimals(paymentSolutions))
  if (canUseCache) solutionCache.set(cacheKey, result)
  return result
}

export const canPayCost = (
  player: PlayerState,
  cost: PaymentResourceMap | ComplexCost,
  costType?: CostModifierType,
  state?: GameState,
): boolean => {
  if (!isComplexCost(cost) && !costType) {
    return canPayResources(player, cost) && canPaySupplyTokens(state, player, cost)
  }
  const complex: ComplexCost = isComplexCost(cost) ? cost : { fee: cost }
  return computeAllBuyableCombinations(player, complex, undefined, costType, state).length > 0
}
