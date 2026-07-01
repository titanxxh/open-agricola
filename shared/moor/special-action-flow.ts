import type {
  ActionChoiceOption,
  ActionDefinition,
  ActionFlow,
  ChoiceDescriptionPreview,
  GameState,
  PlayerState,
} from '../contract/types'
import {
  executeCardListener,
  getListenerById,
  getMatchingListeners,
  runCardListeners,
  type CardListenerContextInput,
  type CardListenerOwnerOptions,
  type CardListenerZone,
} from '../cards/card-listeners'
import {
  applyMoorSpecialActionEffect,
  applyMoorSpecialAction,
  createMoorSpecialActionSpace,
  isMoorSpecialActionId,
  isMoorSpecialActionCardUsableByPlayer,
  validateMoorSpecialAction,
  validateMoorSpecialActionEffect,
  type MoorSpecialActionPayload,
} from './special-actions'
import type { MoorSpecialActionId } from './types'

export const MOOR_SPECIAL_ACTION_APPLY_ACTION_ID = 'moor-special-action-apply'
export const MOOR_SPECIAL_ACTION_CHOICE_ACTION_ID = 'moor-special-action-choice'
export const MOOR_SPECIAL_ACTION_AFTER_LISTENERS_ACTION_ID = 'moor-special-action-after-listeners'

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

type AfterSpecialActionListenerSnapshot = {
  listenerId: string
  ownerPlayerId?: string
  ownerCardId?: string
  ownerCardZone?: CardListenerZone
}

const readParams = (params?: Record<string, unknown>) => {
  const cardId = params?.cardId
  const actionId = params?.actionId
  if (typeof cardId !== 'string' || typeof actionId !== 'string') return null
  if (!isMoorSpecialActionId(actionId)) return null
  return {
    cardId,
    actionId,
    payload: (params?.payload ?? {}) as MoorSpecialActionPayload,
  }
}

const readActionIds = (actionContext?: Record<string, unknown>): MoorSpecialActionId[] => {
  const actionIds = actionContext?.actionIds
  if (!Array.isArray(actionIds)) return [...MOOR_SPECIAL_ACTION_IDS]
  return actionIds.filter((actionId): actionId is MoorSpecialActionId =>
    typeof actionId === 'string' && isMoorSpecialActionId(actionId),
  )
}

const optionLabel = (actionId: MoorSpecialActionId) => `moor.specialActions.${actionId}`

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

const cardActionChoiceValue = (
  cardId: string,
  actionId: MoorSpecialActionId,
  payload: MoorSpecialActionPayload,
) => `card-action:${cardId}:${actionChoiceValue(actionId, payload)}`

