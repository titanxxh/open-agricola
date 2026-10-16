import { createBaseActionDescriber } from '../actions/base-description'
import { collectScheduledEffectPreviews } from '../actions/scheduled-effect-preview'
import { importRecoveryCatalog } from './recovery-catalog'
import type { CardStatePresentation } from '../contract/card-state'
import { collectCardStatePresentation } from '../cards/card-state-presentation'
import { projectParentCardState } from '../parents/father-completion'
import type { RecoveryHistoryCatalog } from './recovery-catalog'
import { captureStateWithHistory } from './history-streams'
import type {
  ActionSpace,
  GameSeed,
  GameState,
  InteractionAnimalReorgZone,
  PlayerState,
  ScheduledEffectPreview,
} from '../contract/types'
import type { FatherParentCardId, MotherParentCardId } from '../parents/types'
import type { PublicEventCancellation } from '../contract/protocol/game'
import type { EngineStackCursor } from '../engine'
import type { SessionPrivateCursor, StateWithCursor } from './session-core'
import { ensureCardModifiers } from '../cards/card-modifiers'
import { collectLockedFarmTileKeys, collectBuiltSpecialStables, type BuiltSpecialStable } from '../cards/card-effects'
import { computeAnimalZones, type AnimalZone } from '../domain/animal-zones'
import { getPastureSize, getPastureStableCount, type Pasture as PastureView } from '../domain/pasture'
import type { ActionHookRegistry } from '../actions/hooks'

import { canTakeVisibleMoorSpecialAction, isMoorSpecialActionCardUsableByPlayer } from '../moor/special-action-availability'
import type { MoorSpecialActionId } from '../moor/types'
import { getPlayerPanelSupplySummary, type PlayerPanelSupplySummary } from '../domain/player-panel-summary'
import { filterSerializedStateForPlayer, filterSerializedCancellationsForPlayer } from '../projections/serialized-state'
export { filterSerializedStateForPlayer } from '../projections/serialized-state'

export type SerializedActionSpace = Omit<
  ActionSpace,
  'canBeExecutedByPlayer' | 'originalActionCondition' | 'execute' | 'resolveChoice' | 'flow' | 'previewEffect' | 'flowFactory'
>

/**
 * Player as seen by the client. Adds generic snapshot-only display fields
 * derived from card effects. The domain truth stays in `cardStates`; these
 * never enter `PlayerState`.
 */
export type SerializedPlayerState = Omit<PlayerState, 'pastures'> & {
  pastures: Omit<PastureView, 'capacity' | 'hasWell'>[]
  cardStatePresentation: Record<string, CardStatePresentation>
  moorSpecialActionAvailability: Record<string, Partial<Record<MoorSpecialActionId, boolean>> & { cardUsable: boolean }>
  lockedFarmTileKeys: string[]
  playerPanelSummary: PlayerPanelSupplySummary
  specialStables: BuiltSpecialStable[]
  roomAnimalZones: InteractionAnimalReorgZone[]
  playedCardAnimalZones: InteractionAnimalReorgZone[]
  farmCardAnimalZones: InteractionAnimalReorgZone[]
  borrowedPlayedCardAnimalZones: InteractionAnimalReorgZone[]
  pastureCapacities: Record<string, number>
  scheduledEffects: ScheduledEffectPreview[]
}

export type SerializedParentSelectionCandidates = {
  mother: Array<MotherParentCardId | '?'>
  father: Array<FatherParentCardId | '?'>
}

export type SerializedParentSelectionSubmission = {
  mother: MotherParentCardId | '?'
  father: FatherParentCardId | '?'
}

export type SerializedParentSelectionState = {
  candidates: Record<string, SerializedParentSelectionCandidates>
  submissions: Record<string, SerializedParentSelectionSubmission | null>
}

export type SerializedGameState = Omit<
  GameState,
  'actionSpaces' | 'players' | 'parentSelection' | 'gameSeed'
> & {
  /** Present in the authoritative frame; withheld from every viewer projection (ADR-0020). */
  gameSeed?: GameSeed
  actionSpaces: SerializedActionSpace[]
  // Always null. GameState no longer has this field; the key stays in the
  // serialized frame so Replay Frame hashes and the sync payload are unchanged.
  roundStartSnapshot: null
  engineStack: EngineStackCursor
  players: SerializedPlayerState[]
  parentSelection: SerializedParentSelectionState | null
}

export type SerializeStateContext = {
  actionHooks: ActionHookRegistry | undefined
  engineStack?: unknown
}

export type SerializedAuthoritativeGameState = Omit<GameState, 'actionSpaces'> & {
  actionSpaces: SerializedActionSpace[]
}

export type PersistedSessionSnapshot = {
  state: SerializedAuthoritativeGameState
  frame: SerializedGameState
  sessionCursor: SessionPrivateCursor
  historyCatalog?: RecoveryHistoryCatalog
}

export type SessionCursorSource = {
  readonly actionHooks: ActionHookRegistry
  withCtx<T>(fn: () => T): T
  createSessionPrivateCursor(): SessionPrivateCursor
}

