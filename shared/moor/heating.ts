import type { GameState, PlayerState, Worker } from '../contract/types'
import { workersAtHome, smallestAvailableWorker } from '../domain/player'
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

const workerNumber = (worker: Worker): number => Number(worker.id)

const wholeNonNegative = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : 0

const sickSet = (player: PlayerState): Set<string> =>
  new Set(player.sickWorkerIds ?? [])

export const computeHeatingRequirement = (
  state: GameState,
  player: PlayerState,
): number => {
  if (state.enableFarmersOfTheMoor !== true) return 0
  if (isThroughTheSeasonsSeason(state, 'summer')) return 0
  const rooms = player.roomTiles?.length ?? player.rooms ?? 0
  const discount = player.houseType === 'stone' ? 2 : player.houseType === 'clay' ? 1 : 0
  return Math.max(0, rooms - discount)
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
  const required = computeHeatingRequirement(state, player)
  const woodToFuel = Math.min(wholeNonNegative(payload.woodToFuel), player.resources.wood)
  player.resources.wood -= woodToFuel
  player.resources.fuel = (player.resources.fuel ?? 0) + woodToFuel

  const fuelUsed = Math.min(
    wholeNonNegative(payload.fuelUsed),
    required,
    player.resources.fuel ?? 0,
  )
  player.resources.fuel = (player.resources.fuel ?? 0) - fuelUsed

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
  const infirmary = state.actionSpaces.find((space) => space.id === 'moor-infirmary')
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
