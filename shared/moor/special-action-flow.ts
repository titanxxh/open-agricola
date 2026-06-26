import type { ActionChoiceOption, ActionDefinition, ActionFlow, GameState, PlayerState } from '../contract/types'
import { runCardListeners } from '../cards/card-listeners'
import {
  applyMoorSpecialActionEffect,
  applyMoorSpecialAction,
  createMoorSpecialActionSpace,
  isMoorSpecialActionCardUsableByPlayer,
  validateMoorSpecialActionEffect,
  type MoorSpecialActionPayload,
} from './special-actions'
import type { MoorSpecialActionId } from './types'

export const MOOR_SPECIAL_ACTION_APPLY_ACTION_ID = 'moor-special-action-apply'
export const MOOR_SPECIAL_ACTION_CHOICE_ACTION_ID = 'moor-special-action-choice'

const MOOR_SPECIAL_ACTION_IDS = new Set<string>([
  'cut-peat',
  'fell-trees',
  'slash-and-burn',
  'hiring-fair',
  'horse-market',
  'black-market',
  'illicit-work',
])

const combineFlows = (flows: ActionFlow[]): ActionFlow | undefined => {
  if (flows.length === 0) return undefined
  if (flows.length === 1) return flows[0]
  return { type: 'seq', children: flows }
}

const readParams = (params?: Record<string, unknown>) => {
  const cardId = params?.cardId
  const actionId = params?.actionId
  if (typeof cardId !== 'string' || typeof actionId !== 'string') return null
  if (!MOOR_SPECIAL_ACTION_IDS.has(actionId)) return null
  return {
    cardId,
    actionId: actionId as MoorSpecialActionId,
    payload: (params?.payload ?? {}) as MoorSpecialActionPayload,
  }
}

const readActionIds = (actionContext?: Record<string, unknown>): MoorSpecialActionId[] => {
  const actionIds = actionContext?.actionIds
  if (!Array.isArray(actionIds)) return [...MOOR_SPECIAL_ACTION_IDS] as MoorSpecialActionId[]
  return actionIds.filter((actionId): actionId is MoorSpecialActionId =>
    typeof actionId === 'string' && MOOR_SPECIAL_ACTION_IDS.has(actionId),
  )
}

const optionLabel = (actionId: MoorSpecialActionId) => `actions.${actionId}.name`

const tilePayloads = (
  player: PlayerState,
  actionId: MoorSpecialActionId,
): MoorSpecialActionPayload[] => {
  if (actionId !== 'cut-peat' && actionId !== 'fell-trees' && actionId !== 'slash-and-burn') {
    return [{}]
  }
  const kind = actionId === 'cut-peat' ? 'moor' : 'forest'
  return (player.farmTerrain ?? [])
    .filter((tile) => tile.kind === kind)
    .map(({ row, col }) => ({ tile: { row, col } }))
}

const takeCardOptions = (
  state: GameState,
  player: PlayerState,
): ActionChoiceOption[] =>
  (state.farmersOfTheMoor?.specialActionCards ?? [])
    .filter((card) => {
      if (!isMoorSpecialActionCardUsableByPlayer(card, player.id)) return false
      return card.location.kind === 'market' || player.resources.food >= 2
    })
    .map((card) => ({
      value: `card:${card.id}`,
      labelKey: optionLabel(card.actions[0]!),
    }))

type ActionChoice = {
  value: string
  actionId: MoorSpecialActionId
  payload: MoorSpecialActionPayload
}

const actionChoiceValue = (
  actionId: MoorSpecialActionId,
  payload: MoorSpecialActionPayload,
) => {
  const tile = payload.tile
  return tile ? `action:${actionId}:${tile.row}:${tile.col}` : `action:${actionId}`
}

const actionChoices = (
  state: GameState,
  player: PlayerState,
  actionContext?: Record<string, unknown>,
): ActionChoice[] => {
  const playerIndex = state.players.indexOf(player)
  if (playerIndex < 0) return []
  return readActionIds(actionContext).flatMap((actionId) =>
    tilePayloads(player, actionId).flatMap((payload) => {
      const validation = validateMoorSpecialActionEffect(state, playerIndex, actionId, payload)
      if (!validation.ok) return []
      return [{ value: actionChoiceValue(actionId, payload), actionId, payload }]
    }),
  )
}

const takeActionOptions = (
  state: GameState,
  player: PlayerState,
  actionContext?: Record<string, unknown>,
): ActionChoiceOption[] =>
  actionChoices(state, player, actionContext).map((choice) => ({
    value: choice.value,
    labelKey: optionLabel(choice.actionId),
  }))

const choiceMode = (actionContext?: Record<string, unknown>) =>
  actionContext?.mode === 'take-card' ? 'take-card' : 'take-action'

export const hasMoorSpecialActionChoice = (
  state: GameState,
  player: PlayerState,
  actionContext?: Record<string, unknown>,
): boolean =>
  choiceMode(actionContext) === 'take-card'
    ? takeCardOptions(state, player).length > 0
    : actionChoices(state, player, actionContext).length > 0