const serializeAnimalZone = (zone: AnimalZone): InteractionAnimalReorgZone => {
  const out: InteractionAnimalReorgZone = {
    id: zone.id,
    zoneType: zone.zoneType,
    animalType: zone.animalType ?? null,
    animalCount: Math.max(0, zone.animalCount ?? 0),
    capacity: zone.capacity,
  }
  if (zone.cardId) out.cardId = zone.cardId
  if (zone.ownerPlayerId) out.ownerPlayerId = zone.ownerPlayerId
  if (zone.animalOwnerPlayerId) out.animalOwnerPlayerId = zone.animalOwnerPlayerId
  if (zone.displayOwnerName) out.displayOwnerName = zone.displayOwnerName
  if (zone.animalCounts) out.animalCounts = zone.animalCounts
  if (zone.allowedAnimalType !== undefined) out.allowedAnimalType = zone.allowedAnimalType
  if (zone.allowedAnimalTypes) out.allowedAnimalTypes = zone.allowedAnimalTypes
  if (zone.farmPosition) out.farmPosition = zone.farmPosition
  if (zone.countsFarmyardSpaceAsUnused !== undefined) {
    out.countsFarmyardSpaceAsUnused = zone.countsFarmyardSpaceAsUnused
  }
  if (zone.displaySource) out.displaySource = zone.displaySource
  if (zone.occupancyGroup) out.occupancyGroup = zone.occupancyGroup
  if (zone.occupiedZoneLimit !== undefined) out.occupiedZoneLimit = zone.occupiedZoneLimit
  return out
}

const collectBorrowedPlayedCardAnimalZones = (
  zones: readonly AnimalZone[],
): InteractionAnimalReorgZone[] =>
  zones
    .filter((zone) =>
      zone.zoneType === 'card' &&
      !zone.farmPosition &&
      zone.displaySource === 'borrowed-played-card'
    )
    .map(serializeAnimalZone)

const collectPastureCapacities = (
  zones: readonly AnimalZone[],
): Record<string, number> =>
  Object.fromEntries(
    zones
      .filter((zone) => zone.zoneType === 'pasture')
      .map((zone) => [zone.id, zone.capacity]),
  )

const collectPlayedCardAnimalZones = (
  zones: readonly AnimalZone[],
): InteractionAnimalReorgZone[] =>
  zones
    .filter((zone) =>
      zone.zoneType === 'card' &&
      !zone.farmPosition &&
      zone.displaySource !== 'borrowed-played-card'
    )
    .map(serializeAnimalZone)

const collectFarmCardAnimalZones = (
  zones: readonly AnimalZone[],
): InteractionAnimalReorgZone[] =>
  zones
    .filter((zone) => zone.zoneType === 'card' && !!zone.farmPosition)
    .map(serializeAnimalZone)

type SerializedPlayerDisplayFields = Omit<SerializedPlayerState, keyof PlayerState>
  & Pick<SerializedPlayerState, 'pastures'>

const serializePlayerDisplayFields = (
  state: GameState,
  player: PlayerState,
  actionHooks: ActionHookRegistry | undefined,
): SerializedPlayerDisplayFields => {
  const moorSpecialActionAvailability = Object.fromEntries((state.farmersOfTheMoor?.specialActionCards ?? []).map(card => [
    card.id, {
      cardUsable: isMoorSpecialActionCardUsableByPlayer(card, player.id),
      ...Object.fromEntries(card.actions.map(actionId => [actionId, canTakeVisibleMoorSpecialAction(state, player, card, actionId)])),
    },
  ]))
  const lockedFarmTileKeys = [...collectLockedFarmTileKeys(player)].sort()
  const playerPanelSummary = getPlayerPanelSupplySummary(state, player)
  const specialStables = collectBuiltSpecialStables(player)
  const zones = computeAnimalZones(player, state)
  return {
    pastures: player.pastures.map(pasture => ({
      ...pasture,
      size: getPastureSize(pasture),
      stables: getPastureStableCount(player, pasture),
    })),
    moorSpecialActionAvailability,
    cardStatePresentation: { ...collectCardStatePresentation(player), ...projectParentCardState(player) },
    lockedFarmTileKeys,
    playerPanelSummary,
    specialStables,
    roomAnimalZones: zones.filter(zone => zone.zoneType === 'house').map(serializeAnimalZone),
    playedCardAnimalZones: collectPlayedCardAnimalZones(zones),
    farmCardAnimalZones: collectFarmCardAnimalZones(zones),
    borrowedPlayedCardAnimalZones: collectBorrowedPlayedCardAnimalZones(zones),
    pastureCapacities: collectPastureCapacities(zones),
    scheduledEffects: collectScheduledEffectPreviews(state, player, actionHooks),
  }
}

