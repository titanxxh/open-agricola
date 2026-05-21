import { describe, expect, it } from 'vitest'
import type { GameEvent, PublicEventArchivePacket } from '../../../shared/contract/events'
import { buildReplayTimeline, filterReplayTimeline, summarizeReplayTimeline } from '../replay-timeline'

const event = (id: string, seq: number, type: GameEvent['type'] = 'resource.moved'): GameEvent => ({
  schemaVersion: 1,
  id,
  seq,
  round: 1,
  phase: 'work',
  visibility: 'public',
  actorPlayerId: 'p1',
  type,
  resources: { wood: 1 },
  from: { kind: 'actionSpace', spaceId: 'forest' },
  to: { kind: 'player', playerId: 'p1' },
  reason: 'collect',
} as GameEvent)

const committed = (
  packetSeq: number,
  refs: Array<{ id: string; seq: number }>,
): PublicEventArchivePacket => ({
  schemaVersion: 1,
  id: `packet-${packetSeq}`,
  packetSeq,
  type: 'publicEvents.committed',
  eventIds: refs.map((ref) => ref.id),
  eventSeqs: refs.map((ref) => ref.seq),
  firstEventSeq: refs[0]?.seq ?? 0,
  lastEventSeq: refs.at(-1)?.seq ?? 0,
})

const canceled = (
  packetSeq: number,
  canceledEvents: GameEvent[],
): PublicEventArchivePacket => ({
  schemaVersion: 1,
  id: `packet-${packetSeq}`,
  packetSeq,
  type: 'publicEvents.canceled',
  reason: 'undoAction',
  previousMaxSeq: 10,
  nextMaxSeq: 5,
  canceledEventIds: canceledEvents.map((entry) => entry.id),
  canceledSeqs: canceledEvents.map((entry) => entry.seq),
  canceledEvents,
})

describe('buildReplayTimeline', () => {
  it('builds active entries from committed packets and current events', () => {
    const entries = buildReplayTimeline({
      events: [event('evt-1', 1), event('evt-2', 2)],
      publicEventArchive: [committed(1, [{ id: 'evt-1', seq: 1 }, { id: 'evt-2', seq: 2 }])],
    })

    expect(entries.map((entry) => ({
      key: entry.key,
      packetSeq: entry.packetSeq,
      packetLocalIndex: entry.packetLocalIndex,
      status: entry.status,
      payloadSource: entry.payloadSource,
    }))).toEqual([
      { key: 'event:1:0:evt-1:1', packetSeq: 1, packetLocalIndex: 0, status: 'active', payloadSource: 'currentEvents' },
      { key: 'event:1:1:evt-2:2', packetSeq: 1, packetLocalIndex: 1, status: 'active', payloadSource: 'currentEvents' },
    ])
  })

  it('marks missing entries without replay payload', () => {
    const entries = buildReplayTimeline({
      events: [],
      publicEventArchive: [committed(1, [{ id: 'missing', seq: 9 }])],
    })

    expect(entries[0]).toMatchObject({
      status: 'missing',
      event: null,
      payloadSource: 'missing',
      replayable: false,
    })
  })

  it('uses canceledArchive payload and cancels only the nearest previous matching active entry', () => {
    const oldPayload = { ...event('evt-reused', 3), resources: { wood: 2 } } satisfies GameEvent
    const newPayload = { ...event('evt-reused', 3), resources: { clay: 1 } } satisfies GameEvent

    const entries = buildReplayTimeline({
      events: [newPayload],
      publicEventArchive: [
        committed(1, [{ id: 'evt-reused', seq: 3 }]),
        canceled(2, [oldPayload]),
        committed(3, [{ id: 'evt-reused', seq: 3 }]),
      ],
    })

    expect(entries.map((entry) => ({
      key: entry.key,
      status: entry.status,
      payloadSource: entry.payloadSource,
      canceledByPacketSeq: entry.canceledByPacketSeq,
      resources: entry.event && 'resources' in entry.event ? entry.event.resources : undefined,
    }))).toEqual([
      {
        key: 'event:1:0:evt-reused:3',
        status: 'canceled',
        payloadSource: 'canceledArchive',
        canceledByPacketSeq: 2,
        resources: { wood: 2 },
      },
      {
        key: 'event:3:0:evt-reused:3',
        status: 'active',
        payloadSource: 'currentEvents',
        canceledByPacketSeq: undefined,
        resources: { clay: 1 },
      },
    ])
  })

  it('uses canceledArchive payload when the canceled event is no longer in current events', () => {
    const canceledPayload = { ...event('evt-undone', 4), resources: { reed: 1 } } satisfies GameEvent

    const entries = buildReplayTimeline({
      events: [],
      publicEventArchive: [
        committed(1, [{ id: 'evt-undone', seq: 4 }]),
        canceled(2, [canceledPayload]),
      ],
    })

    expect(entries).toEqual([
      expect.objectContaining({
        key: 'event:1:0:evt-undone:4',
        status: 'canceled',
        payloadSource: 'canceledArchive',
        event: canceledPayload,
        replayable: true,
        canceledByPacketSeq: 2,
      }),
    ])
  })

  it('filters and summarizes entries', () => {
    const entries = buildReplayTimeline({
      events: [event('a', 1), event('b', 2)],
      publicEventArchive: [
        committed(1, [{ id: 'a', seq: 1 }, { id: 'missing', seq: 9 }]),
        canceled(2, [event('a', 1)]),
        committed(3, [{ id: 'b', seq: 2 }]),
      ],
    })

    expect(filterReplayTimeline(entries, 'active').map((entry) => entry.eventId)).toEqual(['b'])
    expect(filterReplayTimeline(entries, 'canceled').map((entry) => entry.eventId)).toEqual(['a'])
    expect(summarizeReplayTimeline(entries)).toEqual({
      totalEvents: 3,
      activeEvents: 1,
      canceledEvents: 1,
      missingEvents: 1,
    })
  })
})
