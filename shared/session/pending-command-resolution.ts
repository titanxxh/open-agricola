import type {
  FarmTilePosition,
  GameState,
  InteractionRequest,
  PlayerState,
  Resource,
  ResourceBatchExchangePayload,
} from '../contract/types'
import type { PendingEnvelope, PendingView } from '../engine/types'
import {
  isPendingChoiceValueAllowed,
  pendingEnvelopeChoices,
} from '../engine/pending-validation'
import { isProtectedActionCancel } from '../engine/protected-action-cancel'
import { validateSelectionEffect } from '../actions/helpers/selection-effect-registry'
import { positionKey } from '../domain/farm'
import { getUsedFarmyardTileKeys } from '../domain/farmyard-usage'
import { playerBoard } from '../domain'
import { interactionSubmitChannel } from './interaction-command-policy'

export type FeedSelection = {
  count: number
  sourceName?: string
  sourceId: string
  exchangeIndex: number
}

export type FeedSelections = FeedSelection[]

type SowSelectionPayload = {
  row: number
  col: number
  crop: 'grain' | 'vegetable' | 'wood' | 'stone'
}

export type SelectionCommitPayload = {
  cancel?: boolean
  positions?: FarmTilePosition[]
  cardIds?: string[]
  resourceCounts?: Partial<Record<keyof Resource, number>>
  resourceBatchExchange?: ResourceBatchExchangePayload
  edges?: string[]
  palisadeEdges?: string[]
  extraWood?: number
  fenceSources?: Record<string, string>
  rooms?: FarmTilePosition[]
  stables?: FarmTilePosition[]
  farmHand?: FarmTilePosition
  tile?: FarmTilePosition
  crops?: SowSelectionPayload[]
}

type Failure = { ok: false; error: string }

export type ResolveChoiceSubmissionPlan =
  | Failure
  | { ok: true; kind: 'confirm-next-player'; nextPlayerIndex: number }
  | { ok: true; kind: 'confirm-player-switch'; fromPlayerIndex: number; toPlayerIndex: number }
  | { ok: true; kind: 'feed'; selections: FeedSelections }
  | { ok: true; kind: 'heating'; payload: Record<string, unknown> | undefined }
  | { ok: true; kind: 'engine-choice' }

export type ResolveChoiceSubmissionInput = {
  envelope: PendingEnvelope
  view: PendingView
  pendingActionId?: string
  value: string
  payload?: Record<string, unknown> | unknown[]
  isFarmPrompt: boolean
  isSelectionPrompt: boolean
}

const feedSelectionsFromPayload = (
  payload: ResolveChoiceSubmissionInput['payload'],
): FeedSelections => {
  if (Array.isArray(payload)) return payload as FeedSelections
  if (payload && typeof payload === 'object' && Array.isArray((payload as { selections?: unknown }).selections)) {
    return (payload as { selections: FeedSelections }).selections
  }
  return []
}

export const planResolveChoiceSubmission = (
  input: ResolveChoiceSubmissionInput,
): ResolveChoiceSubmissionPlan => {
  const { envelope, view, value, payload } = input
  const request = view.request
  const protectedDirectCancel = isProtectedActionCancel(input.pendingActionId, value)
  if (!protectedDirectCancel && !isPendingChoiceValueAllowed(envelope, value)) {
    const disabled = pendingEnvelopeChoices(envelope)
      .some((option) => option.value === value && option.disabled === true)
    if (disabled && String(view.promptKey) === 'cards.B003_Moonshine.choice') {
      return { ok: false, error: 'choice disabled' }
    }
    return { ok: false, error: 'invalid choice value' }
  }
  if (request.kind === 'choice' && (input.isFarmPrompt || input.isSelectionPrompt)) {
    return { ok: false, error: 'use commitSelectionChoice for selection' }
  }

  const submitChannel = interactionSubmitChannel(request.kind)
  if (submitChannel === 'commitSelection') {
    if (request.kind === 'farm-select' || request.kind === 'selection') {
      return { ok: false, error: 'use commitSelectionChoice for selection' }
    }
    return { ok: false, error: `use commitSelectionChoice for ${request.kind}` }
  }
  if (submitChannel === 'none') {
    if (request.kind === 'card-draft') {
      return { ok: false, error: 'card-draft resolveChoice not supported' }
    }
    if (request.kind === 'engine-blocked') {
      return { ok: false, error: 'engine-blocked cannot resolve' }
    }
  }

  switch (request.kind) {
    case 'confirm-next-player':
      return { ok: true, kind: 'confirm-next-player', nextPlayerIndex: request.nextPlayerIndex }
    case 'confirm-player-switch':
      return {
        ok: true,
        kind: 'confirm-player-switch',
        fromPlayerIndex: request.fromPlayerIndex,
        toPlayerIndex: request.toPlayerIndex,
      }
    case 'feed':
      return { ok: true, kind: 'feed', selections: feedSelectionsFromPayload(payload) }
    case 'heating':
      return { ok: true, kind: 'heating', payload: payload as Record<string, unknown> | undefined }
    case 'animal-reorg':
    case 'choice':
    case 'select-trigger':
      return { ok: true, kind: 'engine-choice' }
    case 'farm-select':
    case 'selection':
    case 'resource-quantity-select':
    case 'resource-batch-exchange-select':
    case 'card-draft':
    case 'engine-blocked':
      return { ok: false, error: `unhandled interaction kind: ${request.kind}` }
    default: {
      const _exhaustive: never = request
      return { ok: false, error: `unhandled interaction kind: ${JSON.stringify(_exhaustive)}` }
    }
  }
}