export const serializeState = (
  state: GameState,
  ctx: SerializeStateContext,
): SerializedGameState => {
  const { actionSpaces, players, ...rest } = state
  const describeBaseAction = createBaseActionDescriber(state)
  return {
    ...rest,
    roundStartSnapshot: null,
    players: players.map((player) => ({
      ...player,
      ...serializePlayerDisplayFields(state, player, ctx.actionHooks),
    })),
    actionSpaces: actionSpaces.map(
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      ({ canBeExecutedByPlayer, originalActionCondition, execute, resolveChoice, flow, previewEffect, flowFactory, ...s }, index) => ({ ...s, baseDescriptionPreview: describeBaseAction(actionSpaces[index]!) }),
    ),
    engineStack: { frames: [] },
  }
}

/** The two snapshot views share only owned, immutable core values. */
const freezeSnapshotCore = (value: unknown): void => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return
  Object.values(value).forEach(freezeSnapshotCore)
  Object.freeze(value)
}

export const serializeSessionSnapshot = (
  state: GameState,
  session: SessionCursorSource,
): PersistedSessionSnapshot => {
  const captured = captureStateWithHistory(state)
  freezeSnapshotCore(captured)
  const displays = session.withCtx(() => JSON.parse(JSON.stringify(
    state.players.map(player => serializePlayerDisplayFields(state, player, session.actionHooks)),
  )) as SerializedPlayerDisplayFields[])
  const { actionSpaces, players, ...rest } = captured
  const baseDescriptions = session.withCtx(() => {
    const describe = createBaseActionDescriber(state)
    return JSON.parse(JSON.stringify(state.actionSpaces.map(describe))) as (import('../contract/types').ChoiceDescriptionPreview | null)[]
  })
  const frame: SerializedGameState = {
      ...rest,
      roundStartSnapshot: null,
      players: players.map((player, index) => ({ ...player, ...displays[index]! })),
      actionSpaces: actionSpaces.map(
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        ({ canBeExecutedByPlayer, originalActionCondition, execute, resolveChoice, flow, previewEffect, flowFactory, ...space }, index) => ({ ...space, ...(baseDescriptions[index] ? { baseDescriptionPreview: baseDescriptions[index]! } : {}) }),
      ),
      engineStack: { frames: [] },
    }
  return {
    state: captured as SerializedAuthoritativeGameState,
    frame,
    sessionCursor: session.createSessionPrivateCursor(),
  }
}

export const filterPublicEventCancellationsForPlayer = (
  state: GameState,
  viewerPlayerId: string | null,
  ctx: SerializeStateContext,
  cancellations: readonly PublicEventCancellation[] | undefined,
  serializedState?: SerializedGameState,
): PublicEventCancellation[] | undefined =>
  cancellations?.length
    ? filterSerializedCancellationsForPlayer(serializedState ?? serializeState(state, ctx), viewerPlayerId, cancellations)
    : undefined

export const serializeStateForPlayer = (
  state: GameState,
  viewerPlayerId: string | null,
  ctx: SerializeStateContext,
): SerializedGameState =>
  filterSerializedStateForPlayer(serializeState(state, ctx), viewerPlayerId)

export const rebuildActiveModifiers = (state: GameState): GameState => {
  state.players.forEach((player) => {
    const playedCardIds = [...(player.minorPlayed ?? []), ...(player.occupationPlayed ?? [])]
    playedCardIds.forEach((cardId) => ensureCardModifiers(player, cardId))
    // Ensure extraOccupationsFromCards is initialized
    if (!player.extraOccupationsFromCards) {
      player.extraOccupationsFromCards = []
    }
  })
  return state
}

export type RehydratedState = StateWithCursor

export const rehydrateState = (
  input: SerializedGameState | PersistedSessionSnapshot,
): RehydratedState => {
  const persisted = 'state' in input && 'frame' in input && 'sessionCursor' in input ? input : null
  if (persisted) importRecoveryCatalog(persisted)
  const raw = captureStateWithHistory((persisted?.state ?? input) as SerializedGameState)
  const { engineStack: _engineStack, players, ...rest } = raw
  // Strip snapshot-only display projections so they never
  // leaks into the authoritative `PlayerState` domain shape.
  const rawWithoutCursor = {
    ...rest,
    players: players.map(({
      moorSpecialActionAvailability: _moorSpecialActionAvailability,
      lockedFarmTileKeys: _lockedFarmTileKeys,
      playerPanelSummary: _playerPanelSummary,
      specialStables: _specialStables,
      roomAnimalZones: _roomAnimalZones,
      playedCardAnimalZones: _playedCardAnimalZones,
      farmCardAnimalZones: _farmCardAnimalZones,
      cardStatePresentation: _cardStatePresentation,
      borrowedPlayedCardAnimalZones: _borrowedPlayedCardAnimalZones,
      pastureCapacities: _pastureCapacities,
      scheduledEffects: _scheduledEffects,
      ...player
    }) => player),
  }
  // Decode data before a Core exists. Rule-dependent normalization and
  // modifier reconstruction run only after that Core registers its cards.
  return {
    state: rawWithoutCursor as unknown as GameState,
    ...(persisted ? { sessionCursor: persisted.sessionCursor } : {}),
  }
}
