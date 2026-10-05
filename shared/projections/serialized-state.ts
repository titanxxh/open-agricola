import { inheritHistoryRecordIdentity } from './history-record-identity'
import type { CardStates, PlayerState, LogEntry } from '../contract/types'
import type { GameEvent, PublicEventArchivePacket } from '../contract/events'
import type { PublicEventCancellation } from '../contract/protocol/game'
import type { SerializedGameState, SerializedParentSelectionCandidates, SerializedParentSelectionSubmission, SerializedParentSelectionState } from '../session/serialization'

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
  !seqView ? event : inheritHistoryRecordIdentity(event, { ...event, seq: seqView.eventSeqByKey.get(gameEventRefKey(event)) ?? event.seq } as GameEvent)

const filterHiddenHandEvents = (
  events: readonly GameEvent[],
  hiddenRefs: HiddenHandEventRefs,
  seqView: VisibleEventSeqView | null,
): GameEvent[] =>
  events
    .filter((event) => !isHiddenCurrentEvent(event, hiddenRefs))
    .map((event) => remapEventSeq(event, seqView))

const hasUnchangedArchiveFields = (packet: PublicEventArchivePacket): boolean => {
  if (packet.type === 'publicEvents.committed') {
    const length = packet.eventIds.length
    if (length === 0 || packet.eventSeqs.length !== length ||
      packet.firstEventSeq !== packet.eventSeqs[0] || packet.lastEventSeq !== packet.eventSeqs[length - 1]) return false
    for (let index = 0; index < length; index += 1) {
      if (!Object.hasOwn(packet.eventIds, index) || !Object.hasOwn(packet.eventSeqs, index)) return false
    }
    return true
  }
  const length = packet.canceledEvents.length
  if (length === 0 || packet.canceledEventIds.length !== length || packet.canceledSeqs.length !== length) return false
  for (let index = 0; index < length; index += 1) {
    const event = packet.canceledEvents[index]
    if (!event || packet.canceledEventIds[index] !== event.id || packet.canceledSeqs[index] !== event.seq) return false
  }
  return true
}

