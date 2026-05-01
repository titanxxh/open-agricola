import type {
  GameState,
  PlayerState,
  Resource,
  ComplexCost,
  PaymentSolution,
  Trade,
  TradeSideEffect,
  Bonus,
  ResourceKey,
  CostModifierType,
  CostModifier,
  TradeModifier,
  BonusModifier,
} from '../../game/types'
import {
  convertResources,
  hasValidResources,
} from '../effects/exchange'
import { getRegisteredMinorImprovement } from '../../cards/types'
import { recordPaymentStats } from '../../cards/helpers/payment-stats'

const FIREPLACE_COST_IDS = ['Major_Fireplace1', 'Major_Fireplace2'] as const

/**
 * Returns true if a card in the player's hand satisfies a slot in the cost
 * list. Normal cards must appear verbatim in the list. Minor improvements with
 * `fireplaceIdentity === true` also satisfy any Fireplace-return cost slot.
 */
const cardMatchesCostList = (
  cardId: string,
  costList: readonly string[],
): boolean => {
  if (costList.includes(cardId)) return true
  const isFireplaceRequest = costList.some(
    (id) => (FIREPLACE_COST_IDS as readonly string[]).includes(id),
  )
  if (isFireplaceRequest) {
    const minor = getRegisteredMinorImprovement(cardId)
    if (minor?.fireplaceIdentity) return true
  }
  return false
}

// ============================================================
// LRU Cache for payment computation (major performance boost)
// ============================================================
class LRUCache<K, V> {
  private cache = new Map<K, V>()
  private maxSize: number;
  constructor(maxSize: number) { this.maxSize = maxSize }
  get(key: K): V | undefined {
    if (!this.cache.has(key)) return undefined
    const value = this.cache.get(key)!
    this.cache.delete(key)
    this.cache.set(key, value)
    return value
  }
  set(key: K, value: V): void {
    if (this.cache.has(key)) {
      this.cache.delete(key)
    } else if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value
      if (firstKey !== undefined) this.cache.delete(firstKey)
    }
    this.cache.set(key, value)
  }
  clear(): void {
    this.cache.clear()
  }
}

const solutionCache = new LRUCache<string, PaymentSolution[]>(100)

// Hash function for PaymentSolution - O(1) deduplication
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

function hashSolution(solution: PaymentSolution): number {
  let h = 0
  const paid = solution.resourcesPaid
  for (const [res, amount] of Object.entries(paid)) {
    const resId = RESOURCE_ID[res] || 0
    h = ((h + resId * 17 + ((amount ?? 0) * 31)) * 31) >>> 0
  }
  // Include trades in hash
  for (const { trade, times } of solution.tradesUsed) {
    h = ((h + (trade.from?.wood ?? 0) * 13 + times * 7) * 31) >>> 0
  }
  // Include bonus
  if (solution.bonusUsed) {
    h = ((h + solution.bonusUsed.charCodeAt(0) * 17) * 31) >>> 0
  }
  if (solution.cardUsed) {
    for (const ch of solution.cardUsed) {
      h = ((h + ch.charCodeAt(0) * 19) * 31) >>> 0
    }
  }
  return h
}

function makeCacheKey(
  player: PlayerState,
  cost: ComplexCost,
  costType?: CostModifierType,
  playedCards?: string[],
): string {
  const reserveKey = Object.entries(player.resources)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, v]) => `${k}:${v}`)
    .join(',')
  const costKey = JSON.stringify(cost)
  const typeKey = costType ?? 'none'
  const playedCardsKey = [...(playedCards ?? [])].sort().join(',')
  return `${reserveKey}|${costKey}|${typeKey}|${playedCardsKey}`
}

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

