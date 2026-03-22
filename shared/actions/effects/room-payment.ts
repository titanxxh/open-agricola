import type {
  ActionExecutionResult,
  ComplexCost,
  PaymentSolution,
  PlayerState,
  Resource,
} from '../../game/types'
import { getBuildRoomCost } from './construct'
import {
  resolveCostPaymentSelection,
  executeResolvedTypedFlatPayment,
} from './pay-helpers'
import {
  applyCostOverride,
  canPayCost,
  getModifiersForCostType,
  isComplexCost,
} from './pay'

export type RoomUnitCost = Partial<Resource> | ComplexCost

type RoomCostPlayer = Pick<PlayerState, 'resources' | 'houseType' | 'activeModifiers'>

export const ROOM_PAYMENT_OPTION_PREFIX = 'pay:room'

type SelectedRoomPayment = {
  type: 'selected'
  totalCost: Partial<Resource> | ComplexCost
  solution: PaymentSolution
}

export type RoomPaymentSelectionResult = ActionExecutionResult | SelectedRoomPayment

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
    ? Math.floor((maxAmount ?? 0) / toAmount)
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

export const buildRoomCostPerUnit = (
  player: RoomCostPlayer,
  costOverride?: Partial<Resource>,
): RoomUnitCost => {
  const baseFee = applyCostOverride(getBuildRoomCost(player.houseType), costOverride)
  let fees: Partial<Resource>[] = [sanitizeCost(baseFee)]
  const modifiers = getModifiersForCostType(player as PlayerState, 'construct')

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
        const discounted = fees.map((fee) =>
          sanitizeCost(
            Object.entries(modifier.discount).reduce<Partial<Resource>>(
              (acc, [key, value]) => ({
                ...acc,
                [key]: Math.max(0, (acc[key as keyof Resource] ?? 0) - (value ?? 0)),
              }),
              fee,
            ),
          ),
        )
        cardAlternatives.push(...discounted)
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

export const buildTotalRoomCost = (
  costPerRoom: RoomUnitCost,
  roomCount: number,
): Partial<Resource> | ComplexCost => {
  if (roomCount <= 0) {
    return {}
  }
  if (!isComplexCost(costPerRoom)) {
    return sanitizeCost(
      Object.entries(costPerRoom).reduce<Partial<Resource>>((acc, [key, value]) => {
        if (typeof value !== 'number') return acc
        acc[key as keyof Resource] = value * roomCount
        return acc
      }, {}),
    )
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

  return totals.length === 1 ? totals[0]! : { fees: totals }
}

export const canAffordRoomCount = (
  player: RoomCostPlayer,
  costPerRoom: RoomUnitCost,
  roomCount: number,
) => canPayCost(player as PlayerState, buildTotalRoomCost(costPerRoom, roomCount))

export const resolveRoomPaymentSelection = (
  player: PlayerState,
  costPerRoom: RoomUnitCost,
  roomCount: number,
  paymentChoice?: string,
): RoomPaymentSelectionResult => {
  const totalCost = buildTotalRoomCost(costPerRoom, roomCount)
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
  executeResolvedTypedFlatPayment(player, resolution)
}
