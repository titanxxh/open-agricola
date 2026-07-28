import type { GameEvent, PublicEventArchivePacket } from '../contract/events'
import type {
  ActionSpace,
  CardStates,
  GameState,
  InteractionAnimalReorgZone,
  LogEntry,
  PlayerState,
} from '../contract/types'
import type { FatherParentCardId, MotherParentCardId } from '../parents/types'
import type { PublicEventCancellation } from '../contract/protocol/game'
import type { EngineStack, EngineStackCursor } from '../engine'
import { createActionSpaces } from '../actions'
import { normalizeState } from '../session/state-bootstrap'
import { getCardModifiers } from '../cards/card-modifiers'
import { createPlayerActionSpaces } from '../cards/player-action-space'
import { normalizeBlockedBy, normalizeTakenBy } from '../domain/space'
import { collectBuiltSpecialStables, type BuiltSpecialStable } from '../cards/card-effects'
import { createSeasonActionSpaces } from '../seasons/action-spaces'
import { computeAnimalZones, type AnimalZone } from '../domain/animal-zones'

export type SerializedActionSpace = Omit<
  ActionSpace,
  'canBeExecutedByPlayer' | 'execute' | 'resolveChoice' | 'flow'
>

/**
 * Player as seen by the client. Adds generic snapshot-only display fields
 * derived from card effects. The domain truth stays in `cardStates`; these
 * never enter `PlayerState`.
 */
