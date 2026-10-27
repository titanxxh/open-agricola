import { createMoorSpecialActionSpace } from './special-action-space'
import { createTriggerSnapshot } from '../cards/helpers/trigger-snapshot'
import { planListenerOwnerGroups } from '../engine/matched-trigger'
import type { ActivateCardActionParams } from '../engine/activation-action'
import type { ActionHookRegistry } from '../actions/hooks'
import type {
  ActionChoiceOption,
  ActionDefinition,
  ActionExecutionResult,
  ActionFlow,
  ChoiceDescriptionPreview,
  GameState,
  PlayerState,
  Resource,
} from '../contract/types'
import { improvementAction } from '../actions/effects/improvement'
import { getMoorSpecialActionEffectPlan, MOOR_SPECIAL_ACTION_BORROW_FOOD, moorSpecialActionBorrowCost } from './special-action-plan'
import {
  getMatchingListeners,
  type CardListenerContextInput,
} from '../cards/card-listeners'
import {
  applyMoorSpecialActionEffect,
  applyMoorSpecialAction,
  isMoorSpecialActionId,
  isMoorSpecialActionCardUsableByPlayer,
  validateMoorTerrainActionEffect,
  validateMoorSpecialAction,
  validateMoorSpecialActionEffect,
  type MoorSpecialActionPayload,
} from './special-actions'
import type { MoorActionContext } from './completion-types'
import type { MoorSpecialActionId } from './types'
import { findPlayerById, findPlayerIndexById } from '../domain/player'

export const MOOR_SPECIAL_ACTION_APPLY_ACTION_ID = 'moor-special-action-apply'
export const MOOR_SPECIAL_ACTION_CHOICE_ACTION_ID = 'moor-special-action-choice'

const MOOR_SPECIAL_ACTION_IDS: MoorSpecialActionId[] = [
  'cut-peat',
  'fell-trees',
  'slash-and-burn',
  'hiring-fair',
  'horse-market',
  'black-market',
  'illicit-work',
]

const combineFlows = (flows: ActionFlow[]): ActionFlow | undefined => {
  if (flows.length === 0) return undefined
  if (flows.length === 1) return flows[0]
  return { type: 'seq', children: flows }
}

const readParams = (params?: Record<string, unknown>) => {
  const actionId = params?.actionId
  if (typeof actionId !== 'string' || !isMoorSpecialActionId(actionId)) return null
  const base = { actionId, payload: (params?.payload ?? {}) as MoorSpecialActionPayload }
  if (params?.mode === 'effect') return { kind: 'granted' as const, ...base }
  const cardId = params?.cardId
  return typeof cardId === 'string' ? { kind: 'card' as const, cardId, ...base } : null
}

const readActionIds = (actionContext?: Record<string, unknown>): MoorSpecialActionId[] => {
  const actionIds = actionContext?.actionIds
  if (!Array.isArray(actionIds)) return [...MOOR_SPECIAL_ACTION_IDS]
  return actionIds.filter((actionId): actionId is MoorSpecialActionId =>
    typeof actionId === 'string' && isMoorSpecialActionId(actionId),
  )
}

const optionLabel = (actionId: MoorSpecialActionId) => `moor.specialActions.${actionId}`