const filterHiddenHandArchive = (
  archive: readonly PublicEventArchivePacket[],
  hiddenRefs: HiddenHandEventRefs,
  seqView: VisibleEventSeqView | null,
): PublicEventArchivePacket[] => {
  const filtered: PublicEventArchivePacket[] = []
  let packetSeq = 1
  for (const packet of archive) {
    // A null seq view means no current or canceled event is hidden. Reuse only
    // packets whose derived fields already match; malformed/empty packets still
    // follow the original normalization path. The output array stays independent.
    if (!seqView && hasUnchangedArchiveFields(packet)) {
      filtered.push(packet)
      packetSeq += 1
      continue
    }
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
      filtered.push(inheritHistoryRecordIdentity(packet, {
        ...packet,
        id: seqView ? String(packetSeq) : packet.id,
        packetSeq: seqView ? packetSeq : packet.packetSeq,
        eventIds: visible.map((event) => event.id),
        eventSeqs,
        firstEventSeq: eventSeqs[0]!,
        lastEventSeq: eventSeqs[eventSeqs.length - 1]!,
      }))
      packetSeq += 1
      continue
    }
    const canceledEvents = packet.canceledEvents
      .filter((event) => !isHiddenCanceledEvent(event, packet.packetSeq, hiddenRefs))
      .map((event) => remapEventSeq(event, seqView))
    if (canceledEvents.length === 0) continue
    filtered.push(inheritHistoryRecordIdentity(packet, {
      ...packet,
      id: seqView ? String(packetSeq) : packet.id,
      packetSeq: seqView ? packetSeq : packet.packetSeq,
      previousMaxSeq: seqView ? seqView.maxVisibleSeqAt(packet.previousMaxSeq) : packet.previousMaxSeq,
      nextMaxSeq: seqView ? seqView.maxVisibleSeqAt(packet.nextMaxSeq) : packet.nextMaxSeq,
      canceledEvents,
      canceledEventIds: canceledEvents.map((event) => event.id),
      canceledSeqs: canceledEvents.map((event) => event.seq),
    }))
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

export const filterSerializedCancellationsForPlayer = (
  baseState: SerializedGameState,
  viewerPlayerId: string | null,
  cancellations: readonly PublicEventCancellation[] | undefined,
): PublicEventCancellation[] | undefined => {
  if (!cancellations?.length) return undefined
  const { base, hiddenRefs, seqView } = createHiddenHandVisibility(
    baseState,
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
 *   - draft-history card ids that are still hidden in another player's hand
 *     or private draft data.
 *   - `draft.pools[pid].occ`, `draft.pools[pid].minor`,
 *     `draft.kept[pid]`, and `draft.pendingPicks[pid]` for every
 *     player other than the viewer.
 *   - unresolved `parentSelection.candidates[pid]` and submitted
 *     parent choices for every player other than the viewer.
 *   - `gameSeed`, for every viewer: hands, draft pools and the round-card
 *     order all follow from it (ADR-0020).
 *   - Unrevealed Round Cards: their `roundActionOrder` entries and the
 *     `actionId` of goods scheduled on them become `null`. A card is revealed
 *     once its round starts or a card effect reveals it.
 *
 * Pass `viewerPlayerId = null` (or an unknown id) to produce a spectator
 * view where every player's hand and pool is masked.
 */
export type ViewerProjectionOptions = {
  /** Dev-room live sync only: keep the full round-card order. The seed stays withheld. */
  revealRoundCards?: boolean
}

export const filterSerializedStateForPlayer = (
  base: SerializedGameState,
  viewerPlayerId: string | null,
  options: ViewerProjectionOptions = {},
): SerializedGameState => {
  const { hiddenCardIds, hiddenRefs, seqView } = createHiddenHandVisibility(
    base,
    viewerPlayerId,
  )
  const hiddenDraftHistoryCardIds = new Map(
    base.players
      .filter((player) => player.id !== viewerPlayerId)
      .map((player) => [
        player.id,
        new Set([
          ...(hiddenCardIds.get(player.id) ?? []),
          ...(base.draft?.pools[player.id]?.occ ?? []),
          ...(base.draft?.pools[player.id]?.minor ?? []),
          ...(base.draft?.kept[player.id]?.occ ?? []),
          ...(base.draft?.kept[player.id]?.minor ?? []),
          ...(base.draft?.stages ?? []).flatMap((stage) => [
            ...(stage.pools[player.id]?.occ ?? []),
            ...(stage.pools[player.id]?.minor ?? []),
          ]),
          ...Object.values(base.draft?.pendingPicks[player.id] ?? {})
            .filter((cardId): cardId is string => typeof cardId === 'string'),
        ].filter((cardId) => cardId !== '?')),
      ]),
  )
  const filteredPlayers = base.players.map((p) => {
    const { lastDraftSubmission: _lastDraftSubmission, ...visiblePlayer } = p
    return p.id === viewerPlayerId
      ? visiblePlayer
      : {
          ...visiblePlayer,
          occupationHand: Array(p.occupationHand.length).fill('?'),
          minorHand: Array(p.minorHand.length).fill('?'),
          cardStates: filterHiddenHandCardStates(p.cardStates, hiddenCardIds.get(p.id)),
          stats: {
            ...p.stats,
            draftHistory: p.stats.draftHistory.map((entry) =>
              hiddenDraftHistoryCardIds.get(p.id)?.has(entry.cardId)
                ? { ...entry, cardId: '?' }
                : entry),
          },
        }
  })
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
  // A round card is revealed when its round starts, or when a card effect
  // reveals it and says so with a public `action.revealed` event. `round` is
  // already 1 during the draft and Parent Selection, before round 1 has begun.
  const revealedByEffect = new Set(base.events.flatMap((event) =>
    event.type === 'action.revealed' && base.roundActionOrder[event.roundSlot - 1] === event.actionId
      ? [event.roundSlot]
      : []))
  const isRevealed = (round: number): boolean =>
    (base.phase === 'playing' && round <= base.round) || revealedByEffect.has(round)
  const { gameSeed: _gameSeed, ...withoutSeed } = base
  return {
    ...withoutSeed,
    ...(options.revealRoundCards
      ? {}
      : {
          roundActionOrder: base.roundActionOrder.map((actionId, index) =>
            isRevealed(index + 1) ? actionId : null),
          futureMeeples: base.futureMeeples.map((meeple) =>
            isRevealed(meeple.round) ? meeple : { ...meeple, actionId: null }),
        }),
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
