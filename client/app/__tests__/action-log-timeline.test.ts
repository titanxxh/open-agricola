import { describe, expect, it } from 'vitest'
import type { GameEvent } from '../../../shared/contract/events'
import type { LogEntry } from '../../../shared/contract/types'
import type { ReplayTimelineEntry } from '../replay-timeline'
import { buildActionLogTimelineRows } from '../action-log-timeline'

const movedEvent = (id: string, seq: number): GameEvent => ({
  schemaVersion: 1,
  id,
  seq,
  round: 2,
  phase: 'work',
  visibility: 'public',
  actorPlayerId: 'p1',
  type: 'resource.moved',
  resources: { wood: 3 },
  from: { kind: 'actionSpace', spaceId: 'forest' },
  to: { kind: 'player', playerId: 'p1' },
  reason: 'collect',
})

const paidEvent = (id: string, seq: number): GameEvent => ({
  schemaVersion: 1,
  id,
  seq,
  round: 2,
  phase: 'work',
  visibility: 'public',
  actorPlayerId: 'p1',
  type: 'resource.paid',
  resources: { wood: 1 },
  paymentFor: 'minor-improvement',
})

const playedEvent = (id: string, seq: number): GameEvent => ({
  schemaVersion: 1,
  id,
  seq,
  round: 2,
  phase: 'work',
  visibility: 'public',
  actorPlayerId: 'p1',
  type: 'card.played',
  cardId: 'A1_TestMinor',
  cardType: 'minor',
})

const cardStateChangedEvent = (id: string, seq: number): GameEvent => ({
  schemaVersion: 1,
  id,
  seq,
  round: 2,
  phase: 'work',
  visibility: 'public',
  targetPlayerId: 'p1',
  type: 'card.stateChanged',
  cardId: 'B21_HayloftBarn',
  key: 'food',
  value: 3,
})

const replayEntry = (
  overrides: Partial<ReplayTimelineEntry> = {},
): ReplayTimelineEntry => {
  const event = movedEvent('evt-1', 1)
  return {
    key: 'event:1:0:evt-1:1',
    kind: 'event',
    packetSeq: 1,
    packetLocalIndex: 0,
    event,
    eventId: event.id,
    eventSeq: event.seq,
    status: 'active',
    payloadSource: 'currentEvents',
    replayable: true,
    ...overrides,
  }
}

const replayEntryForEvent = (
  event: GameEvent,
  packetSeq: number,
  packetLocalIndex = 0,
): ReplayTimelineEntry => ({
  key: `event:${packetSeq}:${packetLocalIndex}:${event.id}:${event.seq}`,
  kind: 'event',
  packetSeq,
  packetLocalIndex,
  event,
  eventId: event.id,
  eventSeq: event.seq,
  status: 'active',
  payloadSource: 'currentEvents',
  replayable: true,
})