const describeMoorSpecialActionEffect = (
  state: GameState,
  player: PlayerState,
  actionId: MoorSpecialActionId,
  payload: MoorSpecialActionPayload,
  cardId?: string,
  previewMode?: 'base',
  actionHooks?: ActionHookRegistry,
): ChoiceDescriptionPreview => {
  const plan = getMoorSpecialActionEffectPlan(state, player, actionId, payload)
  const cost = { ...plan.cost }
  const borrow = moorSpecialActionBorrowCost(state, cardId)
  if (borrow.food) cost.food = (cost.food ?? 0) + borrow.food
  const parts: ChoiceDescriptionPreview[] = []
  if (Object.values(cost).some(amount => (amount ?? 0) > 0)) parts.push({ kind: 'action', showLabel: false, labelKey: 'actions.pay.name', effectPreview: { kind: 'payment', resourcesPaid: cost } })
  if (plan.terrain) parts.push({ kind: 'action', showLabel: false, labelKey: optionLabel(actionId), effectPreview: {
    kind: 'terrainOperation', operation: plan.terrain.operation, from: plan.terrain.from,
    ...(plan.terrain.operation === 'replace-with-field' ? { to: 'field' } : {}),
    minSelections: 1, maxSelections: 1, visibleLayerOnly: plan.terrain.visibleLayerOnly,
    requiresUncovered: plan.terrain.requiresUncovered, adjacentFieldRequiredWhenPresent: plan.terrain.adjacentFieldRequiredWhenPresent,
    ...(Object.values(plan.gain).some(amount => (amount ?? 0) > 0) ? { gainPerSelection: plan.gain } : {}),
  } })
  else if (Object.values(plan.gain).some(amount => (amount ?? 0) > 0)) parts.push({ kind: 'action', showLabel: false, labelKey: 'actions.gain.name', effectPreview: { kind: 'resourceExchange', resourcesGained: plan.gain } })
  if (plan.improvementTypes) {
    // This declared plan spends its fee before the improvement choice. Project
    // only that known resource payment; do not execute actions or timing hooks.
    const nextPlayer = { ...player, resources: { ...player.resources } }
    for (const [raw, amount] of Object.entries(cost)) if (amount && amount > 0) {
      const resource = raw as keyof Resource
      nextPlayer.resources[resource] = (nextPlayer.resources[resource] ?? 0) - amount
    }
    const nextState = { ...state, players: state.players.map(candidate => candidate.id === player.id ? nextPlayer : candidate) }
    const effectPreview = improvementAction.previewEffect?.({ actionHooks, state: nextState, player: nextPlayer, space: createMoorSpecialActionSpace(actionId), actionContext: { types: [...plan.improvementTypes] }, previewMode })
    parts.push({ kind: 'action', labelKey: 'actions.improvement.name', effectPreview })
  }
  return { kind: 'group', operator: 'sequence', separator: ' → ', parts }
}

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
      return card.location.kind === 'market' || player.resources.food >= MOOR_SPECIAL_ACTION_BORROW_FOOD
    })
    .map((card) => ({
      value: `card:${card.id}`,
      labelKey: optionLabel(card.actions[0]!),
      effectPreview: { kind: 'payment', resourcesPaid: moorSpecialActionBorrowCost(state, card.id) },
    }))

export const hasMoorSpecialActionCardChoice = (
  state: GameState,
  player: PlayerState,
): boolean => takeCardOptions(state, player).length > 0

type ActionChoice = {
  value: string
  actionId: MoorSpecialActionId
  payload: MoorSpecialActionPayload
}

type CardActionChoice = ActionChoice & {
  cardId: string
  cardLocationKind: 'market' | 'playerFaceUp'
  cardLocationPlayerId?: string
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
  actionHooks?: ActionHookRegistry,
): ActionChoice[] => {
  const playerIndex = state.players.indexOf(player)
  if (playerIndex < 0) return []
  return readActionIds(actionContext).flatMap((actionId) =>
    tilePayloads(player, actionId).flatMap((payload) => {
      const validation = validateMoorSpecialActionEffect(state, playerIndex, actionId, payload, actionHooks)
      if (!validation.ok) return []
      return [{ value: actionChoiceValue(actionId, payload), actionId, payload }]
    }),
  )
}

export const hasMoorTerrainActionChoice = (
  state: GameState,
  player: PlayerState,
  actionId: MoorSpecialActionId,
): boolean => {
  const playerIndex = state.players.indexOf(player)
  return playerIndex >= 0 && tilePayloads(player, actionId).some((payload) =>
    validateMoorTerrainActionEffect(state, playerIndex, actionId, payload).ok,
  )
}

