import { getUsedFarmyardTileKeys, getNewlyUsedFarmyardTiles } from '../domain/farmyard-usage'
import type { ActionFlow, ActionSpace, FarmTilePosition, Field, GameState, PlayerState, Resource } from '../contract/types'
import type { EventSink } from '../contract/events'
import { positionKey } from '../domain/farm'
import { getMoorSpecialActionEffectPlan, moorSpecialActionBorrowCost } from './special-action-plan'
import { improvementAction } from '../actions/effects/improvement'
import {
  hasVisibleTerrain,
  hasVisibleTerrainWithoutCovered,
  removeVisibleTerrain,
  replaceTerrainWithField,
} from './farm-terrain'
import type { MoorSpecialActionId } from './types'

export type MoorSpecialActionPayload = {
  tile?: FarmTilePosition
}

import { isMoorTerrainAction } from '../projections/moor-special-actions'
import { isMoorSpecialActionCardUsableByPlayer } from './special-action-availability'
export { isMoorSpecialActionCardUsableByPlayer } from './special-action-availability'
export { isMoorSpecialActionId, isMoorTerrainAction } from '../projections/moor-special-actions'

const emptyResources = (): Resource => ({
  wood: 0,
  clay: 0,
  reed: 0,
  stone: 0,
  food: 0,
  grain: 0,
  vegetable: 0,
  sheep: 0,
  boar: 0,
  cattle: 0,
  begging: 0,
  fuel: 0,
  horse: 0,
})

export const createMoorSpecialActionSpace = (actionId: MoorSpecialActionId): ActionSpace => ({
  id: actionId,
  nameKey: `moor.specialActions.${actionId}`,
  descriptionKey: `moor.specialActions.${actionId}`,
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: () => ({ type: 'ok' }),
  resources: emptyResources(),
  takenBy: [],
})

const hasAdjacentField = (fields: readonly Field[], tile: FarmTilePosition): boolean => {
  const fieldKeys = new Set(fields.map((field) => positionKey(field)))
  return [
    { row: tile.row - 1, col: tile.col },
    { row: tile.row + 1, col: tile.col },
    { row: tile.row, col: tile.col - 1 },
    { row: tile.row, col: tile.col + 1 },
  ].some((neighbor) => fieldKeys.has(positionKey(neighbor)))
}

const improvementFlow = (types: readonly ('major' | 'minor')[]): ActionFlow => ({
  type: 'leaf',
  actionId: 'improvement',
  actionContext: { types: [...types] },
})

const canExecuteImprovementFlow = (
  state: GameState,
  player: PlayerState,
  types: readonly ('major' | 'minor')[],
): boolean =>
  improvementAction.canBeExecutedByPlayer(state, player, {
    actionContext: { types: [...types] },
  })

const positiveResources = (resources: Partial<Resource>): Partial<Resource> =>
  Object.fromEntries(Object.entries(resources).filter(([, amount]) =>
    typeof amount === 'number' && amount > 0,
  )) as Partial<Resource>

const emitGain = (
  eventSink: EventSink | undefined,
  player: PlayerState,
  actionId: MoorSpecialActionId,
  resources: Partial<Resource>,
): void => {
  const gain = positiveResources(resources)
  if (Object.keys(gain).length === 0) return
  eventSink?.emit<'resource.moved'>({
    type: 'resource.moved',
    actorPlayerId: player.id,
    sourceActionId: actionId,
    resources: gain,
    from: { kind: 'supply' },
    to: { kind: 'player', playerId: player.id },
    reason: 'gain',
  })
}

const emitPayment = (
  eventSink: EventSink | undefined,
  player: PlayerState,
  actionId: MoorSpecialActionId,
  resources: Partial<Resource>,
): void => {
  const paid = positiveResources(resources)
  if (Object.keys(paid).length === 0) return
  eventSink?.emit<'resource.paid'>({
    type: 'resource.paid',
    actorPlayerId: player.id,
    sourceActionId: actionId,
    resources: paid,
    to: { kind: 'supply' },
    paymentFor: 'bonus',
  })
}

