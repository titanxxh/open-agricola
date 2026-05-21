import type { GameEvent, PublicEventArchivePacket } from '../contract/events'
import type { GameState } from '../contract/types'
import {
  assertEventSizeUnderLimit,
  assertGameEventEnvelope,
  assertJsonSafeEvent,
  assertKnownGameEventShape,
  assertPublicGameEvent,
} from './guards'

const EVENT_SIZE_LIMIT = 4096

type ArchiveState = Pick<GameState, 'publicEventArchive' | 'nextPublicEventArchivePacketSeq'>

export class PublicEventArchivePayloadError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message)
    this.name = 'PublicEventArchivePayloadError'
    this.cause = options?.cause
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isPositiveSafeInteger = (value: unknown): value is number =>
  Number.isSafeInteger(value) && (value as number) > 0

const isNonNegativeSafeInteger = (value: unknown): value is number =>
  Number.isSafeInteger(value) && (value as number) >= 0

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === 'string' && entry.length > 0)

const isPositiveNumberArray = (value: unknown): value is number[] =>
  Array.isArray(value) && value.every(isPositiveSafeInteger)

const isStrictlyAscending = (values: readonly number[]): boolean =>
  values.every((value, index) => index === 0 || value > values[index - 1]!)

const hasDuplicates = <T>(values: readonly T[]): boolean =>
  new Set(values).size !== values.length

const committedPacketKeys = new Set([
  'schemaVersion',
  'id',
  'packetSeq',
  'type',
  'eventIds',
  'eventSeqs',
  'firstEventSeq',
  'lastEventSeq',
])

const canceledPacketKeys = new Set([
  'schemaVersion',
  'id',
  'packetSeq',
  'type',
  'reason',
  'previousMaxSeq',
  'nextMaxSeq',
  'canceledEventIds',
  'canceledSeqs',
  'canceledEvents',
])

const hasOnlyKeys = (value: Record<string, unknown>, allowed: ReadonlySet<string>): boolean =>
  Object.keys(value).every((key) => allowed.has(key))

const assertSafePublicEvent: (event: unknown) => asserts event is GameEvent = (event) => {
  assertGameEventEnvelope(event)
  assertKnownGameEventShape(event)
  assertPublicGameEvent(event)
  assertJsonSafeEvent(event)
  assertEventSizeUnderLimit(event, EVENT_SIZE_LIMIT)
}

const assertSafeCanceledEventPayload: (event: unknown) => asserts event is GameEvent = (event) => {
  try {
    assertSafePublicEvent(event)
  } catch (error) {
    throw new PublicEventArchivePayloadError('Invalid canceled public event archive payload', { cause: error })
  }
}

const isPersistedPublicEventArchivePacket = (
  value: unknown,
  seenPacketSeqs?: ReadonlySet<number>,
): value is PublicEventArchivePacket => {
  try {
    if (!isRecord(value)) return false
    assertJsonSafeEvent(value)
    if (value.schemaVersion !== 1) return false
    if (typeof value.id !== 'string' || value.id.length === 0) return false
    if (!isPositiveSafeInteger(value.packetSeq)) return false
    if (value.id !== String(value.packetSeq)) return false
    if (seenPacketSeqs?.has(value.packetSeq)) return false
    if (value.type === 'publicEvents.committed') {
      if (!hasOnlyKeys(value, committedPacketKeys)) return false
      if (!isStringArray(value.eventIds)) return false
      if (!isPositiveNumberArray(value.eventSeqs)) return false
      if (value.eventIds.length === 0 || value.eventIds.length !== value.eventSeqs.length) return false
      if (hasDuplicates(value.eventIds) || hasDuplicates(value.eventSeqs)) return false
      if (!isStrictlyAscending(value.eventSeqs)) return false
      if (value.firstEventSeq !== value.eventSeqs[0]) return false
      if (value.lastEventSeq !== value.eventSeqs[value.eventSeqs.length - 1]) return false
      return true
    }
    if (value.type === 'publicEvents.canceled') {
      if (!hasOnlyKeys(value, canceledPacketKeys)) return false
      if (value.reason !== 'undoStep' && value.reason !== 'undoAction') return false
      const { previousMaxSeq, nextMaxSeq } = value
      if (!isNonNegativeSafeInteger(previousMaxSeq)) return false
      if (!isNonNegativeSafeInteger(nextMaxSeq)) return false
      const { canceledEventIds, canceledSeqs, canceledEvents } = value
      if (!isStringArray(canceledEventIds)) return false
      if (!isPositiveNumberArray(canceledSeqs)) return false
      if (!Array.isArray(canceledEvents)) return false
      if (previousMaxSeq < nextMaxSeq) return false
      if (
        canceledEventIds.length === 0 ||
        canceledEventIds.length !== canceledSeqs.length ||
        canceledEventIds.length !== canceledEvents.length
      ) return false
      if (hasDuplicates(canceledEventIds) || hasDuplicates(canceledSeqs)) return false
      if (!isStrictlyAscending(canceledSeqs)) return false
      canceledEvents.forEach(assertSafePublicEvent)
      if (!canceledEvents.every((event, index) =>
        event.id === canceledEventIds[index] &&
        event.seq === canceledSeqs[index] &&
        event.seq <= previousMaxSeq
      )) return false
      return true
    }
    return false
  } catch {
    return false
  }
}