const takeActionOptions = (
  state: GameState,
  player: PlayerState,
  actionContext?: Record<string, unknown>,
  actionHooks?: ActionHookRegistry,
): ActionChoiceOption[] =>
  actionChoices(state, player, actionContext, actionHooks).map((choice) => ({
    value: choice.value,
    labelKey: optionLabel(choice.actionId),
    descriptionPreview: describeMoorSpecialActionEffect(state, player, choice.actionId, choice.payload, undefined, undefined, actionHooks),
  }))

const cardActionChoiceValue = (
  cardId: string,
  actionId: MoorSpecialActionId,
  payload: MoorSpecialActionPayload,
) => `card-action:${cardId}:${actionChoiceValue(actionId, payload)}`

const cardActionChoices = (
  state: GameState,
  player: PlayerState,
  actionContext?: Record<string, unknown>,
  actionHooks?: ActionHookRegistry,
): CardActionChoice[] => {
  const playerIndex = state.players.indexOf(player)
  if (playerIndex < 0) return []
  const allowed = new Set(readActionIds(actionContext))
  return (state.farmersOfTheMoor?.specialActionCards ?? []).flatMap((card) => {
    if (!isMoorSpecialActionCardUsableByPlayer(card, player.id)) return []
    return card.actions.flatMap((actionId) => {
      if (!allowed.has(actionId)) return []
      return tilePayloads(player, actionId).flatMap((payload) => {
        const validation = validateMoorSpecialAction(state, playerIndex, card.id, actionId, payload, actionHooks)
        if (!validation.ok) return []
        return [{
          value: cardActionChoiceValue(card.id, actionId, payload),
          cardId: card.id,
          cardLocationKind: card.location.kind === 'playerFaceUp' ? 'playerFaceUp' : 'market',
          ...(card.location.kind === 'playerFaceUp' ? { cardLocationPlayerId: card.location.playerId } : {}),
          actionId,
          payload,
        }]
      })
    })
  })
}

const cardActionChoiceTileParams = (choice: CardActionChoice): Record<string, unknown> => {
  const tile = choice.payload.tile
  return tile ? { row: tile.row, col: tile.col } : {}
}

const cardActionChoiceLabelParams = (
  state: GameState,
  choice: CardActionChoice,
): Record<string, unknown> => {
  const owner = findPlayerById(state, choice.cardLocationPlayerId)
  return {
    card: choice.cardId,
    location: choice.cardLocationKind,
    ...(owner ? { player: owner.name } : {}),
    ...cardActionChoiceTileParams(choice),
  }
}

const cardActionChoiceMetaPreview = (
  state: GameState,
  choice: CardActionChoice,
): ChoiceDescriptionPreview => {
  const hasTile = !!choice.payload.tile
  const borrowed = choice.cardLocationKind === 'playerFaceUp'
  return {
    kind: 'action',
    labelKey: borrowed
      ? hasTile ? 'moor.specialActions.cardChoiceBorrowedTile' : 'moor.specialActions.cardChoiceBorrowed'
      : hasTile ? 'moor.specialActions.cardChoiceMarketTile' : 'moor.specialActions.cardChoiceMarket',
    labelParams: cardActionChoiceLabelParams(state, choice),
  }
}

const cardActionChoiceDescriptionPreview = (
  state: GameState,
  player: PlayerState,
  choice: CardActionChoice,
  actionHooks?: ActionHookRegistry,
): ChoiceDescriptionPreview => ({
  kind: 'group',
  operator: 'sequence',
  separator: ' · ',
  parts: [
    describeMoorSpecialActionEffect(state, player, choice.actionId, choice.payload, choice.cardId, undefined, actionHooks),
    cardActionChoiceMetaPreview(state, choice),
  ],
})