export type CommitSelectionKind =
  | 'farm-select'
  | 'selection'
  | 'resource-quantity-select'
  | 'resource-batch-exchange-select'

export type CommitSelectionSubmissionPlan =
  | Failure
  | {
      ok: true
      effectiveKind: CommitSelectionKind
      isFarmSelection: boolean
      isGenericSelection: boolean
      isResourceQuantity: boolean
      isResourceBatchExchange: boolean
    }

export const effectiveCommitSelectionKind = (
  requestKind: InteractionRequest['kind'] | undefined,
  options: { isFarmPrompt: boolean; isSelectionPrompt: boolean },
): InteractionRequest['kind'] | undefined => {
  if (requestKind !== 'choice') return requestKind
  if (options.isFarmPrompt) return 'farm-select'
  if (options.isSelectionPrompt) return 'selection'
  return requestKind
}

export const planCommitSelectionSubmission = (input: {
  requestKind: InteractionRequest['kind'] | undefined
  isFarmPrompt: boolean
  isSelectionPrompt: boolean
  pendingPlayerIndex: number
  playerIndex: number
  payload: SelectionCommitPayload
}): CommitSelectionSubmissionPlan => {
  const effectiveKind = effectiveCommitSelectionKind(input.requestKind, {
    isFarmPrompt: input.isFarmPrompt,
    isSelectionPrompt: input.isSelectionPrompt,
  })
  const acceptsCommitSelection = effectiveKind
    ? interactionSubmitChannel(effectiveKind) === 'commitSelection'
    : false
  if (!acceptsCommitSelection || input.pendingPlayerIndex !== input.playerIndex) {
    return { ok: false, error: 'no pending selection/resource choice for this player' }
  }
  if (
    effectiveKind !== 'farm-select' &&
    effectiveKind !== 'selection' &&
    effectiveKind !== 'resource-quantity-select' &&
    effectiveKind !== 'resource-batch-exchange-select'
  ) {
    return { ok: false, error: 'no pending selection/resource choice for this player' }
  }

  const isFarmSelection = effectiveKind === 'farm-select'
  const isGenericSelection = effectiveKind === 'selection'
  if (input.payload.cancel === true && (isFarmSelection || isGenericSelection)) {
    return { ok: false, error: 'action cancel is not allowed' }
  }
  return {
    ok: true,
    effectiveKind,
    isFarmSelection,
    isGenericSelection,
    isResourceQuantity: effectiveKind === 'resource-quantity-select',
    isResourceBatchExchange: effectiveKind === 'resource-batch-exchange-select',
  }
}

export const validateResourceQuantityCommit = (input: {
  request: Extract<InteractionRequest, { kind: 'resource-quantity-select' }>
  resourceCounts?: Partial<Record<keyof Resource, number>>
}): Failure | { ok: true; counts: Partial<Record<keyof Resource, number>> } => {
  const counts = input.resourceCounts ?? {}
  let total = 0
  for (const key of Object.keys(input.request.availableByResource) as (keyof Resource)[]) {
    const value = counts[key] ?? 0
    const max = input.request.availableByResource[key] ?? 0
    if (!Number.isInteger(value) || value < 0) {
      return { ok: false, error: `resource-quantity.error.invalid-count-${String(key)}` }
    }
    if (value > max) {
      return { ok: false, error: `resource-quantity.error.invalid-count-${String(key)}` }
    }
    total += value
  }
  if ((input.request.requireAtLeastOne ?? false) && total < 1) {
    return { ok: false, error: 'resource-quantity.error.must-pick-at-least-one' }
  }
  return { ok: true, counts }
}