export const validateMoorSpecialAction = (
  state: GameState,
  playerIndex: number,
  cardId: string,
  actionId: MoorSpecialActionId,
  payload: MoorSpecialActionPayload = {},
): { ok: true } | { ok: false; error: string } => {
  const player = state.players[playerIndex]
  const farmersOfTheMoor = state.farmersOfTheMoor
  if (!player || !farmersOfTheMoor) return { ok: false, error: 'farmers of the moor unavailable' }
  const card = farmersOfTheMoor.specialActionCards.find((candidate) => candidate.id === cardId)
  if (!card || !card.actions.includes(actionId)) return { ok: false, error: 'special action unavailable' }
  if (!isMoorSpecialActionCardUsableByPlayer(card, player.id)) {
    return { ok: false, error: 'special action unavailable' }
  }
  const { cost } = getMoorSpecialActionEffectPlan(state, player, actionId, payload)
  const requiredFood = (moorSpecialActionBorrowCost(state, cardId).food ?? 0) + (cost.food ?? 0)
  if (player.resources.food < requiredFood) {
    return { ok: false, error: 'not enough food' }
  }
  const requiredFuel = cost.fuel ?? 0
  if ((player.resources.fuel ?? 0) < requiredFuel) {
    return { ok: false, error: 'not enough fuel' }
  }

  return validateMoorSpecialActionEffect(state, playerIndex, actionId, payload)
}

export const validateMoorSpecialActionEffect = (
  state: GameState,
  playerIndex: number,
  actionId: MoorSpecialActionId,
  payload: MoorSpecialActionPayload = {},
): { ok: true } | { ok: false; error: string } => {
  if (isMoorTerrainAction(actionId)) {
    return validateMoorTerrainActionEffect(state, playerIndex, actionId, payload)
  }
  const player = state.players[playerIndex]
  if (!player || !state.farmersOfTheMoor) return { ok: false, error: 'farmers of the moor unavailable' }
  switch (actionId) {
    case 'hiring-fair':
      break
    case 'horse-market':
      break
    case 'black-market':
      if (!canExecuteImprovementFlow(state, player, ['minor'])) {
        return { ok: false, error: 'special action unavailable' }
      }
      break
    case 'illicit-work':
      if (!canExecuteImprovementFlow(state, player, ['major'])) {
        return { ok: false, error: 'special action unavailable' }
      }
      break
    default:
      return { ok: false, error: 'special action unavailable' }
  }
  return { ok: true }
}

export const validateMoorTerrainActionEffect = (
  state: GameState,
  playerIndex: number,
  actionId: MoorSpecialActionId,
  payload: MoorSpecialActionPayload = {},
): { ok: true } | { ok: false; error: string } => {
  const player = state.players[playerIndex]
  if (!player || !state.farmersOfTheMoor) return { ok: false, error: 'farmers of the moor unavailable' }
  const terrain = getMoorSpecialActionEffectPlan(state, player, actionId, payload).terrain
  if (!terrain) return { ok: false, error: 'special action unavailable' }
  if (terrain.operation === 'remove' && !hasVisibleTerrain(player, terrain.tile, terrain.from)) return { ok: false, error: 'terrain unavailable' }
  if (terrain.requiresUncovered && (!terrain.tile || !hasVisibleTerrainWithoutCovered(player, terrain.tile, terrain.from))) return { ok: false, error: 'terrain unavailable' }
  if (terrain.adjacentFieldRequiredWhenPresent && (!terrain.tile || (player.fields.length > 0 && !hasAdjacentField(player.fields, terrain.tile)))) return { ok: false, error: 'terrain unavailable' }
  return { ok: true }
}

export type MoorSpecialActionResult =
  | { ok: true; followUpFlow?: ActionFlow; terrainCleared?: boolean }
  | { ok: false; error: string }