const parseActionChoice = (value: string): { actionId: MoorSpecialActionId; payload: MoorSpecialActionPayload } | null => {
  const parts = value.split(':')
  if (parts[0] !== 'action') return null
  const actionId = parts[1]
  if (!actionId || !MOOR_SPECIAL_ACTION_IDS.has(actionId)) return null
  if (parts.length === 4) {
    const row = Number(parts[2])
    const col = Number(parts[3])
    if (!Number.isFinite(row) || !Number.isFinite(col)) return null
    return { actionId: actionId as MoorSpecialActionId, payload: { tile: { row, col } } }
  }
  return { actionId: actionId as MoorSpecialActionId, payload: {} }
}

const takeSpecialActionCard = (
  state: GameState,
  player: PlayerState,
  value: string,
) => {
  const cardId = value.startsWith('card:') ? value.slice('card:'.length) : ''
  const card = state.farmersOfTheMoor?.specialActionCards.find((candidate) => candidate.id === cardId)
  if (!card || !isMoorSpecialActionCardUsableByPlayer(card, player.id)) {
    return { type: 'fail' as const, errorKey: 'special action unavailable' }
  }
  if (card.location.kind === 'market') {
    card.location = { kind: 'playerFaceUp', playerId: player.id }
    return { type: 'ok' as const }
  }
  if (player.resources.food < 2) return { type: 'fail' as const, errorKey: 'not enough food' }
  player.resources.food -= 2
  card.location = { kind: 'playerFaceDown', playerId: player.id }
  return { type: 'ok' as const }
}

const runAfterSpecialActionListeners = (
  state: GameState,
  player: PlayerState,
  actionId: MoorSpecialActionId,
  payload: MoorSpecialActionPayload,
  result: { followUpFlow?: ActionFlow },
) => {
  const listenerFlows = runCardListeners({
    state,
    player,
    space: createMoorSpecialActionSpace(actionId),
    actionId,
    phase: 'after',
    result: { type: 'ok' },
    extraData: { payload },
  }, undefined, { stampFlowOwner: true })
    .map((entry) => entry.flow)
    .filter((flow): flow is ActionFlow => !!flow)
  return combineFlows([
    ...listenerFlows,
    ...(result.followUpFlow ? [result.followUpFlow] : []),
  ])
}

export const moorSpecialActionChoiceAction: ActionDefinition = {
  id: MOOR_SPECIAL_ACTION_CHOICE_ACTION_ID,
  nameKey: 'actions.moor-special-action-choice.name',
  descriptionKey: 'actions.moor-special-action-choice.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: (state, player, context) =>
    hasMoorSpecialActionChoice(state, player, context?.actionContext),
  execute: ({ state, player, actionContext }) => {
    const options = choiceMode(actionContext) === 'take-card'
      ? takeCardOptions(state, player)
      : takeActionOptions(state, player, actionContext)
    if (options.length === 0) return { type: 'fail', errorKey: 'special action unavailable' }
    return {
      type: 'request',
      request: { kind: 'choice', options },
      promptKey: 'ui.interactionFlowSelect',
    }
  },
  resolveChoice: ({ state, player, actionContext }, choice) => {
    if (choiceMode(actionContext) === 'take-card') {
      return takeSpecialActionCard(state, player, choice)
    }
    const parsed = parseActionChoice(choice)
    if (!parsed) return { type: 'fail', errorKey: 'special action unavailable' }
    const allowed = readActionIds(actionContext)
    if (!allowed.includes(parsed.actionId)) {
      return { type: 'fail', errorKey: 'special action unavailable' }
    }
    const playerIndex = state.players.indexOf(player)
    if (playerIndex < 0) return { type: 'fail', errorKey: 'special action unavailable' }
    const result = applyMoorSpecialActionEffect(state, playerIndex, parsed.actionId, parsed.payload)
    if (!result.ok) return { type: 'fail', errorKey: result.error }
    const followUpFlow = runAfterSpecialActionListeners(state, player, parsed.actionId, parsed.payload, result)
    return followUpFlow ? { type: 'flow', flow: followUpFlow } : { type: 'ok' }
  },
}

export const moorSpecialActionApplyAction: ActionDefinition = {
  id: MOOR_SPECIAL_ACTION_APPLY_ACTION_ID,
  nameKey: 'actions.moor-special-action-apply.name',
  descriptionKey: 'actions.moor-special-action-apply.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ state, player, params }) => {
    const parsed = readParams(params)
    if (!parsed) return { type: 'fail', errorKey: 'special action unavailable' }
    const playerIndex = state.players.findIndex((candidate) => candidate.id === player.id)
    if (playerIndex < 0) return { type: 'fail', errorKey: 'special action unavailable' }

    const result = applyMoorSpecialAction(
      state,
      playerIndex,
      parsed.cardId,
      parsed.actionId,
      parsed.payload,
    )
    if (!result.ok) return { type: 'fail', errorKey: result.error }

    const listenerFlows = runCardListeners({
      state,
      player,
      space: createMoorSpecialActionSpace(parsed.actionId),
      actionId: parsed.actionId,
      phase: 'after',
      result: { type: 'ok' },
      extraData: {
        specialActionCardId: parsed.cardId,
        payload: parsed.payload,
      },
    }, undefined, { stampFlowOwner: true })
      .map((entry) => entry.flow)
      .filter((flow): flow is ActionFlow => !!flow)
    const followUpFlow = combineFlows([
      ...listenerFlows,
      ...(result.followUpFlow ? [result.followUpFlow] : []),
    ])
    return followUpFlow ? { type: 'flow', flow: followUpFlow } : { type: 'ok' }
  },
}