export const validateResourceBatchExchangeCommit = (input: {
  request: Extract<InteractionRequest, { kind: 'resource-batch-exchange-select' }>
  resourceBatchExchange?: ResourceBatchExchangePayload
}): Failure | { ok: true; batch: ResourceBatchExchangePayload } => {
  const batch = input.resourceBatchExchange ?? { discard: {}, receive: {} }
  const discard = batch.discard ?? {}
  const receive = batch.receive ?? {}
  const allowedReceive = new Set(input.request.receiveResources)
  let discardTotal = 0
  let receiveTotal = 0
  for (const [key, raw] of Object.entries(discard)) {
    const resourceKey = key as keyof Resource
    const value = raw ?? 0
    if (!Number.isInteger(value) || value < 0) {
      return { ok: false, error: `resource-batch.error.invalid-discard-${key}` }
    }
    const max = input.request.discardAvailableByResource[resourceKey] ?? 0
    if (value > max) {
      return { ok: false, error: `resource-batch.error.invalid-discard-${key}` }
    }
    discardTotal += value
  }
  for (const [key, raw] of Object.entries(receive)) {
    const resourceKey = key as keyof Resource
    const value = raw ?? 0
    if (!allowedReceive.has(resourceKey) || !Number.isInteger(value) || value < 0) {
      return { ok: false, error: `resource-batch.error.invalid-receive-${key}` }
    }
    receiveTotal += value
  }
  if (discardTotal > input.request.maxTotal || receiveTotal > input.request.maxTotal) {
    return { ok: false, error: 'resource-batch.error.too-many' }
  }
  if (discardTotal !== receiveTotal) {
    return { ok: false, error: 'resource-batch.error.total-mismatch' }
  }
  if ((input.request.requireAtLeastOne ?? false) && discardTotal < 1) {
    return { ok: false, error: 'resource-batch.error.must-pick-at-least-one' }
  }
  return { ok: true, batch }
}

export const validateOccupationHandCommit = (input: {
  player: PlayerState
  cardIds: string[]
  minSelections: number
  maxSelections: number
}): Failure | { ok: true } => {
  if (input.cardIds.length < input.minSelections) {
    return { ok: false, error: 'not enough card selections' }
  }
  if (input.cardIds.length > input.maxSelections) {
    return { ok: false, error: 'too many card selections' }
  }
  for (const id of input.cardIds) {
    if (!input.player.occupationHand.includes(id)) {
      return { ok: false, error: `card ${id} not in occupation hand` }
    }
  }
  return { ok: true }
}

export const validateFarmPositionCommit = (input: {
  state: GameState
  player: PlayerState
  playerIndex: number
  positions: FarmTilePosition[]
  actionContext: Record<string, unknown> | undefined
  pendingSourceCard: string | undefined
  minSelections: number
  maxSelections: number
}): Failure | { ok: true; positionStrings: string[] } => {
  const { positions } = input
  if (positions.length < input.minSelections) return { ok: false, error: 'not enough selection positions' }
  if (positions.length > input.maxSelections) return { ok: false, error: 'too many selection positions' }

  const hasExplicitSelectableTiles = Array.isArray(input.actionContext?.selectableTiles)
  const selectedKeys = new Set<string>()
  for (const pos of positions) {
    if (!Number.isInteger(pos.row) || !Number.isInteger(pos.col)) {
      return { ok: false, error: 'invalid selection position' }
    }
    const key = `${pos.row}-${pos.col}`
    if (selectedKeys.has(key)) return { ok: false, error: 'duplicate selection position' }
    selectedKeys.add(key)
    if (!hasExplicitSelectableTiles) {
      const exists = input.player.fields.some((field) => field.row === pos.row && field.col === pos.col)
      if (!exists) return { ok: false, error: 'invalid field position' }
    }
  }

  const selectionInteraction = playerBoard(input.state, input.playerIndex)
    .farmInteraction
    .selectableTiles('farm-position', { actionContext: input.actionContext })
  const selectablePositions = selectionInteraction.kind === 'farm-position'
    ? selectionInteraction.selectablePositions
    : []
  const selectableKeys = new Set(selectablePositions.map(positionKey))
  const usedFarmyardTiles = input.actionContext?.terrainMode === 'place'
    ? getUsedFarmyardTileKeys(input.player)
    : null
  for (const pos of positions) {
    if (!selectableKeys.has(positionKey(pos))) return { ok: false, error: 'invalid selection position' }
    if (usedFarmyardTiles?.has(positionKey(pos))) return { ok: false, error: 'invalid selection position' }
  }

  const allowedSelectionCounts = Array.isArray(input.actionContext?.allowedSelectionCounts)
    ? input.actionContext.allowedSelectionCounts
        .filter((count): count is number => typeof count === 'number' && Number.isInteger(count))
    : null
  if (allowedSelectionCounts && !allowedSelectionCounts.includes(positions.length)) {
    return { ok: false, error: 'invalid selection count' }
  }

  const validPositionGroups = Array.isArray(input.actionContext?.validPositionGroups)
    ? input.actionContext.validPositionGroups
        .filter((group): group is FarmTilePosition[] => Array.isArray(group))
        .map((group) => group.map(positionKey).sort().join('|'))
    : null
  if (validPositionGroups && validPositionGroups.length > 0) {
    const selectedGroup = positions.map(positionKey).sort().join('|')
    if (!validPositionGroups.includes(selectedGroup)) {
      return { ok: false, error: 'invalid selection position' }
    }
  }

  const selectionEffect = input.actionContext?.selectionEffect
  if (typeof selectionEffect === 'string') {
    const validationError = validateSelectionEffect(selectionEffect, {
      player: input.player,
      positions: positions.map(positionKey),
      cards: [],
      sourceCard: input.pendingSourceCard,
      state: input.state,
      actionContext: input.actionContext,
    })
    if (validationError) return { ok: false, error: validationError }
  }

  return { ok: true, positionStrings: positions.map(positionKey) }
}