describe('buildActionLogTimelineRows', () => {
  it('builds replay event rows and keeps legacy log rows', () => {
    const legacyLog: LogEntry[] = [
      { key: 'log.startGame' },
    ]

    const buckets = buildActionLogTimelineRows({
      entries: [replayEntry()],
      legacyLog,
      currentRound: 2,
      locale: 'en',
      playerNames: { p1: 'Alice' },
      actionNames: { forest: 'Forest' },
    })

    expect(buckets).toHaveLength(1)
    expect(buckets[0]?.round).toBe(2)
    expect(buckets[0]?.rows.map((row) => row.kind)).toEqual(['event', 'legacyLog'])
    expect(buckets[0]?.rows[0]).toMatchObject({
      kind: 'event',
      status: 'active',
      replayable: true,
      label: '',
    })
    expect(buckets[0]?.rows[1]).toMatchObject({ kind: 'legacyLog', replayable: false })
  })

  it('does not duplicate legacy log rows already derived from active replay events', () => {
    const buckets = buildActionLogTimelineRows({
      entries: [replayEntry()],
      legacyLog: [
        {
          key: 'log.actionDetail',
          params: {
            player: 'Alice',
            action: 'Forest',
            detailParts: { gains: { wood: 3 } },
          },
        },
        { key: 'log.startGame' },
      ],
      currentRound: 2,
      locale: 'en',
      playerNames: { p1: 'Alice' },
      actionNames: { forest: 'Forest' },
    })

    expect(buckets[0]?.rows.map((row) => row.kind)).toEqual(['event', 'legacyLog'])
    expect(buckets[0]?.rows[1]).toMatchObject({
      kind: 'legacyLog',
      logEntry: { key: 'log.startGame' },
    })
  })

  it('uses context-aware event logs for replay rows before removing derived legacy rows', () => {
    const paid = paidEvent('evt-pay', 1)
    const played = playedEvent('evt-play', 2)
    const buckets = buildActionLogTimelineRows({
      entries: [replayEntryForEvent(paid, 1, 0), replayEntryForEvent(played, 1, 1)],
      legacyLog: [
        {
          key: 'log.playMinorImprovement',
          params: {
            improvements: 'A1_TestMinor',
            costResources: { wood: 1 },
          },
        },
      ],
      currentRound: 2,
      locale: 'en',
      playerNames: { p1: 'Alice' },
      actionNames: {},
    })

    const rows = buckets.flatMap((bucket) => bucket.rows)
    const playedRow = rows.find((row) => row.key === 'event:1:1:evt-play:2')

    expect(playedRow).toMatchObject({
      kind: 'event',
      logEntry: {
        key: 'log.playMinorImprovement',
        params: {
          improvements: 'A1_TestMinor',
          costResources: { wood: 1 },
        },
      },
    })
    expect(rows.some((row) =>
      row.kind === 'legacyLog' && row.logEntry.key === 'log.playMinorImprovement')).toBe(false)
  })

  it('uses a structured fallback for replayable silent events without logs or notifications', () => {
    const event = cardStateChangedEvent('evt-card-state', 3)
    const buckets = buildActionLogTimelineRows({
      entries: [replayEntryForEvent(event, 1)],
      legacyLog: [],
      currentRound: 2,
      locale: 'en',
      playerNames: { p1: 'Alice' },
      actionNames: {},
    })

    const row = buckets.flatMap((bucket) => bucket.rows)[0]

    expect(row).toMatchObject({
      kind: 'event',
      logEntry: null,
      replayable: true,
    })
    expect(row?.label).toContain('card.stateChanged')
    expect(row?.label).toContain('B21_HayloftBarn')
  })

  it('does not attach payment context across archive packet boundaries', () => {
    const paid = paidEvent('evt-pay', 1)
    const played = playedEvent('evt-play', 2)
    const buckets = buildActionLogTimelineRows({
      entries: [replayEntryForEvent(paid, 1), replayEntryForEvent(played, 2)],
      legacyLog: [],
      currentRound: 2,
      locale: 'en',
      playerNames: { p1: 'Alice' },
      actionNames: {},
    })

    const rows = buckets.flatMap((bucket) => bucket.rows)
    const playedRow = rows.find((row) => row.key === 'event:2:0:evt-play:2')

    expect(playedRow).toMatchObject({
      kind: 'event',
      logEntry: {
        key: 'log.playMinorImprovement',
        params: {
          improvements: 'A1_TestMinor',
        },
      },
    })
    if (!playedRow || playedRow.kind !== 'event') throw new Error('missing replay row')
    expect(playedRow.logEntry?.params?.costResources).toEqual({})
  })

  it('marks canceled event rows as replayable strikethrough rows', () => {
    const buckets = buildActionLogTimelineRows({
      entries: [
        replayEntry({
          status: 'canceled',
          payloadSource: 'canceledArchive',
          canceledByPacketSeq: 2,
        }),
      ],
      legacyLog: [],
      currentRound: 2,
      locale: 'zh',
      playerNames: { p1: '玩家A' },
      actionNames: { forest: '森林' },
    })

    expect(buckets[0]?.rows[0]).toMatchObject({
      kind: 'event',
      status: 'canceled',
      replayable: true,
      strikethrough: true,
    })
  })

  it('keeps missing and legacy rows non-replayable', () => {
    const buckets = buildActionLogTimelineRows({
      entries: [replayEntry({ event: null, status: 'missing', payloadSource: 'missing', replayable: false })],
      legacyLog: [{ key: 'log.startGame' }],
      currentRound: 1,
      locale: 'en',
      playerNames: {},
      actionNames: {},
    })

    expect(buckets.flatMap((bucket) => bucket.rows).map((row) => ({
      kind: row.kind,
      replayable: row.replayable,
    }))).toEqual([
      { kind: 'event', replayable: false },
      { kind: 'legacyLog', replayable: false },
    ])
  })
})