export type SerializedPlayerState = PlayerState & {
  specialStables: BuiltSpecialStable[]
  playedCardAnimalZones: InteractionAnimalReorgZone[]
  farmCardAnimalZones: InteractionAnimalReorgZone[]
  borrowedPlayedCardAnimalZones: InteractionAnimalReorgZone[]
  pastureCapacities: Record<string, number>
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
  'actionSpaces' | 'roundStartSnapshot' | 'players' | 'parentSelection'
> & {
  actionSpaces: SerializedActionSpace[]
  roundStartSnapshot: null
  engineStack: EngineStackCursor
  players: SerializedPlayerState[]
  parentSelection: SerializedParentSelectionState | null
}

export type SerializeStateContext = {
  engineStack: EngineStack
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
  if (zone.exclusiveCardZoneLimit !== undefined) out.exclusiveCardZoneLimit = zone.exclusiveCardZoneLimit
  return out
}

const collectBorrowedPlayedCardAnimalZones = (
  state: GameState,
  player: PlayerState,
): InteractionAnimalReorgZone[] =>
  computeAnimalZones(player, state)
    .filter((zone) =>
      zone.zoneType === 'card' &&
      !zone.farmPosition &&
      zone.displaySource === 'borrowed-played-card'
    )
    .map(serializeAnimalZone)

const collectPastureCapacities = (
  state: GameState,
  player: PlayerState,
): Record<string, number> =>
  Object.fromEntries(
    computeAnimalZones(player, state)
      .filter((zone) => zone.zoneType === 'pasture')
      .map((zone) => [zone.id, zone.capacity]),
  )

const collectPlayedCardAnimalZones = (
  state: GameState,
  player: PlayerState,
): InteractionAnimalReorgZone[] =>
  computeAnimalZones(player, state)
    .filter((zone) =>
      zone.zoneType === 'card' &&
      !zone.farmPosition &&
      zone.displaySource !== 'borrowed-played-card'
    )
    .map(serializeAnimalZone)

const collectFarmCardAnimalZones = (
  state: GameState,
  player: PlayerState,
): InteractionAnimalReorgZone[] =>
  computeAnimalZones(player, state)
    .filter((zone) => zone.zoneType === 'card' && !!zone.farmPosition)
    .map(serializeAnimalZone)

export const serializeState = (
  state: GameState,
  ctx: SerializeStateContext,
): SerializedGameState => {
  const { actionSpaces, players, ...rest } = state
  return {
    ...rest,
    roundStartSnapshot: null,
    players: players.map((player) => ({
      ...player,
      specialStables: collectBuiltSpecialStables(player),
      playedCardAnimalZones: collectPlayedCardAnimalZones(state, player),
      farmCardAnimalZones: collectFarmCardAnimalZones(state, player),
      borrowedPlayedCardAnimalZones: collectBorrowedPlayedCardAnimalZones(state, player),
      pastureCapacities: collectPastureCapacities(state, player),
    })),
    actionSpaces: actionSpaces.map(
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      ({ canBeExecutedByPlayer, execute, resolveChoice, flow, ...s }) => s,
    ),
    engineStack: ctx.engineStack.toCursor(),
  }
}

const hiddenHandCardIdsByPlayer = (
  players: readonly PlayerState[],
  viewerPlayerId: string | null,
): Map<string, Set<string>> => {
  const hidden = new Map<string, Set<string>>()
  for (const player of players) {
    if (player.id === viewerPlayerId) continue
    const cardIds = [...(player.minorHand ?? []), ...(player.occupationHand ?? [])]
      .filter((cardId) => cardId !== '?')
    if (cardIds.length > 0) hidden.set(player.id, new Set(cardIds))
  }
  return hidden
}

const filterHiddenHandCardStates = (
  cardStates: CardStates,
  hiddenCardIds: ReadonlySet<string> | undefined,
): CardStates => {
  if (!hiddenCardIds || hiddenCardIds.size === 0) return cardStates
  const entries = Object.entries(cardStates).filter(([cardId]) => !hiddenCardIds.has(cardId))
  return Object.fromEntries(entries)
}

const hiddenHandCardEventTarget = (event: GameEvent): { playerId: string; cardId: string } | null => {
  switch (event.type) {
    case 'card.stateChanged':
    case 'card.infoboxChanged':
    case 'card.resourcePairsStored':
      return { playerId: event.targetPlayerId, cardId: event.cardId }
    case 'card.stackChanged':
      return event.targetPlayerId ? { playerId: event.targetPlayerId, cardId: event.cardId } : null
    default:
      return null
  }
}

const hiddenHandCardSourceTargets = (event: GameEvent): Array<{ playerId?: string; cardId: string }> => {
  const playerId = event.actorPlayerId ?? event.targetPlayerId
  const cardIds = [
    event.sourceCardId,
    event.trigger?.cardId,
    event.type === 'card.triggered' ? event.cardId : undefined,
  ]
  return cardIds
    .filter((cardId): cardId is string => typeof cardId === 'string' && cardId.length > 0)
    .map((cardId) => ({ playerId, cardId }))
}

const hasHiddenHandCardId = (
  cardId: string,
  hiddenCardIds: ReadonlyMap<string, ReadonlySet<string>>,
): boolean => {
  for (const playerHiddenCardIds of hiddenCardIds.values()) {
    if (playerHiddenCardIds.has(cardId)) return true
  }
  return false
}

const logParamContainsHiddenHandCard = (
  value: unknown,
  hiddenCardIds: ReadonlyMap<string, ReadonlySet<string>>,
): boolean => {
  if (typeof value === 'string') return hasHiddenHandCardId(value, hiddenCardIds)
  if (Array.isArray(value)) return value.some((entry) => logParamContainsHiddenHandCard(entry, hiddenCardIds))
  return false
}

const isHiddenHandCardLogEntry = (
  entry: LogEntry,
  hiddenCardIds: ReadonlyMap<string, ReadonlySet<string>>,
): boolean => {
  if (!entry.params) return false
  return Object.entries(entry.params).some(([key, value]) =>
    key.toLowerCase().includes('card') && logParamContainsHiddenHandCard(value, hiddenCardIds)
  )
}

const filterHiddenHandLog = (
  log: readonly LogEntry[],
  hiddenCardIds: ReadonlyMap<string, ReadonlySet<string>>,
): LogEntry[] =>
  log.filter((entry) => !isHiddenHandCardLogEntry(entry, hiddenCardIds))

const isHiddenHandCardEvent = (
  event: GameEvent,
  hiddenCardIds: ReadonlyMap<string, ReadonlySet<string>>,
): boolean => {
  const target = hiddenHandCardEventTarget(event)
  if (target && (hiddenCardIds.get(target.playerId)?.has(target.cardId) ?? false)) return true
  return hiddenHandCardSourceTargets(event).some((target) =>
    target.playerId
      ? hiddenCardIds.get(target.playerId)?.has(target.cardId) ?? false
      : hasHiddenHandCardId(target.cardId, hiddenCardIds)
  )
}

type VisibleEventSeqView = {
  eventSeqByKey: ReadonlyMap<string, number>
  eventSeqByOriginalSeq: ReadonlyMap<number, number>
  nextEventSeq: number
  maxVisibleSeqAt: (originalMaxSeq: number) => number
}

type HiddenHandEventRefs = {
  currentEventKeys: ReadonlySet<string>
  hiddenCanceledPacketSeqsByKey: ReadonlyMap<string, readonly number[]>
  allCanceledPacketSeqsByKey: ReadonlyMap<string, readonly number[]>
  hasHiddenEvents: boolean
}

type PublicEventCanceledPacket = Extract<PublicEventArchivePacket, { type: 'publicEvents.canceled' }>

type HiddenHandVisibility = {
  base: SerializedGameState
  hiddenCardIds: ReadonlyMap<string, ReadonlySet<string>>
  hiddenRefs: HiddenHandEventRefs
  seqView: VisibleEventSeqView | null
}

const eventRefKey = (id: string, seq: number): string => `${id}\u0000${seq}`

const gameEventRefKey = (event: GameEvent): string => eventRefKey(event.id, event.seq)

const pushPacketSeq = (map: Map<string, number[]>, key: string, packetSeq: number): void => {
  const existing = map.get(key)
  if (existing) {
    existing.push(packetSeq)
    return
  }
  map.set(key, [packetSeq])
}

const previousPacketSeq = (packetSeqs: readonly number[] | undefined, beforePacketSeq: number): number =>
  packetSeqs?.reduce((maxSeq, packetSeq) =>
    packetSeq < beforePacketSeq ? Math.max(maxSeq, packetSeq) : maxSeq, 0) ?? 0

const lastPacketSeq = (packetSeqs: readonly number[] | undefined): number =>
  packetSeqs?.reduce((maxSeq, packetSeq) => Math.max(maxSeq, packetSeq), 0) ?? 0

const createHiddenHandEventRefs = (
  base: SerializedGameState,
  hiddenCardIds: ReadonlyMap<string, ReadonlySet<string>>,
): HiddenHandEventRefs => {
  const currentEventKeys = new Set(
    base.events
      .filter((event) => isHiddenHandCardEvent(event, hiddenCardIds))
      .map(gameEventRefKey),
  )
  const hiddenCanceledPacketSeqsByKey = new Map<string, number[]>()
  const allCanceledPacketSeqsByKey = new Map<string, number[]>()
  for (const packet of base.publicEventArchive) {
    if (packet.type !== 'publicEvents.canceled') continue
    for (const event of packet.canceledEvents) {
      const key = gameEventRefKey(event)
      pushPacketSeq(allCanceledPacketSeqsByKey, key, packet.packetSeq)
      if (isHiddenHandCardEvent(event, hiddenCardIds)) {
        pushPacketSeq(hiddenCanceledPacketSeqsByKey, key, packet.packetSeq)
      }
    }
  }
  return {
    currentEventKeys,
    hiddenCanceledPacketSeqsByKey,
    allCanceledPacketSeqsByKey,
    hasHiddenEvents: currentEventKeys.size > 0 || hiddenCanceledPacketSeqsByKey.size > 0,
  }
}

const isHiddenCurrentEvent = (event: GameEvent, hiddenRefs: HiddenHandEventRefs): boolean =>
  hiddenRefs.currentEventKeys.has(gameEventRefKey(event))

const isHiddenCanceledEvent = (
  event: GameEvent,
  packetSeq: number,
  hiddenRefs: HiddenHandEventRefs,
): boolean =>
  hiddenRefs.hiddenCanceledPacketSeqsByKey.get(gameEventRefKey(event))?.includes(packetSeq) ?? false

const isHiddenCommittedArchiveEntry = (
  id: string,
  seq: number,
  packetSeq: number,
  hiddenRefs: HiddenHandEventRefs,
): boolean => {
  const key = eventRefKey(id, seq)
  const allCanceledPacketSeqs = hiddenRefs.allCanceledPacketSeqsByKey.get(key)
  if (hiddenRefs.currentEventKeys.has(key) && packetSeq > lastPacketSeq(allCanceledPacketSeqs)) {
    return true
  }
  return hiddenRefs.hiddenCanceledPacketSeqsByKey.get(key)?.some((hiddenCanceledPacketSeq) => {
    const previousCanceledPacketSeq = previousPacketSeq(allCanceledPacketSeqs, hiddenCanceledPacketSeq)
    return packetSeq > previousCanceledPacketSeq && packetSeq < hiddenCanceledPacketSeq
  }) ?? false
}

const visibleEventRefs = (
  base: SerializedGameState,
  hiddenRefs: HiddenHandEventRefs,
): Array<{ id: string; seq: number }> => {
  const refs = base.events
    .filter((event) => !isHiddenCurrentEvent(event, hiddenRefs))
    .map((event) => ({ id: event.id, seq: event.seq }))
  for (const packet of base.publicEventArchive) {
    if (packet.type === 'publicEvents.committed') {
      packet.eventIds.forEach((id, index) => {
        const seq = packet.eventSeqs[index]!
        if (!isHiddenCommittedArchiveEntry(id, seq, packet.packetSeq, hiddenRefs)) {
          refs.push({ id, seq })
        }
      })
      continue
    }
    packet.canceledEvents
      .filter((event) => !isHiddenCanceledEvent(event, packet.packetSeq, hiddenRefs))
      .forEach((event) => refs.push({ id: event.id, seq: event.seq }))
  }
  return refs
}

const createVisibleEventSeqView = (
  base: SerializedGameState,
  hiddenRefs: HiddenHandEventRefs,
): VisibleEventSeqView | null => {
  if (!hiddenRefs.hasHiddenEvents) return null
  const eventSeqByKey = new Map<string, number>()
  const eventSeqByOriginalSeq = new Map<number, number>()
  let nextSeq = 1
  for (const ref of visibleEventRefs(base, hiddenRefs).sort((left, right) => left.seq - right.seq)) {
    const key = eventRefKey(ref.id, ref.seq)
    if (eventSeqByKey.has(key)) continue
    eventSeqByKey.set(key, nextSeq)
    eventSeqByOriginalSeq.set(ref.seq, nextSeq)
    nextSeq += 1
  }
  const nextEventSeq = base.events
    .filter((event) => !isHiddenCurrentEvent(event, hiddenRefs))
    .reduce((maxSeq, event) => Math.max(maxSeq, eventSeqByKey.get(gameEventRefKey(event)) ?? event.seq), 0) + 1
  return {
    eventSeqByKey,
    eventSeqByOriginalSeq,
    nextEventSeq,
    maxVisibleSeqAt: (originalMaxSeq) => {
      let maxSeq = 0
      for (const [originalSeq, visibleSeq] of eventSeqByOriginalSeq.entries()) {
        if (originalSeq <= originalMaxSeq) maxSeq = Math.max(maxSeq, visibleSeq)
      }
      return maxSeq
    },
  }
}

const createHiddenHandVisibility = (
  base: SerializedGameState,
  viewerPlayerId: string | null,
): HiddenHandVisibility => {
  const hiddenCardIds = hiddenHandCardIdsByPlayer(base.players, viewerPlayerId)
  const hiddenRefs = createHiddenHandEventRefs(base, hiddenCardIds)
  const seqView = createVisibleEventSeqView(base, hiddenRefs)
  return { base, hiddenCardIds, hiddenRefs, seqView }
}

const maskParentCandidates = (
  candidates: SerializedParentSelectionCandidates,
): SerializedParentSelectionCandidates => ({
  mother: Array(candidates.mother.length).fill('?'),
  father: Array(candidates.father.length).fill('?'),
})

const maskParentSubmission = (
  submission: SerializedParentSelectionSubmission | null,
): SerializedParentSelectionSubmission | null =>
  submission
    ? { mother: '?', father: '?' }
    : null

const filterParentSelectionForPlayer = (
  parentSelection: SerializedParentSelectionState | null,
  viewerPlayerId: string | null,
): SerializedParentSelectionState | null => {
  if (!parentSelection) return null
  return {
    candidates: Object.fromEntries(
      Object.entries(parentSelection.candidates).map(([pid, candidates]) => [
        pid,
        pid === viewerPlayerId ? candidates : maskParentCandidates(candidates),
      ]),
    ),
    submissions: Object.fromEntries(
      Object.entries(parentSelection.submissions).map(([pid, submission]) => [
        pid,
        pid === viewerPlayerId ? submission : maskParentSubmission(submission),
      ]),
    ),
  }
}

const remapEventSeq = (event: GameEvent, seqView: VisibleEventSeqView | null): GameEvent =>
  !seqView ? event : ({ ...event, seq: seqView.eventSeqByKey.get(gameEventRefKey(event)) ?? event.seq } as GameEvent)

const filterHiddenHandEvents = (
  events: readonly GameEvent[],
  hiddenRefs: HiddenHandEventRefs,
  seqView: VisibleEventSeqView | null,
): GameEvent[] =>
  events
    .filter((event) => !isHiddenCurrentEvent(event, hiddenRefs))
    .map((event) => remapEventSeq(event, seqView))

const filterHiddenHandArchive = (
  archive: readonly PublicEventArchivePacket[],
  hiddenRefs: HiddenHandEventRefs,
  seqView: VisibleEventSeqView | null,
): PublicEventArchivePacket[] => {
  const filtered: PublicEventArchivePacket[] = []
  let packetSeq = 1
  for (const packet of archive) {
    if (packet.type === 'publicEvents.committed') {
      const visible = packet.eventIds
        .map((id, index) => ({
          id,
          originalSeq: packet.eventSeqs[index]!,
        }))
        .filter((event) => !isHiddenCommittedArchiveEntry(event.id, event.originalSeq, packet.packetSeq, hiddenRefs))
        .map((event) => ({
          id: event.id,
          seq: seqView?.eventSeqByKey.get(eventRefKey(event.id, event.originalSeq)) ?? event.originalSeq,
        }))
      if (visible.length === 0) continue
      const eventSeqs = visible.map((event) => event.seq)
      filtered.push({
        ...packet,
        id: seqView ? String(packetSeq) : packet.id,
        packetSeq: seqView ? packetSeq : packet.packetSeq,
        eventIds: visible.map((event) => event.id),
        eventSeqs,
        firstEventSeq: eventSeqs[0]!,
        lastEventSeq: eventSeqs[eventSeqs.length - 1]!,
      })
      packetSeq += 1
      continue
    }
    const canceledEvents = packet.canceledEvents
      .filter((event) => !isHiddenCanceledEvent(event, packet.packetSeq, hiddenRefs))
      .map((event) => remapEventSeq(event, seqView))
    if (canceledEvents.length === 0) continue
    filtered.push({
      ...packet,
      id: seqView ? String(packetSeq) : packet.id,
      packetSeq: seqView ? packetSeq : packet.packetSeq,
      previousMaxSeq: seqView ? seqView.maxVisibleSeqAt(packet.previousMaxSeq) : packet.previousMaxSeq,
      nextMaxSeq: seqView ? seqView.maxVisibleSeqAt(packet.nextMaxSeq) : packet.nextMaxSeq,
      canceledEvents,
      canceledEventIds: canceledEvents.map((event) => event.id),
      canceledSeqs: canceledEvents.map((event) => event.seq),
    })
    packetSeq += 1
  }
  return filtered
}

const arraysEqual = <T>(left: readonly T[], right: readonly T[]): boolean =>
  left.length === right.length && left.every((value, index) => value === right[index])

const cancellationMatchesPacket = (
  cancellation: PublicEventCancellation,
  packet: PublicEventCanceledPacket,
): boolean =>
  packet.reason === cancellation.reason &&
  packet.previousMaxSeq === cancellation.previousMaxSeq &&
  packet.nextMaxSeq === cancellation.nextMaxSeq &&
  arraysEqual(packet.canceledEventIds, cancellation.canceledEventIds) &&
  arraysEqual(packet.canceledSeqs, cancellation.canceledSeqs)

const findCancellationPacket = (
  archive: readonly PublicEventArchivePacket[],
  cancellation: PublicEventCancellation,
): PublicEventCanceledPacket | null => {
  for (let index = archive.length - 1; index >= 0; index -= 1) {
    const packet = archive[index]!
    if (packet.type === 'publicEvents.canceled' && cancellationMatchesPacket(cancellation, packet)) {
      return packet
    }
  }
  return null
}

const filterPublicEventCancellation = (
  cancellation: PublicEventCancellation,
  packet: PublicEventCanceledPacket | null,
  hiddenRefs: HiddenHandEventRefs,
  seqView: VisibleEventSeqView | null,
): PublicEventCancellation | null => {
  if (!seqView) return cancellation
  const visible = packet
    ? packet.canceledEvents
        .filter((event) => !isHiddenCanceledEvent(event, packet.packetSeq, hiddenRefs))
        .map((event) => remapEventSeq(event, seqView))
    : cancellation.canceledEventIds
        .map((id, index) => ({ id, originalSeq: cancellation.canceledSeqs[index]! }))
        .filter((event) => seqView.eventSeqByKey.has(eventRefKey(event.id, event.originalSeq)))
        .map((event) => ({
          id: event.id,
          seq: seqView.eventSeqByKey.get(eventRefKey(event.id, event.originalSeq))!,
        }))
  if (visible.length === 0) return null
  return {
    ...cancellation,
    previousMaxSeq: seqView.maxVisibleSeqAt(cancellation.previousMaxSeq),
    nextMaxSeq: seqView.maxVisibleSeqAt(cancellation.nextMaxSeq),
    canceledEventIds: visible.map((event) => event.id),
    canceledSeqs: visible.map((event) => event.seq),
  }
}

export const filterPublicEventCancellationsForPlayer = (
  state: GameState,
  viewerPlayerId: string | null,
  ctx: SerializeStateContext,
  cancellations: readonly PublicEventCancellation[] | undefined,
): PublicEventCancellation[] | undefined => {
  if (!cancellations?.length) return undefined
  const { base, hiddenRefs, seqView } = createHiddenHandVisibility(
    serializeState(state, ctx),
    viewerPlayerId,
  )
  const filtered = cancellations
    .map((cancellation) => filterPublicEventCancellation(
      cancellation,
      findCancellationPacket(base.publicEventArchive, cancellation),
      hiddenRefs,
      seqView,
    ))
    .filter((cancellation): cancellation is PublicEventCancellation => cancellation !== null)
  return filtered.length > 0 ? filtered : undefined
}

const maskDraftPoolForViewer = (
  pool: { occ: string[]; minor: string[] },
  visible: boolean,
) => visible
  ? pool
  : {
      occ: Array(pool.occ.length).fill('?'),
      minor: Array(pool.minor.length).fill('?'),
    }

/**
 * Per-viewer snapshot. Identical to `serializeState` except that secret
 * information belonging to non-viewer players is replaced with same-length
 * arrays of '?' placeholders so the shape stays stable for the client.
 *
 * Currently filters:
 *   - `players[i].occupationHand` and `players[i].minorHand` for every
 *     player other than the viewer.
 *   - `players[i].cardStates[cardId]` and card-state events for cards that
 *     are still hidden in another player's hand.
 *   - `draft.pools[pid].occ`, `draft.pools[pid].minor`,
 *     `draft.kept[pid]`, and `draft.pendingPicks[pid]` for every
 *     player other than the viewer.
 *   - unresolved `parentSelection.candidates[pid]` and submitted
 *     parent choices for every player other than the viewer.
 *
 * Pass `viewerPlayerId = null` (or an unknown id) to produce a spectator
 * view where every player's hand and pool is masked.
 */
export const filterSerializedStateForPlayer = (
  base: SerializedGameState,
  viewerPlayerId: string | null,
): SerializedGameState => {
  const { hiddenCardIds, hiddenRefs, seqView } = createHiddenHandVisibility(
    base,
    viewerPlayerId,
  )
  const filteredPlayers = base.players.map((p) =>
    p.id === viewerPlayerId
      ? p
      : {
          ...p,
          occupationHand: Array(p.occupationHand.length).fill('?'),
          minorHand: Array(p.minorHand.length).fill('?'),
          cardStates: filterHiddenHandCardStates(p.cardStates, hiddenCardIds.get(p.id)),
        },
  )
  const filteredDraft = !base.draft
    ? base.draft
    : {
        ...base.draft,
        pools: Object.fromEntries(
          Object.entries(base.draft.pools).map(([pid, pool]) =>
            [pid, maskDraftPoolForViewer(pool, pid === viewerPlayerId)],
          ),
        ),
        ...(base.draft.stages
          ? {
              stages: base.draft.stages.map((stage) => ({
                ...stage,
                pools: Object.fromEntries(
                  Object.entries(stage.pools).map(([pid, pool]) =>
                    [pid, maskDraftPoolForViewer(pool, pid === viewerPlayerId)],
                  ),
                ),
              })),
            }
          : {}),
        kept: Object.fromEntries(
          Object.entries(base.draft.kept).map(([pid, pool]) =>
            pid === viewerPlayerId
              ? [pid, pool]
              : [
                  pid,
                  {
                    occ: Array(pool.occ.length).fill('?'),
                    minor: Array(pool.minor.length).fill('?'),
                  },
                ],
          ),
        ),
        pendingPicks: Object.fromEntries(
          Object.entries(base.draft.pendingPicks).map(([pid, pick]) =>
            pid === viewerPlayerId
              ? [pid, pick]
              : [
                  pid,
                  {
                    occ: pick.occ === null ? null : '?',
                    minor: pick.minor === null ? null : '?',
                  },
                ],
          ),
        ),
      }
  const filteredOrdinaryCardDecks = {
    occupation: Array(base.ordinaryCardDecks.occupation.length).fill('?'),
    minor: Array(base.ordinaryCardDecks.minor.length).fill('?'),
  }
  const filteredOrdinaryCardDrawChoices = Object.fromEntries(
    Object.entries(base.ordinaryCardDrawChoices).map(([id, choice]) => [
      id,
      choice.playerId === viewerPlayerId
        ? choice
        : {
            ...choice,
            candidates: Array(choice.candidates.length).fill('?'),
          },
    ]),
  )
  const filteredEvents = filterHiddenHandEvents(base.events, hiddenRefs, seqView)
  const filteredPublicEventArchive = filterHiddenHandArchive(base.publicEventArchive, hiddenRefs, seqView)
  return {
    ...base,
    nextEventSeq: seqView?.nextEventSeq ?? base.nextEventSeq,
    nextPublicEventArchivePacketSeq: seqView
      ? filteredPublicEventArchive.length + 1
      : base.nextPublicEventArchivePacketSeq,
    players: filteredPlayers,
    events: filteredEvents,
    publicEventArchive: filteredPublicEventArchive,
    log: filterHiddenHandLog(base.log, hiddenCardIds),
    draft: filteredDraft,
    parentSelection: filterParentSelectionForPlayer(base.parentSelection, viewerPlayerId),
    ordinaryCardDecks: filteredOrdinaryCardDecks,
    ordinaryCardDrawChoices: filteredOrdinaryCardDrawChoices,
    engineStack: { frames: [] },
  }
}

export const serializeStateForPlayer = (
  state: GameState,
  viewerPlayerId: string | null,
  ctx: SerializeStateContext,
): SerializedGameState =>
  filterSerializedStateForPlayer(serializeState(state, ctx), viewerPlayerId)

export const rebuildActiveModifiers = (state: GameState): GameState => {
  state.players.forEach((player) => {
    const existing = player.activeModifiers ?? []
    const next = [...existing]
    const playedCardIds = [...(player.minorPlayed ?? []), ...(player.occupationPlayed ?? [])]
    playedCardIds.forEach((cardId) => {
      const modifiers = getCardModifiers(cardId)
      modifiers.forEach((modifier) => {
        if (!next.some((entry) => JSON.stringify(entry) === JSON.stringify(modifier))) {
          next.push(modifier)
        }
      })
    })
    player.activeModifiers = next
    // Ensure extraOccupationsFromCards is initialized
    if (!player.extraOccupationsFromCards) {
      player.extraOccupationsFromCards = []
    }
  })
  return state
}

export type RehydratedState = {
  state: GameState
  engineStackCursor: EngineStackCursor
}

export const rehydrateState = (raw: SerializedGameState): RehydratedState => {
  const templates = [
    ...createActionSpaces(raw.players?.length),
    ...(raw.enableThroughTheSeasons ? createSeasonActionSpaces(raw.players?.length) : []),
  ]
  const { engineStack, players, ...rest } = raw
  // Strip snapshot-only display projections so they never
  // leaks into the authoritative `PlayerState` domain shape.
  const rawWithoutCursor = {
    ...rest,
    players: players.map(({
      specialStables: _specialStables,
      playedCardAnimalZones: _playedCardAnimalZones,
      farmCardAnimalZones: _farmCardAnimalZones,
      borrowedPlayedCardAnimalZones: _borrowedPlayedCardAnimalZones,
      pastureCapacities: _pastureCapacities,
      ...player
    }) => player),
  }
  const restored = rebuildActiveModifiers(normalizeState(rawWithoutCursor as unknown as GameState))
  restored.actionSpaces = templates.map((template) => {
    const saved = raw.actionSpaces?.find((s) => s.id === template.id)
    return {
      ...template,
      resources: saved?.resources ?? template.resources,
      takenBy: normalizeTakenBy(saved?.takenBy),
      blockedBy: normalizeBlockedBy(saved?.blockedBy),
      exclusiveUse: saved?.exclusiveUse,
    }
  })
  // Append PlayerActionCard dynamic spaces
  const playerActionSpaces = createPlayerActionSpaces(restored)
  for (const pas of playerActionSpaces) {
    const saved = raw.actionSpaces?.find((s) => s.id === pas.id)
    if (saved) {
      pas.resources = saved.resources ?? pas.resources
      pas.takenBy = normalizeTakenBy(saved.takenBy)
      pas.blockedBy = normalizeBlockedBy(saved.blockedBy)
      pas.exclusiveUse = saved.exclusiveUse
    }
    restored.actionSpaces.push(pas)
  }
  return {
    state: restored,
    engineStackCursor: engineStack ?? { frames: [] },
  }
}
