import type { GameState, PlayerState, Worker } from '../contract/types'
import type { CardDefinition } from '../contract/cards'
import { getPlayedCardDefinitions } from '../cards/helpers/card-type'
import { workersAtHome, smallestAvailableWorker } from '../domain/player'
import { findActionSpaceById } from '../domain/space'
import { isThroughTheSeasonsSeason } from '../seasons/rules'

export type HeatingPaymentPayload = {
  fuelUsed?: number
  woodToFuel?: number
}

export type HeatingPaymentResult = {
  required: number
  fuelUsed: number
  woodToFuel: number
  sickWorkerIds: string[]
}

type HeatingRequirementContext = {
  woodToFuel?: number
}

const workerNumber = (worker: Worker): number => Number(worker.id)

const wholeNonNegative = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : 0

const wholeNumber = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.floor(value)
    : 0

const sickSet = (player: PlayerState): Set<string> =>
  new Set(player.sickWorkerIds ?? [])

const cardStateHeatingRoomDiscount = (player: PlayerState, cardId: string): number =>
  wholeNumber(player.cardStates?.[cardId]?.extraData?.heatingRoomDiscount)

const hasHeatingMetadata = (player: PlayerState, card: CardDefinition): boolean =>
  card.heatingRoomDiscount !== undefined ||
  card.heatingFuelCap !== undefined ||
  card.heatingWoodToFuelDiscount !== undefined ||
  cardStateHeatingRoomDiscount(player, card.id) !== 0

const playedHeatingCards = (player: PlayerState): CardDefinition[] =>
  getPlayedCardDefinitions(player).filter((card) => hasHeatingMetadata(player, card))

export const computeHeatingRequirement = (
  state: GameState,
  player: PlayerState,
  context: HeatingRequirementContext = {},
): number => {
  if (state.enableFarmersOfTheMoor !== true) return 0
  if (isThroughTheSeasonsSeason(state, 'summer')) return 0
  const rooms = player.roomTiles?.length ?? player.rooms ?? 0
  const houseDiscount = player.houseType === 'stone' ? 2 : player.houseType === 'clay' ? 1 : 0
  const heatingCards = playedHeatingCards(player)
  const cardDiscount = heatingCards.reduce((sum, card) => {
    const woodDiscount = wholeNonNegative(context.woodToFuel) > 0
      ? wholeNonNegative(card.heatingWoodToFuelDiscount)
      : 0
    return sum
      + wholeNumber(card.heatingRoomDiscount)
      + cardStateHeatingRoomDiscount(player, card.id)
      + woodDiscount
  }, 0)
  const caps = heatingCards
    .map((card) => card.heatingFuelCap)
    .filter((cap): cap is number => typeof cap === 'number' && Number.isFinite(cap))
    .map((cap) => Math.max(0, Math.floor(cap)))
  const baseRequirement = Math.max(0, rooms - houseDiscount - cardDiscount)
  return caps.length > 0 ? Math.min(baseRequirement, ...caps) : baseRequirement
}

export const healthyWorkersAtHome = (
  state: GameState,
  player: PlayerState,
): Worker[] => {
  const sick = sickSet(player)
  return workersAtHome(state, player).filter((worker) => !sick.has(worker.id))
}

export const sickWorkersAtHome = (
  state: GameState,
  player: PlayerState,
): Worker[] => {
  const sick = sickSet(player)
  return workersAtHome(state, player).filter((worker) => sick.has(worker.id))
}

export const hasHealthyWorkerAtHome = (
  state: GameState,
  player: PlayerState,
): boolean => healthyWorkersAtHome(state, player).length > 0

export const selectWorkerForMoorAction = (
  state: GameState,
  player: PlayerState,
  spaceId: string,
): Worker | null => {
  if (state.enableFarmersOfTheMoor !== true) return smallestAvailableWorker(state, player)
  if (spaceId === 'moor-infirmary') {
    const sick = sickWorkersAtHome(state, player).sort((a, b) => workerNumber(b) - workerNumber(a))
    if (sick.length > 0) return sick[0]!
    const healthy = healthyWorkersAtHome(state, player).sort((a, b) => workerNumber(a) - workerNumber(b))
    return healthy[0] ?? null
  }
  const healthy = healthyWorkersAtHome(state, player).sort((a, b) => workerNumber(a) - workerNumber(b))
  return healthy[0] ?? null
}

export const canMoorWorkerEnterSpace = (
  state: GameState,
  player: PlayerState,
  spaceId: string,
): boolean => selectWorkerForMoorAction(state, player, spaceId) !== null

export const applyHeatingPayment = (
  state: GameState,
  player: PlayerState,
  payload: HeatingPaymentPayload,
): HeatingPaymentResult => {
  const requestedWoodToFuel = Math.min(wholeNonNegative(payload.woodToFuel), player.resources.wood)
  const preDiscountRequired = computeHeatingRequirement(state, player)
  const required = computeHeatingRequirement(state, player, { woodToFuel: requestedWoodToFuel })
  const minWoodToActivateDiscount = requestedWoodToFuel > 0 && required < preDiscountRequired ? 1 : 0
  const woodToFuel = Math.min(requestedWoodToFuel, Math.max(required, minWoodToActivateDiscount))
  const storedFuelUsed = Math.min(
    Math.max(0, wholeNonNegative(payload.fuelUsed) - woodToFuel),
    Math.max(0, required - woodToFuel),
    player.resources.fuel ?? 0,
  )
  const fuelUsed = woodToFuel + storedFuelUsed

  player.resources.wood -= woodToFuel
  player.resources.fuel = (player.resources.fuel ?? 0) - storedFuelUsed

  const deficit = Math.max(0, required - fuelUsed)
  const sick = sickSet(player)
  const newlySick = workersAtHome(state, player)
    .filter((worker) => !sick.has(worker.id))
    .sort((a, b) => workerNumber(b) - workerNumber(a))
    .slice(0, deficit)
    .map((worker) => worker.id)

  if (newlySick.length > 0) {
    player.sickWorkerIds = [...(player.sickWorkerIds ?? []), ...newlySick]
  }

  return {
    required,
    fuelUsed,
    woodToFuel,
    sickWorkerIds: newlySick,
  }
}

export const recoverInfirmaryWorkers = (state: GameState): void => {
  const infirmary = findActionSpaceById(state, 'moor-infirmary')
  if (!infirmary) return
  for (const player of state.players) {
    const recovering = new Set(
      infirmary.takenBy
        .filter((worker) => worker.playerId === player.id)
        .map((worker) => worker.workerId),
    )
    if (recovering.size === 0) continue
    player.sickWorkerIds = (player.sickWorkerIds ?? []).filter((id) => !recovering.has(id))
  }
}
