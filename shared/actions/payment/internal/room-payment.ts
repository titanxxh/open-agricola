/**
 * Room construction payment: buildRoomCostPerUnit, getBuildRoomCost,
 * getMaxBuildableRooms, executeResolvedRoomPayment, resolveRoomPaymentSelection.
 * Variant of the payment path scoped to per-unit room construction with
 * dynamic cost-per-unit derivation.
 *
 * Internal to shared/actions/payment/. Not exported from the package
 * barrel (shared/actions/payment/index.ts). Use PaymentSolver from
 * the public API instead.
 */

import type {
  ActionExecutionResult,
  Bonus,
  BonusModifier,
  ComplexCost,
  PaymentSolution,
  PlayerState,
  Resource,
} from '../../../game/types'
import { getAllTilePositions, positionKey } from '../../../game/farm'
import { resolveCostPaymentSelection } from './payment-choice-result'
import { executeResolvedTypedFlatPayment } from './typed-flat'
import { applyCostOverride, isComplexCost } from './affordability'
import { canPayCost } from './enumerate'
import { getModifiersForCostType } from './cost-modifiers'

type RoomUnitCost = Partial<Resource> | ComplexCost

export const getBuildRoomCost = (houseType: PlayerState['houseType']) => {
  if (houseType === 'clay') return { clay: 5, reed: 2 }
  if (houseType === 'stone') return { stone: 5, reed: 2 }
  return { wood: 5, reed: 2 }
}

const validateBonusModifier = (modifier: BonusModifier): void => {
  const hasDiscount = modifier.discount !== undefined
  const hasChoices = modifier.choices !== undefined
  if (hasDiscount === hasChoices) {
    throw new Error(
      `BonusModifier for ${modifier.cardId} must have exactly one of ` +
        `discount or choices (got discount=${hasDiscount}, choices=${hasChoices})`,
    )
  }
  if (hasChoices && modifier.choices!.length === 0) {
    throw new Error(
      `BonusModifier for ${modifier.cardId} has empty choices array`,
    )
  }
}

const applyDiscountToFee = (
  cost: Partial<Resource>,
  discount: Partial<Resource>,
): Partial<Resource> => {
  const result = { ...cost }
  Object.entries(discount).forEach(([key, value]) => {
    if (typeof value !== 'number') return
    result[key as keyof Resource] = Math.max(0, (result[key as keyof Resource] ?? 0) - value)
  })
  return sanitizeCost(result)
}

const applyBonusToFee = (
  cost: Partial<Resource>,
  bonus: Bonus,
) => {
  if (!bonus.discount) return sanitizeCost({ ...cost })
  return applyDiscountToFee(cost, bonus.discount)
}

const expandBonusChoicesToFees = (
  fee: Partial<Resource>,
  bonus: Bonus,
): Partial<Resource>[] => {
  if (!bonus.choices || bonus.choices.length === 0) return []
  return bonus.choices.map((choice) => applyDiscountToFee(fee, choice.discount))
}