export const assertPublicEventArchiveCanAppend = (state: ArchiveState): void => {
  if (!Array.isArray(state.publicEventArchive)) {
    throw new Error('Invalid public event archive state')
  }
  const seenPacketSeqs = new Set<number>()
  for (const [index, packet] of state.publicEventArchive.entries()) {
    if (!isPersistedPublicEventArchivePacket(packet, seenPacketSeqs)) {
      throw new Error('Invalid public event archive state')
    }
    if (packet.packetSeq !== index + 1) {
      throw new Error('Invalid public event archive state')
    }
    seenPacketSeqs.add(packet.packetSeq)
  }
  if (
    !isPositiveSafeInteger(state.nextPublicEventArchivePacketSeq) ||
    state.nextPublicEventArchivePacketSeq !== state.publicEventArchive.length + 1
  ) {
    throw new Error('Invalid public event archive state')
  }
}

const backfillMissingArchiveState = (state: GameState): void => {
  const raw = state as Partial<ArchiveState>
  if (raw.publicEventArchive === undefined && raw.nextPublicEventArchivePacketSeq === undefined) {
    state.publicEventArchive = []
    state.nextPublicEventArchivePacketSeq = 1
  }
}

const cloneEvent = (event: GameEvent): GameEvent =>
  JSON.parse(JSON.stringify(event)) as GameEvent

const existingPacketSeqs = (archive: unknown): ReadonlySet<number> => {
  if (!Array.isArray(archive)) return new Set()
  return new Set(archive
    .map((packet) => isRecord(packet) ? packet.packetSeq : undefined)
    .filter(isPositiveSafeInteger))
}

const assertPublicEventArchivePacket = (
  packet: PublicEventArchivePacket,
  archive: unknown,
): void => {
  if (!isPersistedPublicEventArchivePacket(packet, existingPacketSeqs(archive))) {
    throw new Error('Invalid public event archive packet')
  }
}

export const normalizePublicEventArchive = (
  rawArchive: unknown,
  rawNextPacketSeq: unknown,
): ArchiveState => {
  const publicEventArchive: PublicEventArchivePacket[] = []
  const seenPacketSeqs = new Set<number>()
  if (Array.isArray(rawArchive)) {
    for (const packet of rawArchive) {
      if (!isPersistedPublicEventArchivePacket(packet, seenPacketSeqs)) continue
      if (packet.packetSeq !== publicEventArchive.length + 1) continue
      publicEventArchive.push(packet)
      seenPacketSeqs.add(packet.packetSeq)
    }
  }
  const expectedNextPacketSeq = publicEventArchive.length + 1
  const nextPublicEventArchivePacketSeq =
    isPositiveSafeInteger(rawNextPacketSeq) && rawNextPacketSeq === expectedNextPacketSeq
      ? rawNextPacketSeq
      : expectedNextPacketSeq
  return { publicEventArchive, nextPublicEventArchivePacketSeq }
}

export const appendPublicEventCommittedPacket = (
  state: GameState,
  committed: readonly GameEvent[],
): void => {
  if (committed.length === 0) return
  backfillMissingArchiveState(state)
  assertPublicEventArchiveCanAppend(state)
  committed.forEach(assertSafePublicEvent)
  const packetSeq = state.nextPublicEventArchivePacketSeq
  const eventSeqs = committed.map((event) => event.seq)
  const packet: PublicEventArchivePacket = {
    schemaVersion: 1,
    id: String(packetSeq),
    packetSeq,
    type: 'publicEvents.committed',
    eventIds: committed.map((event) => event.id),
    eventSeqs,
    firstEventSeq: eventSeqs[0]!,
    lastEventSeq: eventSeqs[eventSeqs.length - 1]!,
  }
  assertPublicEventArchivePacket(packet, state.publicEventArchive)
  state.publicEventArchive = [...state.publicEventArchive, packet]
  state.nextPublicEventArchivePacketSeq = packetSeq + 1
}

export const appendPublicEventCanceledPacket = (
  state: GameState,
  packet: Omit<Extract<PublicEventArchivePacket, { type: 'publicEvents.canceled' }>, 'schemaVersion' | 'id' | 'packetSeq' | 'type'>,
): void => {
  if (packet.canceledEvents.length === 0) return
  backfillMissingArchiveState(state)
  assertPublicEventArchiveCanAppend(state)
  const archiveBeforeAppend = state.publicEventArchive
  const nextPacketSeqBeforeAppend = state.nextPublicEventArchivePacketSeq
  try {
    packet.canceledEvents.forEach(assertSafeCanceledEventPayload)
    const packetSeq = state.nextPublicEventArchivePacketSeq
    const archivePacket: PublicEventArchivePacket = {
      schemaVersion: 1,
      id: String(packetSeq),
      packetSeq,
      type: 'publicEvents.canceled',
      ...packet,
      canceledEventIds: [...packet.canceledEventIds],
      canceledSeqs: [...packet.canceledSeqs],
      canceledEvents: packet.canceledEvents.map(cloneEvent),
    }
    assertPublicEventArchivePacket(archivePacket, state.publicEventArchive)
    state.publicEventArchive = [...state.publicEventArchive, archivePacket]
    state.nextPublicEventArchivePacketSeq = packetSeq + 1
  } catch (error) {
    state.publicEventArchive = archiveBeforeAppend
    state.nextPublicEventArchivePacketSeq = nextPacketSeqBeforeAppend
    throw error
  }
}
