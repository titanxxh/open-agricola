/**
 * Cost-modifier engine: applyCostModifiers, evaluateConditions,
 * getModifiersForCostType, validateBonus. Throws on invariant violations
 * (Bonus configuration errors) — these are programmer errors and surface
 * via Error rather than a Result-style return value.
 *
 * Internal to shared/actions/payment/. Not exported from the package
 * barrel (shared/actions/payment/index.ts). Use PaymentSolver from
 * the public API instead.
 */

import type {
  Bonus,
  BonusModifier,
  ComplexCost,
  CostModifier,
  CostModifierType,
  PaymentResourceMap,
  PlayerState,
  ResourceKey,
  Trade,
  TradeModifier,
} from '../../../contract/types'

export const evaluateStaticConditions = (
  player: PlayerState,
  conditions: Record<string, number> | undefined,
): boolean => {
  if (!conditions) return true
  if (typeof conditions.houseTypeWood === 'number' && conditions.houseTypeWood > 0 && player.houseType !== 'wood') return false
  if (typeof conditions.houseTypeClay === 'number' && conditions.houseTypeClay > 0 && player.houseType !== 'clay') return false
  if (typeof conditions.houseTypeStone === 'number' && conditions.houseTypeStone > 0 && player.houseType !== 'stone') return false
  return true
}

export const evaluateConditions = (
  player: PlayerState,
  conditions: Record<string, number> | undefined,
  nb?: number,
): boolean => {
  if (!evaluateStaticConditions(player, conditions)) return false
  if (typeof conditions?.minNumRooms === 'number') {
    const target = nb ?? player.rooms
    if (target < conditions.minNumRooms) return false
  }
  return true
}

export const getModifiersForCostType = (
  player: PlayerState,
  costType: CostModifierType,
): CostModifier[] => {
  const all = player.activeModifiers?.filter((m) => m.appliesTo.includes(costType)) ?? []
  // Layer 1 only: static player-state checks (houseType*). minNumRooms is
  // deferred to evaluateConditions(_, _, nb) inside enumerate.
  return all.filter((m) =>
    m.type === 'remove-resource' || evaluateStaticConditions(player, m.conditions),
  )
}