const executeMoorSpecialActionEffect = (
  state: GameState,
  playerIndex: number,
  actionId: MoorSpecialActionId,
  payload: MoorSpecialActionPayload = {},
  eventSink?: EventSink,
): MoorSpecialActionResult => {
  const player = state.players[playerIndex]!
  const plan = getMoorSpecialActionEffectPlan(state, player, actionId, payload)
  let terrainCleared: boolean | undefined

  if (plan.terrain?.operation === 'remove') {
    const removed = removeVisibleTerrain(player, plan.terrain.tile, plan.terrain.from)
    if (!removed.ok) return { ok: false, error: 'terrain unavailable' }
    terrainCleared = removed.cleared
  } else if (plan.terrain?.operation === 'replace-with-field') {
    if (!plan.terrain.tile) return { ok: false, error: 'terrain unavailable' }
    const previousUsed = getUsedFarmyardTileKeys(player)
    const result = replaceTerrainWithField(player, plan.terrain.tile, plan.terrain.from)
    if (!result.ok) return { ok: false, error: 'terrain unavailable' }
    eventSink?.emit<'farm.fieldPlowed'>({
      newlyUsedTiles: getNewlyUsedFarmyardTiles(player, previousUsed),
      type: 'farm.fieldPlowed', actorPlayerId: player.id, sourceActionId: actionId,
      fields: [{ playerId: player.id, row: plan.terrain.tile.row, col: plan.terrain.tile.col }],
    })
  }
  for (const [raw, amount] of Object.entries(plan.cost)) if (amount && amount > 0) {
    const resource = raw as keyof Resource
    player.resources[resource] = (player.resources[resource] ?? 0) - amount
  }
  emitPayment(eventSink, player, actionId, plan.cost)
  for (const [raw, amount] of Object.entries(plan.gain)) if (amount && amount > 0) {
    const resource = raw as keyof Resource
    player.resources[resource] = (player.resources[resource] ?? 0) + amount
  }
  emitGain(eventSink, player, actionId, plan.gain)
  const followUpFlow = plan.improvementTypes ? improvementFlow(plan.improvementTypes) : undefined

  return {
    ok: true,
    ...(followUpFlow ? { followUpFlow } : {}),
    ...(terrainCleared !== undefined ? { terrainCleared } : {}),
  }
}

export const applyMoorSpecialActionEffect = (
  state: GameState,
  playerIndex: number,
  actionId: MoorSpecialActionId,
  payload: MoorSpecialActionPayload = {},
  eventSink?: EventSink,
): MoorSpecialActionResult => {
  const validation = validateMoorSpecialActionEffect(state, playerIndex, actionId, payload)
  if (!validation.ok) return validation
  return executeMoorSpecialActionEffect(state, playerIndex, actionId, payload, eventSink)
}

export const applyMoorSpecialAction = (
  state: GameState,
  playerIndex: number,
  cardId: string,
  actionId: MoorSpecialActionId,
  payload: MoorSpecialActionPayload = {},
  eventSink?: EventSink,
): MoorSpecialActionResult => {
  const validation = validateMoorSpecialAction(state, playerIndex, cardId, actionId, payload)
  if (!validation.ok) return validation
  const player = state.players[playerIndex]!
  const card = state.farmersOfTheMoor!.specialActionCards.find((candidate) => candidate.id === cardId)!
  const borrowCost = moorSpecialActionBorrowCost(state, cardId)
  const result = executeMoorSpecialActionEffect(state, playerIndex, actionId, payload, eventSink)
  if (!result.ok) return result

  if (card.location.kind === 'market') {
    card.location = { kind: 'playerFaceUp', playerId: player.id }
  } else {
    player.resources.food -= borrowCost.food ?? 0
    emitPayment(eventSink, player, actionId, borrowCost)
    card.location = { kind: 'playerFaceDown', playerId: player.id }
  }
  return result
}

export const resetMoorSpecialActionCards = (state: GameState): void => {
  state.farmersOfTheMoor?.specialActionCards.forEach((card) => {
    card.location = { kind: 'market' }
  })
}