type InternalSolution = {
  resourcesRemaining: Partial<Resource>
  tradesUsed: { trade: Trade; times: number }[]
  bonusUsed?: string
  feeIndex?: number
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

  // Treat card return as an additional cost dimension
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

const generateTradeCombinations = (
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

/**
 * Evaluate `conditions` (player-state dimension). Returns true when conditions
 * are satisfied (or absent). Used by:
 *   - getModifiersForCostType (non-construct path) to pre-filter BonusModifier
 *   - computeAllBuyableCombinations to evaluate ComplexCost.bonuses inline
 *     conditions on Bonus / BonusChoice.
 *
 * The construct path does NOT call this helper: room-payment.ts's
 * `bonusAppliesToRoomCount` evaluates `minNumRooms` against the build-time
 * roomCount (semantically "after building N rooms"), which differs from the
 * player-state evaluation here.
 */
export const evaluateConditions = (
  player: PlayerState,
  conditions: Record<string, number> | undefined,
): boolean => {
  if (!conditions) return true
  if (typeof conditions.minNumRooms === 'number' && player.rooms < conditions.minNumRooms) {
    return false
  }
  if (typeof conditions.houseTypeWood === 'number' && conditions.houseTypeWood > 0 && player.houseType !== 'wood') {
    return false
  }
  if (typeof conditions.houseTypeClay === 'number' && conditions.houseTypeClay > 0 && player.houseType !== 'clay') {
    return false
  }
  if (typeof conditions.houseTypeStone === 'number' && conditions.houseTypeStone > 0 && player.houseType !== 'stone') {
    return false
  }
  return true
}

export const getModifiersForCostType = (
  player: PlayerState,
  costType: CostModifierType,
): CostModifier[] => {
  const all = player.activeModifiers?.filter((m) => m.appliesTo.includes(costType)) ?? []
  // For construct, callers (room-payment) evaluate conditions per build call
  // because they depend on the room count being built. For other cost types
  // (renovation / improvement / fencing / stables / plow / occupation),
  // conditions are evaluated here against the player's current state.
  if (costType === 'construct') return all
  return all.filter((m) =>
    m.type !== 'bonus' || evaluateConditions(player, m.conditions),
  )
}

export const applyCostModifiers = (
  baseCost: ComplexCost,
  modifiers: CostModifier[],
): ComplexCost => {
  let result: ComplexCost = { ...baseCost }

  const effectiveTrades: Trade[] = [...(result.trades ?? [])]
  const effectiveBonuses: Bonus[] = [...(result.bonuses ?? [])]

  for (const mod of modifiers) {
    if (mod.type === 'trade') {
      const tradeMod = mod as TradeModifier
      effectiveTrades.push({
        from: tradeMod.from,
        to: tradeMod.to,
        max: tradeMod.max ?? 1,
        source: tradeMod.cardId,
        sourceId: tradeMod.cardId,
      })
    } else if (mod.type === 'bonus') {
      const bonusMod = mod as BonusModifier
      // bonusMod has already been pre-filtered by getModifiersForCostType's
      // evaluateConditions (non-construct path), or by room-payment per build
      // call (construct path). Do NOT propagate the conditions field onto the
      // generated Bonus — computeAllBuyableCombinations would otherwise
      // re-evaluate it redundantly.
      effectiveBonuses.push({
        discount: bonusMod.discount,
        choices: bonusMod.choices,
        optional: bonusMod.optional ?? true,
        sources: [bonusMod.cardId],
      })
    }
  }

  result = { ...result }
  if (effectiveTrades.length > 0) {
    result.trades = effectiveTrades
  } else {
    delete result.trades
  }
  if (effectiveBonuses.length > 0) {
    result.bonuses = effectiveBonuses
  } else {
    delete result.bonuses
  }

  return result
}

const validateBonus = (bonus: Bonus): void => {
  const hasDiscount = bonus.discount !== undefined
  const hasChoices = bonus.choices !== undefined
  if (hasDiscount === hasChoices) {
    throw new Error(
      'Bonus must have exactly one of discount or choices (got ' +
        `discount=${hasDiscount}, choices=${hasChoices})`,
    )
  }
  if (hasChoices && (bonus.choices!.length === 0)) {
    throw new Error('Bonus.choices must be a non-empty array')
  }
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

  // Validate bonus invariants once up-front
  for (const bonus of effectiveCost.bonuses ?? []) {
    validateBonus(bonus)
  }

  for (let feeIdx = 0; feeIdx < baseFees.length; feeIdx++) {
    const baseFee = baseFees[feeIdx]
    const tradeCombos = effectiveCost.trades && effectiveCost.trades.length > 0
      ? generateTradeCombinations(effectiveCost.trades, playerResources)
      : [{ tradesUsed: [], result: { ...playerResources } }]

    for (const tradeCombo of tradeCombos) {
      // Expand bonuses in BGA style: each bonus multiplies the path count.
      // Start with one path = baseFee with no bonuses applied.
      type BonusPath = { cost: Partial<Resource>; sources: string[] }
      let bonusPaths: BonusPath[] = [{ cost: baseFee, sources: [] }]

      for (const bonus of effectiveCost.bonuses ?? []) {
        // Bonus-level conditions: if not satisfied, the entire bonus is a
        // no-op for this player (preserve existing bonusPaths unchanged).
        if (!evaluateConditions(player, bonus.conditions)) {
          continue
        }

        const expanded: BonusPath[] = []
        // If optional, include a "skip" path that keeps the existing costs.
        if (bonus.optional) {
          for (const path of bonusPaths) {
            expanded.push({ cost: path.cost, sources: [...path.sources] })
          }
        }
        // BonusChoice-level conditions: filter candidates whose conditions
        // are not satisfied. If all candidates are filtered out, the bonus
        // is treated as inapplicable (continue without polluting bonusPaths).
        const rawCandidates: {
          discount: Partial<Resource>
          sources?: string[]
          conditions?: Record<string, number>
        }[] =
          bonus.choices ??
          [{ discount: bonus.discount!, sources: bonus.sources }]
        const candidates = rawCandidates.filter((c) =>
          evaluateConditions(player, c.conditions),
        )
        if (candidates.length === 0) {
          continue
        }
        for (const path of bonusPaths) {
          for (const candidate of candidates) {
            const nextCost = applyBonus(path.cost, candidate.discount)
            const combined = new Set([
              ...path.sources,
              ...(bonus.sources ?? []),
              ...(candidate.sources ?? []),
            ])
            const nextSources = [...combined]
            expanded.push({ cost: nextCost, sources: nextSources })
          }
        }
        bonusPaths = expanded
      }

      for (const { cost: effectiveCostFee, sources } of bonusPaths) {
        if (canCoverCost(tradeCombo.result, effectiveCostFee)) {
          const remaining = subtractResources(tradeCombo.result, effectiveCostFee)
          rawSolutions.push({
            resourcesRemaining: remaining,
            tradesUsed: tradeCombo.tradesUsed,
            bonusUsed: sources.length > 0 ? sources.join(',') : undefined,
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
    if (costType && Object.values(resourcesPaid).some((value) => (value ?? 0) < 0)) {
      continue
    }
    const solution: PaymentSolution = {
      resourcesPaid,
      tradesUsed: sol.tradesUsed,
      bonusUsed: sol.bonusUsed,
      feeIndex: sol.feeIndex,
    }

    const hash = hashSolution(solution)
    if (!seenHashes.has(hash)) {
      seenHashes.add(hash)
      paymentSolutions.push(solution)
    }
  }

  // Add or combine card-based payment solutions if cards are specified
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

/**
 * Best-effort attribution of a PaymentSolution's bonus discounts back to the
 * source `BonusModifier` cards. For each cardId listed in `solution.bonusUsed`,
 * we look up the player's `activeModifiers` of type 'bonus' whose `cardId`
 * matches, and accumulate their `discount` resources. This covers the common
 * discount-mode bonuses (e.g. A14_CarpentersHammer, A143_Stonecutter,
 * D82_HuntingTrophy). Choices-mode bonuses (e.g. A123_FrameBuilder) don't carry
 * which candidate was selected on the PaymentSolution, so the attribution is
 * skipped for them — better to record nothing than to mis-attribute.
 *
 * If `costType` is supplied we also restrict the lookup to modifiers whose
 * `appliesTo` includes that cost type. This prevents over-crediting when the
 * same card defines multiple BonusModifiers for different cost types (e.g.
 * C122_Bricklayer has separate `construct` (-2 clay) and `renovation` (-1 clay)
 * entries — only the matching one fires for any given payment).
 */
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
  eff: TradeSideEffect,
  times: number,
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
        applyTradeSideEffect(options.state, trade.sideEffect, times)
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
    // Lazy require to avoid pulling card-state into pay.ts top-of-module cycle.
    // recordPaymentStats writes per-card paid/saved derived from tradesUsed.
    const bonusReductions = buildBonusReductions(player, solution, options.costType)
    recordPaymentStats(player, solution, bonusReductions)
  }
  return solution.cardUsed
}

export const returnCardToBoard = (
  player: PlayerState,
  cardId: string,
  state?: Pick<GameState, 'availableMajorImprovements'>,
): void => {
  const improvementIndex = player.improvements.indexOf(cardId)
  if (improvementIndex > -1) {
    player.improvements.splice(improvementIndex, 1)
    if (state && !state.availableMajorImprovements.includes(cardId)) {
      state.availableMajorImprovements.push(cardId)
    }
  }
  const minorPlayedIndex = player.minorPlayed.indexOf(cardId)
  if (minorPlayedIndex > -1) {
    player.minorPlayed.splice(minorPlayedIndex, 1)
    // Clean up auxiliary state that a minor card may have registered on play
    // (e.g. providesOccupation extras, per-card state like D25's virtual field).
    if (player.extraOccupationsFromCards) {
      player.extraOccupationsFromCards = player.extraOccupationsFromCards.filter(
        (id) => id !== cardId,
      )
    }
    if (player.cardStates) {
      delete player.cardStates[cardId]
    }
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

export const clearPaymentCache = () => {
  solutionCache.clear()
}
