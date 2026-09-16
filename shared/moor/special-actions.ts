import type { ActionFlow, ActionSpace, FarmTilePosition, Field, GameState, PlayerState, Resource } from '../contract/types'
import type { EventSink } from '../contract/events'
import { getMajorCard } from '../cards/major'
import { getRegisteredMinorImprovement, getRegisteredOccupation } from '../cards/registry-display'
import { positionKey } from '../domain/farm'
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

const horseMarketFoodCost = (state: GameState): number =>
  [2, 5, 6].includes(state.players.length) ? 1 : 0

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

const resourceDelta = (before: Partial<Resource>, after: Partial<Resource>): Partial<Resource> => {
  const delta: Partial<Resource> = {}
  for (const key of Object.keys(emptyResources()) as (keyof Resource)[]) {
    const amount = (after[key] ?? 0) - (before[key] ?? 0)
    if (amount > 0) delta[key] = amount
  }
  return delta
}

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

const applyMoorSpecialActionBonuses = (
  state: GameState,
  player: PlayerState,
  actionId: MoorSpecialActionId,
): void => {
  if (state.enableFarmersOfTheMoor !== true) return
  const resources = player.resources as Record<keyof Resource, number | undefined>
  const cards = [
    ...(player.improvements ?? []).map((cardId) => getMajorCard(cardId)),
    ...(player.minorPlayed ?? []).map((cardId) => getRegisteredMinorImprovement(cardId)),
    ...(player.occupationPlayed ?? []).map((cardId) => getRegisteredOccupation(cardId)),
  ]
  for (const card of cards) {
    for (const bonus of card?.moorSpecialActionBonuses ?? []) {
      if (bonus.actionId !== actionId) continue
      const amount = (resources.horse ?? 0) > 0 && bonus.horseAmount !== undefined
        ? bonus.horseAmount
        : bonus.amount
      if (amount <= 0) continue
      resources[bonus.resource] = (resources[bonus.resource] ?? 0) + amount
    }
  }
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
  const requiredFood =
    (card.location.kind === 'playerFaceUp' ? 2 : 0) +
    (actionId === 'horse-market' ? horseMarketFoodCost(state) : 0) +
    (actionId === 'illicit-work' ? 1 : 0)
  if (player.resources.food < requiredFood) {
    return { ok: false, error: 'not enough food' }
  }
  const requiredFuel =
    actionId === 'black-market' || actionId === 'illicit-work' ? 1 : 0
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
  switch (actionId) {
    case 'cut-peat':
      if (!hasVisibleTerrain(player, payload.tile, 'moor')) return { ok: false, error: 'terrain unavailable' }
      break
    case 'fell-trees':
      if (!hasVisibleTerrain(player, payload.tile, 'forest')) return { ok: false, error: 'terrain unavailable' }
      break
    case 'slash-and-burn':
      if (!payload.tile || !hasVisibleTerrainWithoutCovered(player, payload.tile, 'forest')) {
        return { ok: false, error: 'terrain unavailable' }
      }
      if ((player.fields ?? []).length > 0 && !hasAdjacentField(player.fields, payload.tile)) {
        return { ok: false, error: 'terrain unavailable' }
      }
      break
    default:
      return { ok: false, error: 'special action unavailable' }
  }
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
  let followUpFlow: ActionFlow | undefined
  let terrainCleared: boolean | undefined

  switch (actionId) {
    case 'cut-peat': {
      const before = { ...player.resources }
      const removed = removeVisibleTerrain(player, payload.tile, 'moor')
      if (!removed.ok) return { ok: false, error: 'terrain unavailable' }
      terrainCleared = removed.cleared
      player.resources.fuel = (player.resources.fuel ?? 0) + 3
      applyMoorSpecialActionBonuses(state, player, actionId)
      emitGain(eventSink, player, actionId, resourceDelta(before, player.resources))
      break
    }
    case 'fell-trees': {
      const before = { ...player.resources }
      const removed = removeVisibleTerrain(player, payload.tile, 'forest')
      if (!removed.ok) return { ok: false, error: 'terrain unavailable' }
      terrainCleared = removed.cleared
      player.resources.wood += 2
      applyMoorSpecialActionBonuses(state, player, actionId)
      emitGain(eventSink, player, actionId, resourceDelta(before, player.resources))
      break
    }
    case 'slash-and-burn': {
      if (!payload.tile) return { ok: false, error: 'terrain unavailable' }
      const result = replaceTerrainWithField(player, payload.tile, 'forest')
      if (!result.ok) return { ok: false, error: 'terrain unavailable' }
      eventSink?.emit<'farm.fieldPlowed'>({
        type: 'farm.fieldPlowed',
        actorPlayerId: player.id,
        sourceActionId: actionId,
        fields: [{ playerId: player.id, row: payload.tile.row, col: payload.tile.col }],
      })
      break
    }
    case 'hiring-fair': {
      const before = { ...player.resources }
      player.resources.food += state.players.length === 3 ? 2 : 1
      emitGain(eventSink, player, actionId, resourceDelta(before, player.resources))
      break
    }
    case 'horse-market': {
      const foodCost = horseMarketFoodCost(state)
      player.resources.food -= foodCost
      player.resources.horse = (player.resources.horse ?? 0) + 1
      emitPayment(eventSink, player, actionId, { food: foodCost })
      emitGain(eventSink, player, actionId, { horse: 1 })
      break
    }
    case 'black-market':
      player.resources.fuel = (player.resources.fuel ?? 0) - 1
      emitPayment(eventSink, player, actionId, { fuel: 1 })
      followUpFlow = improvementFlow(['minor'])
      break
    case 'illicit-work':
      player.resources.food -= 1
      player.resources.fuel = (player.resources.fuel ?? 0) - 1
      emitPayment(eventSink, player, actionId, { food: 1, fuel: 1 })
      followUpFlow = improvementFlow(['major'])
      break
    default:
      return { ok: false, error: 'special action unavailable' }
  }

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
  const result = executeMoorSpecialActionEffect(state, playerIndex, actionId, payload, eventSink)
  if (!result.ok) return result

  if (card.location.kind === 'market') {
    card.location = { kind: 'playerFaceUp', playerId: player.id }
  } else {
    player.resources.food -= 2
    emitPayment(eventSink, player, actionId, { food: 2 })
    card.location = { kind: 'playerFaceDown', playerId: player.id }
  }
  return result
}

export const resetMoorSpecialActionCards = (state: GameState): void => {
  state.farmersOfTheMoor?.specialActionCards.forEach((card) => {
    card.location = { kind: 'market' }
  })
}