const bonusAppliesToRoomCount = (
  player: PlayerState,
  conditions: Record<string, number> | undefined,
  roomCount: number,
) => {
  if (!conditions) return true
  if (typeof conditions.minNumRooms === 'number' && roomCount < conditions.minNumRooms) {
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

const ROOM_PAYMENT_OPTION_PREFIX = 'pay:room'

type SelectedRoomPayment = {
  type: 'selected'
  totalCost: Partial<Resource> | ComplexCost
  solution: PaymentSolution
}

type RoomPaymentSelectionResult = ActionExecutionResult | SelectedRoomPayment

const ROOM_PAYMENT_FAILURE: ActionExecutionResult = {
  type: 'fail',
  logKey: 'log.buildRoomFail',
}

const sanitizeCost = (cost: Partial<Resource>): Partial<Resource> => {
  const sanitized: Partial<Resource> = {}
  Object.entries(cost).forEach(([key, value]) => {
    if (typeof value !== 'number' || value <= 0) return
    sanitized[key as keyof Resource] = value
  })
  return sanitized
}

const addCosts = (
  left: Partial<Resource>,
  right: Partial<Resource>,
): Partial<Resource> => {
  const merged: Partial<Resource> = { ...left }
  Object.entries(right).forEach(([key, value]) => {
    if (typeof value !== 'number') return
    const resourceKey = key as keyof Resource
    merged[resourceKey] = (merged[resourceKey] ?? 0) + value
  })
  return sanitizeCost(merged)
}

const dedupeFees = (fees: Partial<Resource>[]) => {
  const seen = new Set<string>()
  return fees.filter((fee) => {
    const key = JSON.stringify(sanitizeCost(fee))
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

const buildTradeFees = (
  fee: Partial<Resource>,
  fromKey: keyof Resource,
  fromAmount: number,
  toKey: keyof Resource,
  toAmount: number,
  maxAmount?: number,
) => {
  if (toAmount <= 0 || fromAmount <= 0 || (fee[toKey] ?? 0) < toAmount) {
    return []
  }
  const perUseLimit = Math.floor((fee[toKey] ?? 0) / toAmount)
  const modifierLimit = Number.isFinite(maxAmount)
    ? Math.floor(maxAmount ?? 0)
    : perUseLimit
  const limit = Math.max(0, Math.min(perUseLimit, modifierLimit))
  const nextFees: Partial<Resource>[] = []
  for (let count = 1; count <= limit; count += 1) {
    nextFees.push(
      sanitizeCost({
        ...fee,
        [toKey]: Math.max(0, (fee[toKey] ?? 0) - toAmount * count),
        [fromKey]: (fee[fromKey] ?? 0) + fromAmount * count,
      }),
    )
  }
  return nextFees
}

const getUnitFees = (costPerRoom: RoomUnitCost): Partial<Resource>[] => {
  if (!isComplexCost(costPerRoom)) {
    return [sanitizeCost(costPerRoom)]
  }
  if (costPerRoom.fees && costPerRoom.fees.length > 0) {
    return dedupeFees(costPerRoom.fees.map((fee) => sanitizeCost(fee)))
  }
  if (costPerRoom.fee) {
    return [sanitizeCost(costPerRoom.fee)]
  }
  return [{}]
}

const countAvailableRoomTiles = (player: PlayerState) => {
  const occupied = new Set(player.roomTiles.map(positionKey))
  player.fields.forEach((field) =>
    occupied.add(positionKey({ row: field.row, col: field.col })),
  )
  player.stableTiles.forEach((tile) => occupied.add(positionKey(tile)))
  player.pastures
    .flatMap((pasture) => pasture.tiles)
    .forEach((tile) => occupied.add(positionKey(tile)))
  return getAllTilePositions().filter((tile) => !occupied.has(positionKey(tile))).length
}

export const buildRoomCostPerUnit = (
  player: PlayerState,
  costOverride?: Partial<Resource>,
): RoomUnitCost => {
  const baseFee = applyCostOverride(getBuildRoomCost(player.houseType), costOverride)
  let fees: Partial<Resource>[] = [sanitizeCost(baseFee)]
  const modifiers = getModifiersForCostType(player, 'construct')

  const modifiersByCard = new Map<string, typeof modifiers>()
  modifiers.forEach((modifier) => {
    const existing = modifiersByCard.get(modifier.cardId) ?? []
    existing.push(modifier)
    modifiersByCard.set(modifier.cardId, existing)
  })

  modifiersByCard.forEach((cardModifiers) => {
    const cardAlternatives: Partial<Resource>[] = [...fees]
    cardModifiers.forEach((modifier) => {
      if (modifier.type === 'bonus') {
        validateBonusModifier(modifier)
        if (modifier.conditions && Object.keys(modifier.conditions).length > 0) {
          return
        }
        if (modifier.discount) {
          const discount = modifier.discount
          const discounted = fees.map((fee) => applyDiscountToFee(fee, discount))
          cardAlternatives.push(...discounted)
        }
        if (modifier.choices && modifier.choices.length > 0) {
          modifier.choices.forEach((choice) => {
            const discounted = fees.map((fee) => applyDiscountToFee(fee, choice.discount))
            cardAlternatives.push(...discounted)
          })
        }
        return
      }

      const toEntries = Object.entries(modifier.to)
      const fromEntries = Object.entries(modifier.from)
      if (toEntries.length !== 1 || fromEntries.length !== 1) {
        return
      }
      const [toKey, toAmount] = toEntries[0] as [keyof Resource, number]
      const [fromKey, fromAmount] = fromEntries[0] as [keyof Resource, number]
      const transformed = fees.flatMap((fee) =>
        buildTradeFees(fee, fromKey, fromAmount, toKey, toAmount, modifier.max),
      )
      cardAlternatives.push(...transformed)
    })

    fees = dedupeFees(cardAlternatives)
  })

  return fees.length === 1 ? fees[0]! : { fees }
}

const applyRoomCountBonuses = (
  player: PlayerState,
  totalCost: Partial<Resource> | ComplexCost,
  roomCount: number,
): Partial<Resource> | ComplexCost => {
  if (roomCount <= 0) return totalCost
  const bonusModifiers = getModifiersForCostType(player, 'construct')
    .filter((modifier): modifier is Extract<typeof modifier, { type: 'bonus' }> => modifier.type === 'bonus')
  bonusModifiers.forEach(validateBonusModifier)
  const bonuses = bonusModifiers
    .filter((modifier) => bonusAppliesToRoomCount(player, modifier.conditions, roomCount))
    .map((modifier) => ({
      discount: modifier.discount,
      choices: modifier.choices,
      optional: modifier.optional ?? true,
      sources: [modifier.cardId],
      conditions: modifier.conditions,
    }))

  if (bonuses.length === 0) return totalCost

  const mandatoryBonuses = bonuses.filter((bonus) => bonus.optional === false)
  const optionalBonuses = bonuses.filter((bonus) => bonus.optional !== false)

  const applyMandatoryBonus = (fees: Partial<Resource>[], bonus: Bonus): Partial<Resource>[] => {
    const withDiscount = bonus.discount
      ? fees.map((fee) => applyBonusToFee(fee, bonus))
      : fees.map((fee) => sanitizeCost({ ...fee }))
    if (!bonus.choices || bonus.choices.length === 0) return withDiscount
    return withDiscount.flatMap((fee) => expandBonusChoicesToFees(fee, bonus))
  }

  const applyOptionalBonus = (fees: Partial<Resource>[], bonus: Bonus): Partial<Resource>[] => {
    const variants: Partial<Resource>[] = [...fees]
    if (bonus.discount) {
      variants.push(...fees.map((fee) => applyBonusToFee(fee, bonus)))
    }
    if (bonus.choices && bonus.choices.length > 0) {
      fees.forEach((fee) => variants.push(...expandBonusChoicesToFees(fee, bonus)))
    }
    return variants
  }

  const startFees = !isComplexCost(totalCost)
    ? [sanitizeCost(totalCost)]
    : getUnitFees(totalCost)

  const afterMandatory = mandatoryBonuses.reduce<Partial<Resource>[]>(
    (fees, bonus) => applyMandatoryBonus(fees, bonus),
    startFees,
  )

  const afterOptional = optionalBonuses.reduce<Partial<Resource>[]>(
    (fees, bonus) => applyOptionalBonus(fees, bonus),
    afterMandatory,
  )

  const discountedFees = dedupeFees(afterOptional)
  return discountedFees.length === 1 ? discountedFees[0]! : { fees: discountedFees }
}

const buildTotalRoomCost = (
  costPerRoom: RoomUnitCost,
  roomCount: number,
  player?: PlayerState,
): Partial<Resource> | ComplexCost => {
  if (roomCount <= 0) {
    return {}
  }
  if (!isComplexCost(costPerRoom)) {
    const totalCost = sanitizeCost(
      Object.entries(costPerRoom).reduce<Partial<Resource>>((acc, [key, value]) => {
        if (typeof value !== 'number') return acc
        acc[key as keyof Resource] = value * roomCount
        return acc
      }, {}),
    )
    return player ? applyRoomCountBonuses(player, totalCost, roomCount) : totalCost
  }

  let totals: Partial<Resource>[] = [{}]
  const unitFees = getUnitFees(costPerRoom)
  for (let index = 0; index < roomCount; index += 1) {
    const nextTotals: Partial<Resource>[] = []
    totals.forEach((existing) => {
      unitFees.forEach((fee) => {
        nextTotals.push(addCosts(existing, fee))
      })
    })
    totals = dedupeFees(nextTotals)
  }

  const totalCost = totals.length === 1 ? totals[0]! : { fees: totals }
  return player ? applyRoomCountBonuses(player, totalCost, roomCount) : totalCost
}

const canAffordRoomCount = (
  player: PlayerState,
  costPerRoom: RoomUnitCost,
  roomCount: number,
) => canPayCost(player, buildTotalRoomCost(costPerRoom, roomCount, player))

export const getMaxBuildableRooms = (
  player: PlayerState,
  costOverride?: Partial<Resource>,
  actionContext?: Record<string, unknown>,
) => {
  const costPerRoom = buildRoomCostPerUnit(player, costOverride)
  const argMax = typeof actionContext?.maxRooms === 'number'
    ? Math.max(0, Math.floor(actionContext.maxRooms))
    : 99
  const structuralMax = Math.min(countAvailableRoomTiles(player), argMax)
  let maxBuyable = 0
  for (let count = 1; count <= structuralMax; count += 1) {
    if (!canAffordRoomCount(player, costPerRoom, count)) break
    maxBuyable = count
  }
  return maxBuyable
}

export const resolveRoomPaymentSelection = (
  player: PlayerState,
  costPerRoom: RoomUnitCost,
  roomCount: number,
  paymentChoice?: string,
): RoomPaymentSelectionResult => {
  const totalCost = buildTotalRoomCost(costPerRoom, roomCount, player)
  const resolved = resolveCostPaymentSelection(
    player,
    totalCost,
    ROOM_PAYMENT_OPTION_PREFIX,
    paymentChoice,
    ROOM_PAYMENT_FAILURE,
  )
  if (resolved.type !== 'selected') {
    return resolved
  }

  return {
    type: 'selected',
    totalCost,
    solution: resolved.solution,
  }
}

export const executeResolvedRoomPayment = (
  player: PlayerState,
  resolution: SelectedRoomPayment,
) => {
  executeResolvedTypedFlatPayment(player, resolution, 'construct')
}