export const applyCostModifiers = (
  baseCost: ComplexCost,
  modifiers: CostModifier[],
): ComplexCost => {
  let result: ComplexCost = {
    ...baseCost,
    ...(baseCost.fee ? { fee: { ...baseCost.fee } } : {}),
    ...(baseCost.fees ? { fees: baseCost.fees.map((fee) => ({ ...fee })) } : {}),
    ...(baseCost.unitFee ? { unitFee: { ...baseCost.unitFee } } : {}),
  }

  const removalModifiers = modifiers
    .filter((mod) => mod.type === 'remove-resource')
    .sort((left, right) => left.cardId.localeCompare(right.cardId))
  const claimedResources = new Set<ResourceKey>()
  const baseFees = result.fees && result.fees.length > 0
    ? result.fees
    : result.fee
      ? [result.fee]
      : [{}]
  const unitCount = result.nb !== undefined && result.nb > 0 ? result.nb : 0
  const costResourceRemovals = removalModifiers.flatMap((modifier) =>
    modifier.resources.flatMap((resource) => {
      if (claimedResources.has(resource)) return []
      claimedResources.add(resource)
      return [{
        resource,
        sourceCard: modifier.cardId,
        savedByFee: baseFees.map((fee) => Math.max(
          0,
          (fee[resource] ?? 0) + (result.unitFee?.[resource] ?? 0) * unitCount,
        )),
      }]
    }),
  )
  if (costResourceRemovals.length > 0) {
    const remove = (fee: PaymentResourceMap): PaymentResourceMap => {
      const next = { ...fee }
      for (const { resource } of costResourceRemovals) delete next[resource]
      return next
    }
    if (result.fee) result.fee = remove(result.fee)
    if (result.fees) result.fees = result.fees.map(remove)
    if (result.unitFee) result.unitFee = remove(result.unitFee)
    result.costResourceRemovals = costResourceRemovals
  } else {
    delete result.costResourceRemovals
  }

  const effectiveTrades: Trade[] = [...(result.trades ?? [])]
  const effectiveBonuses: Bonus[] = [...(result.bonuses ?? [])]

  for (const mod of modifiers) {
    if (mod.type === 'trade') {
      const tradeMod = mod as TradeModifier
      validateTradeModifier(tradeMod)
      const scope = tradeMod.scope ?? 'action'
      // scope:'action' + undefined max → keep `?? 1` fallback (current behaviour)
      // scope:'unit' + undefined max → defer to enumerate (which defaults to nb)
      const synthMax = tradeMod.max ?? (scope === 'unit' ? undefined : 1)
      effectiveTrades.push({
        from: tradeMod.from,
        to: tradeMod.to,
        ...(synthMax !== undefined ? { max: synthMax } : {}),
        scope,
        ...(tradeMod.groupId !== undefined ? { groupId: tradeMod.groupId } : {}),
        ...(tradeMod.groupMax !== undefined ? { groupMax: tradeMod.groupMax } : {}),
        ...(tradeMod.replaceUpTo ? { replaceUpTo: true } : {}),
        source: tradeMod.cardId,
        sourceId: tradeMod.cardId,
      })
    } else if (mod.type === 'bonus') {
      const bonusMod = mod as BonusModifier
      effectiveBonuses.push({
        discount: bonusMod.discount,
        choices: bonusMod.choices,
        ...(bonusMod.capDiscountAtCost ? { capDiscountAtCost: true } : {}),
        ...(bonusMod.trackChoiceIndex === false ? { trackChoiceIndex: false } : {}),
        ...(bonusMod.choiceAffectsState ? { choiceAffectsState: true } : {}),
        optional: bonusMod.optional ?? true,
        sources: [bonusMod.cardId],
        ...(bonusMod.minCost ? { minCost: bonusMod.minCost } : {}),
        ...(bonusMod.maxCost ? { maxCost: bonusMod.maxCost } : {}),
        // Propagate nb-aware conditions (e.g. minNumRooms) so enumerate can
        // re-evaluate them against the actual nb via evaluateConditions().
        // Static conditions (houseType*) are already filtered by
        // getModifiersForCostType; preserving them is a no-op here.
        ...(bonusMod.conditions ? { conditions: bonusMod.conditions } : {}),
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

const collectComplexCostViolations = (cost: ComplexCost): string[] => {
  const violations: string[] = []
  if (cost.nb !== undefined && cost.cards !== undefined) {
    violations.push('`nb` and `cards` are mutually exclusive')
  }
  if (cost.trades?.some((t) => t.scope === 'unit') && cost.nb === undefined) {
    violations.push('unit-scoped trades present but `nb` is missing')
  }
  return violations
}

export const validateComplexCost = (cost: ComplexCost): void => {
  const violations = collectComplexCostViolations(cost)
  if (violations.length === 0) return
  const proc = (globalThis as { process?: { env?: { NODE_ENV?: string } } }).process
  const isDev = !proc || proc.env?.NODE_ENV !== 'production'
  if (isDev) {
    throw new Error(`Invalid ComplexCost: ${violations.join('; ')}`)
  }
  // Production: log + best-effort — caller treats unconvertible cost as
  // canPayCost === false (no affordable solutions).
  console.error('[ComplexCost validation]', violations, 'cost:', cost)
}

export const validateTradeModifier = (modifier: TradeModifier): void => {
  if (modifier.scope === 'unit' && modifier.conditions?.minNumRooms !== undefined) {
    throw new Error(
      `TradeModifier ${modifier.cardId}: scope:'unit' MUST NOT carry conditions.minNumRooms ` +
      `(per-unit trades have no min-unit threshold).`,
    )
  }
  const hasGroupId = modifier.groupId !== undefined
  const hasGroupMax = modifier.groupMax !== undefined
  if (hasGroupId !== hasGroupMax) {
    throw new Error(`TradeModifier ${modifier.cardId}: groupId and groupMax must be set together.`)
  }
  if (modifier.groupId !== undefined && modifier.groupId.trim().length === 0) {
    throw new Error(`TradeModifier ${modifier.cardId}: groupId must be non-empty.`)
  }
  if (
    modifier.groupMax !== undefined &&
    (!Number.isInteger(modifier.groupMax) || modifier.groupMax <= 0)
  ) {
    throw new Error(`TradeModifier ${modifier.cardId}: groupMax must be a positive integer.`)
  }
}

export const validateBonus = (bonus: Bonus): void => {
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