const takeCardActionOptions = (
  state: GameState,
  player: PlayerState,
  actionContext?: Record<string, unknown>,
  actionHooks?: ActionHookRegistry,
): ActionChoiceOption[] =>
  cardActionChoices(state, player, actionContext, actionHooks).map((choice) => ({
    value: choice.value,
    labelKey: optionLabel(choice.actionId),
    labelParams: cardActionChoiceLabelParams(state, choice),
    descriptionPreview: cardActionChoiceDescriptionPreview(state, player, choice, actionHooks),
  }))

const choiceMode = (actionContext?: Record<string, unknown>) => {
  if (actionContext?.mode === 'take-card') return 'take-card'
  if (actionContext?.mode === 'take-card-action') return 'take-card-action'
  return 'take-action'
}

export const hasMoorSpecialActionChoice = (
  state: GameState,
  player: PlayerState,
  actionContext?: Record<string, unknown>,
  actionHooks?: ActionHookRegistry,
): boolean =>
  choiceMode(actionContext) === 'take-card'
    ? takeCardOptions(state, player).length > 0
    : choiceMode(actionContext) === 'take-card-action'
      ? cardActionChoices(state, player, actionContext, actionHooks).length > 0
      : actionChoices(state, player, actionContext, actionHooks).length > 0

const parseActionChoice = (value: string): { actionId: MoorSpecialActionId; payload: MoorSpecialActionPayload } | null => {
  const parts = value.split(':')
  if (parts[0] !== 'action') return null
  const actionId = parts[1]
  if (!actionId || !isMoorSpecialActionId(actionId)) return null
  if (parts.length === 4) {
    const row = Number(parts[2])
    const col = Number(parts[3])
    if (!Number.isFinite(row) || !Number.isFinite(col)) return null
    return { actionId, payload: { tile: { row, col } } }
  }
  return { actionId, payload: {} }
}

const parseCardActionChoice = (value: string): CardActionChoice | null => {
  const prefix = 'card-action:'
  if (!value.startsWith(prefix)) return null
  const parts = value.slice(prefix.length).split(':')
  const cardId = parts.shift()
  if (!cardId) return null
  const parsed = parseActionChoice(parts.join(':'))
  if (!parsed) return null
  return {
    value,
    cardId,
    cardLocationKind: 'market',
    actionId: parsed.actionId,
    payload: parsed.payload,
  }
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
  if (state.players.length === 1) return { type: 'ok' as const }
  if (card.location.kind === 'market') {
    card.location = { kind: 'playerFaceUp', playerId: player.id }
    return { type: 'ok' as const }
  }
  const cost = moorSpecialActionBorrowCost(state, cardId)
  if (player.resources.food < (cost.food ?? 0)) return { type: 'fail' as const, errorKey: 'not enough food' }
  player.resources.food -= cost.food ?? 0
  card.location = { kind: 'playerFaceDown', playerId: player.id }
  return { type: 'ok' as const }
}