const cardActionChoices = (
  state: GameState,
  player: PlayerState,
  actionContext?: Record<string, unknown>,
): CardActionChoice[] => {
  const playerIndex = state.players.indexOf(player)
  if (playerIndex < 0) return []
  const allowed = new Set(readActionIds(actionContext))
  return (state.farmersOfTheMoor?.specialActionCards ?? []).flatMap((card) => {
    if (!isMoorSpecialActionCardUsableByPlayer(card, player.id)) return []
    return card.actions.flatMap((actionId) => {
      if (!allowed.has(actionId)) return []
      return tilePayloads(player, actionId).flatMap((payload) => {
        const validation = validateMoorSpecialAction(state, playerIndex, card.id, actionId, payload)
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
  const owner = choice.cardLocationPlayerId
    ? state.players.find((candidate) => candidate.id === choice.cardLocationPlayerId)
    : undefined
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
  choice: CardActionChoice,
): ChoiceDescriptionPreview => ({
  kind: 'group',
  separator: ' · ',
  parts: [
    { kind: 'action', labelKey: optionLabel(choice.actionId) },
    cardActionChoiceMetaPreview(state, choice),
  ],
})

const takeCardActionOptions = (
  state: GameState,
  player: PlayerState,
  actionContext?: Record<string, unknown>,
): ActionChoiceOption[] =>
  cardActionChoices(state, player, actionContext).map((choice) => ({
    value: choice.value,
    labelKey: optionLabel(choice.actionId),
    labelParams: cardActionChoiceLabelParams(state, choice),
    descriptionPreview: cardActionChoiceDescriptionPreview(state, choice),
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
): boolean =>
  choiceMode(actionContext) === 'take-card'
    ? takeCardOptions(state, player).length > 0
    : choiceMode(actionContext) === 'take-card-action'
      ? cardActionChoices(state, player, actionContext).length > 0
      : actionChoices(state, player, actionContext).length > 0

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
  if (card.location.kind === 'market') {
    card.location = { kind: 'playerFaceUp', playerId: player.id }
    return { type: 'ok' as const }
  }
  if (player.resources.food < 2) return { type: 'fail' as const, errorKey: 'not enough food' }
  player.resources.food -= 2
  card.location = { kind: 'playerFaceDown', playerId: player.id }
  return { type: 'ok' as const }
}

const runAfterSpecialActionListenersNow = (
  state: GameState,
  player: PlayerState,
  actionId: MoorSpecialActionId,
  payload: MoorSpecialActionPayload,
  terrainCleared?: boolean,
  snapshots?: readonly AfterSpecialActionListenerSnapshot[],
) => {
  const context = {
    state,
    player,
    space: createMoorSpecialActionSpace(actionId),
    actionId,
    phase: 'after',
    result: { type: 'ok' },
    extraData: {
      payload,
      ...(terrainCleared === false ? { terrainCleared: false } : {}),
    },
  } satisfies CardListenerContextInput
  const listenerFlows = snapshots
    ? snapshots.flatMap((snapshot) => {
      const registration = getListenerById(snapshot.listenerId)
      if (!registration) return []
      const owner: CardListenerOwnerOptions = {
        ownerPlayerId: snapshot.ownerPlayerId,
        ownerCardId: snapshot.ownerCardId,
        ownerCardZone: snapshot.ownerCardZone,
      }
      const flow = executeCardListener(registration, context, owner)?.flow
      if (!flow) return []
      return snapshot.ownerPlayerId && !flow.targetPlayerId
        ? [{ ...flow, targetPlayerId: snapshot.ownerPlayerId }]
        : [flow]
    })
    : runCardListeners(context, undefined, { stampFlowOwner: true }).map((entry) => entry.flow)
    .filter((flow): flow is ActionFlow => !!flow)
  return combineFlows(listenerFlows)
}

const afterSpecialActionListenersLeaf = (
  actionId: MoorSpecialActionId,
  payload: MoorSpecialActionPayload,
  terrainCleared: boolean | undefined,
  snapshots: readonly AfterSpecialActionListenerSnapshot[],
): ActionFlow => ({
  type: 'leaf',
  actionId: MOOR_SPECIAL_ACTION_AFTER_LISTENERS_ACTION_ID,
  actionContext: { actionId, payload, terrainCleared, snapshots },
})

const snapshotAfterSpecialActionListeners = (
  state: GameState,
  player: PlayerState,
  actionId: MoorSpecialActionId,
  payload: MoorSpecialActionPayload,
): AfterSpecialActionListenerSnapshot[] =>
  getMatchingListeners({
    state,
    player,
    space: createMoorSpecialActionSpace(actionId),
    actionId,
    phase: 'after',
    result: { type: 'ok' },
    extraData: { payload },
  }).map((entry) => ({
    listenerId: entry.registration.id,
    ...(entry.ownerPlayerId ? { ownerPlayerId: entry.ownerPlayerId } : {}),
    ...(entry.cardId ? { ownerCardId: entry.cardId } : {}),
    ...(entry.ownerCardZone ? { ownerCardZone: entry.ownerCardZone } : {}),
  }))

const runAfterSpecialActionListeners = (
  state: GameState,
  player: PlayerState,
  actionId: MoorSpecialActionId,
  payload: MoorSpecialActionPayload,
  result: { followUpFlow?: ActionFlow; terrainCleared?: boolean },
) => {
  if (result.followUpFlow) {
    const snapshots = snapshotAfterSpecialActionListeners(state, player, actionId, payload)
    return combineFlows([
      result.followUpFlow,
      afterSpecialActionListenersLeaf(actionId, payload, result.terrainCleared, snapshots),
    ])
  }
  return runAfterSpecialActionListenersNow(state, player, actionId, payload, result.terrainCleared)
}

const buildSpecialActionCardActionFlow = (
  state: GameState,
  player: PlayerState,
  cardId: string,
  actionId: MoorSpecialActionId,
  payload: MoorSpecialActionPayload,
): ActionFlow => {
  const beforeFlows = runCardListeners({
    state,
    player,
    space: createMoorSpecialActionSpace(actionId),
    actionId,
    phase: 'before',
    extraData: { specialActionCardId: cardId, payload },
  }, undefined, { stampFlowOwner: true })
    .map((entry) => entry.flow)
    .filter((flow): flow is ActionFlow => !!flow)
  const applyFlow: ActionFlow = {
    type: 'leaf',
    actionId: MOOR_SPECIAL_ACTION_APPLY_ACTION_ID,
    params: { cardId, actionId, payload },
  }
  return combineFlows([...beforeFlows, applyFlow]) ?? applyFlow
}

export const moorSpecialActionAfterListenersAction: ActionDefinition = {
  id: MOOR_SPECIAL_ACTION_AFTER_LISTENERS_ACTION_ID,
  nameKey: 'actions.special-effect.name',
  descriptionKey: 'actions.special-effect.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ state, player, actionContext }) => {
    const actionId = actionContext?.actionId
    if (typeof actionId !== 'string' || !isMoorSpecialActionId(actionId)) {
      return { type: 'ok' }
    }
    const payload = (actionContext?.payload ?? {}) as MoorSpecialActionPayload
    const terrainCleared = actionContext?.terrainCleared
    const snapshots = Array.isArray(actionContext?.snapshots)
      ? actionContext.snapshots as AfterSpecialActionListenerSnapshot[]
      : undefined
    const followUpFlow = runAfterSpecialActionListenersNow(
      state,
      player,
      actionId,
      payload,
      typeof terrainCleared === 'boolean' ? terrainCleared : undefined,
      snapshots,
    )
    return followUpFlow ? { type: 'flow', flow: followUpFlow } : { type: 'ok' }
  },
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
    const mode = choiceMode(actionContext)
    const options = mode === 'take-card'
      ? takeCardOptions(state, player)
      : mode === 'take-card-action'
        ? takeCardActionOptions(state, player, actionContext)
        : takeActionOptions(state, player, actionContext)
    if (options.length === 0) return { type: 'fail', errorKey: 'special action unavailable' }
    return {
      type: 'request',
      request: { kind: 'choice', options },
      promptKey: 'ui.interactionFlowSelect',
    }
  },
  resolveChoice: ({ state, player, actionContext, eventSink }, choice) => {
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
      const validation = validateMoorSpecialAction(state, playerIndex, parsed.cardId, parsed.actionId, parsed.payload)
      if (!validation.ok) return { type: 'fail', errorKey: validation.error }
      return {
        type: 'flow',
        flow: buildSpecialActionCardActionFlow(state, player, parsed.cardId, parsed.actionId, parsed.payload),
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
    const result = applyMoorSpecialActionEffect(state, playerIndex, parsed.actionId, parsed.payload, eventSink)
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
  execute: ({ state, player, params, eventSink }) => {
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
      eventSink,
    )
    if (!result.ok) return { type: 'fail', errorKey: result.error }

    const followUpFlow = runAfterSpecialActionListeners(state, player, parsed.actionId, parsed.payload, result)
    return followUpFlow ? { type: 'flow', flow: followUpFlow } : { type: 'ok' }
  },
}
