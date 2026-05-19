/**
 * Cost-modifier engine: applyCostModifiers, evaluateConditions,
 * getModifiersForCostType, validateBonus. Throws on invariant violations
 * (Bonus configuration errors) — these are programmer errors and surface
 * via Error rather than the Result-style PaymentExecuteResult.
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
  PlayerState,
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
  // The `construct` cost type evaluates conditions inside `room-payment.ts`
  // (per-build, with access to `roomCount`). Other cost types evaluate the
  // player-only checks here, uniformly for both BonusModifier and
  // TradeModifier (the latter gained `conditions` to support D15_ClaySupports
  // and friends).
  if (costType === 'construct') return all
  return all.filter((m) => evaluateConditions(player, m.conditions))
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

export const validateTradeModifier = (modifier: TradeModifier): void => {
  if (modifier.scope === 'unit' && modifier.conditions?.minNumRooms !== undefined) {
    throw new Error(
      `TradeModifier ${modifier.cardId}: scope:'unit' MUST NOT carry conditions.minNumRooms ` +
      `(per-unit trades have no min-unit threshold).`,
    )
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