/** Called only after selecting and validating the concrete action and target. */
export const buildMoorSpecialActionFlow = (entry: {
  state: GameState
  player: PlayerState
  actionId: MoorSpecialActionId
  payload?: MoorSpecialActionPayload
  actionHooks: ActionHookRegistry | undefined
  sourceCard?: string
} & ({ kind: 'card'; cardId: string } | { kind: 'granted' })): ActionFlow => {
  const { state, player, actionId, payload = {}, actionHooks } = entry
  const cardId = entry.kind === 'card' ? entry.cardId : undefined
  const moorAction: MoorActionContext = { actionId, playerId: player.id, payload, specialActionCardId: cardId, phase: 'before' }
  const beforeContext = {
    actionHooks, state, player, space: createMoorSpecialActionSpace(actionId),
    actionId: 'moor-action', moorAction, phase: 'before',
  } satisfies CardListenerContextInput
  const groups = planListenerOwnerGroups(getMatchingListeners(beforeContext), state, player.id)
  const beforeFlows: ActionFlow[] = groups.map(({ ownerPlayerId, listeners }) => {
    const children: ActionFlow[] = listeners.map(entry => {
      const params: ActivateCardActionParams = {
        listenerId: entry.registration.id, cardId: entry.cardId,
        phase: 'before', actionId: 'moor-action', moorAction, triggerPlayerId: player.id,
        ownerPlayerId: entry.ownerPlayerId, ownerCardZone: entry.ownerCardZone,
        mandatory: entry.registration.mandatory === true,
        event: {},
      }
      return { type: 'leaf', actionId: 'activate-card', sourceCard: entry.cardId,
        targetPlayerId: ownerPlayerId, params }
    })
    return children.length === 1 ? children[0]!
      : { type: 'parallel', mode: 'trigger-select', targetPlayerId: ownerPlayerId,
        children }
  })
  const applyFlow: ActionFlow = {
    type: 'leaf', actionId: MOOR_SPECIAL_ACTION_APPLY_ACTION_ID, sourceCard: entry.sourceCard,
    params: { ...(entry.kind === 'card' ? { cardId: entry.cardId } : { mode: 'effect' }), actionId, payload },
  }
  return combineFlows([...beforeFlows, applyFlow]) ?? applyFlow
}

export const moorSpecialActionChoiceAction: ActionDefinition = {
  id: MOOR_SPECIAL_ACTION_CHOICE_ACTION_ID,
  nameKey: 'actions.moor-special-action-choice.name',
  descriptionKey: 'actions.moor-special-action-choice.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: (state, player, context) =>
    hasMoorSpecialActionChoice(state, player, context?.actionContext, context?.actionHooks),
  execute: ({ state, player, actionContext, actionHooks }) => {
    const mode = choiceMode(actionContext)
    const options = mode === 'take-card'
      ? takeCardOptions(state, player)
      : mode === 'take-card-action'
        ? takeCardActionOptions(state, player, actionContext, actionHooks)
        : takeActionOptions(state, player, actionContext, actionHooks)
    if (options.length === 0) return { type: 'fail', errorKey: 'special action unavailable' }
    return {
      type: 'request',
      request: { kind: 'choice', options },
      promptKey: 'ui.interactionFlowSelect',
    }
  },
  resolveChoice: ({ state, player, actionContext, sourceCard, actionHooks }, choice) => {
    const mode = choiceMode(actionContext)
    if (mode === 'take-card') {
      return takeSpecialActionCard(state, player, choice)
    }
    if (mode === 'take-card-action') {
      const parsed = parseCardActionChoice(choice)
      if (!parsed) return { type: 'fail', errorKey: 'special action unavailable' }
      const allowed = readActionIds(actionContext)
      if (!allowed.includes(parsed.actionId)) {
        return { type: 'fail', errorKey: 'special action unavailable' }
      }
      const playerIndex = state.players.indexOf(player)
      if (playerIndex < 0) return { type: 'fail', errorKey: 'special action unavailable' }
      const validation = validateMoorSpecialAction(state, playerIndex, parsed.cardId, parsed.actionId, parsed.payload, actionHooks)
      if (!validation.ok) return { type: 'fail', errorKey: validation.error }
      return {
        type: 'flow',
        flow: buildMoorSpecialActionFlow({ kind: 'card', state, player, cardId: parsed.cardId, actionId: parsed.actionId, payload: parsed.payload, sourceCard, actionHooks }),
      }
    }
    const parsed = parseActionChoice(choice)
    if (!parsed) return { type: 'fail', errorKey: 'special action unavailable' }
    const allowed = readActionIds(actionContext)
    if (!allowed.includes(parsed.actionId)) {
      return { type: 'fail', errorKey: 'special action unavailable' }
    }
    const playerIndex = state.players.indexOf(player)
    if (playerIndex < 0) return { type: 'fail', errorKey: 'special action unavailable' }
    const validation = validateMoorSpecialActionEffect(state, playerIndex, parsed.actionId, parsed.payload, actionHooks)
    if (!validation.ok) return { type: 'fail', errorKey: validation.error }
    return { type: 'flow', flow: buildMoorSpecialActionFlow({
      kind: 'granted', state, player, actionId: parsed.actionId, payload: parsed.payload, sourceCard, actionHooks,
    }) }
  },
}

export const moorSpecialActionApplyAction: ActionDefinition = {
  id: MOOR_SPECIAL_ACTION_APPLY_ACTION_ID,
  nameKey: 'actions.moor-special-action-apply.name',
  descriptionKey: 'actions.moor-special-action-apply.description',
  roundAvailable: 1,
  gainPerRound: {},
  previewEffect: ({ state, player, params, previewMode, actionHooks }) => {
    const parsed = readParams(params)
    return parsed ? { kind: 'rule', description: describeMoorSpecialActionEffect(state, player, parsed.actionId, parsed.payload, parsed.kind === 'card' ? parsed.cardId : undefined, previewMode, actionHooks) } : undefined
  },
  canBeExecutedByPlayer: () => true,
  execute: ({ state, player, params, eventSink, actionHooks }) => {
    const parsed = readParams(params)
    if (!parsed) return { type: 'fail', errorKey: 'special action unavailable' }
    const playerIndex = findPlayerIndexById(state, player.id)
    if (playerIndex < 0) return { type: 'fail', errorKey: 'special action unavailable' }

    const result = parsed.kind === 'card'
      ? applyMoorSpecialAction(state, playerIndex, parsed.cardId, parsed.actionId, parsed.payload, eventSink, actionHooks)
      : applyMoorSpecialActionEffect(state, playerIndex, parsed.actionId, parsed.payload, eventSink, actionHooks)
    if (!result.ok) return { type: 'fail', errorKey: result.error }

    const completionResult: Extract<ActionExecutionResult, { type: 'ok' }> = {
      type: 'ok', ...(result.farmOperation ? { farmOperations: [result.farmOperation] } : {}),
    }
    const moorAction: Extract<MoorActionContext, { phase: 'after' }> = {
      actionId: parsed.actionId, playerId: player.id,
      specialActionCardId: parsed.kind === 'card' ? parsed.cardId : undefined,
      payload: parsed.payload, phase: 'after', result: completionResult, terrainCleared: result.terrainCleared,
    }
    const sources = getMatchingListeners({
      actionHooks, state, player, space: createMoorSpecialActionSpace(parsed.actionId),
      actionId: 'moor-action', moorAction, phase: 'after', result: completionResult,
      actionEvents: result.terrainEvent ? [result.terrainEvent] : [],
    }).map(entry => entry.ownerCardZone
      ? { listenerId: entry.registration.id, ownerPlayerId: entry.ownerPlayerId, cardId: entry.cardId, ownerCardZone: entry.ownerCardZone }
      : { listenerId: entry.registration.id, ownerPlayerId: '' as const, cardId: '' as const })
    return { type: 'flow', flow: {
      type: 'seq', children: [
        ...(result.followUpFlow ? [result.followUpFlow] : []),
        ...(parsed.kind === 'card' && state.players.length === 1
          ? [{ type: 'leaf' as const, actionId: 'moor-solo-retention', params: { cardId: parsed.cardId }, completionBarrier: true as const }] : []),
      ],
      moorCompletion: { actionId: parsed.actionId, specialActionCardId: parsed.kind === 'card' ? parsed.cardId : undefined, payload: parsed.payload, playerId: player.id,
        result: completionResult, terrainCleared: result.terrainCleared, terrainEvent: result.terrainEvent, sources,
        triggerSnapshot: createTriggerSnapshot(state) },
    } }
  },
}
