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

const silentReplayableEvent = (id: string, seq: number): GameEvent => ({
  schemaVersion: 1,
  id,
  seq,
  round: 2,
  phase: 'work',
  visibility: 'public',
  actorPlayerId: 'p1',
  type: 'resource.moved',
  resources: { wood: 1 },
  from: { kind: 'card', cardId: 'A1_Test' },
  to: { kind: 'card', cardId: 'A2_Test' },
  reason: 'cardEffect',
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
  it('does not render an extra pays-for row for a payment absorbed by card.played', () => {
    const paid: GameEvent = {
      ...paidEvent('evt-paid', 7),
      paymentFor: 'major-improvement',
      sourceCardId: 'Major_Basket',
    } as GameEvent
    const played: GameEvent = {
      ...playedEvent('evt-played', 8),
      cardId: 'Major_Basket',
      cardType: 'major',
    } as GameEvent

    const buckets = buildActionLogTimelineRows({
      entries: [
        replayEntryForEvent(paid, 3, 0),
        replayEntryForEvent(played, 3, 1),
      ],
      stateLog: [],
      currentRound: 2,
      locale: 'en',
      playerNames: { p1: 'Alice' },
    })

    const rows = buckets.flatMap((bucket) => bucket.rows)
    const keys = rows.map((row) => (row.kind === 'event' ? row.logEntry?.key : row.logEntry.key))
    expect(keys).toContain('log.playImprovement')
    expect(keys).not.toContain('log.cardEffectPay')
    const improvement = rows.find((row) => row.logEntry?.key === 'log.playImprovement')
    expect(improvement?.logEntry?.params?.costResources).toEqual({ wood: 1 })
  })

  it('suppresses the absorbed stable payment emitted AFTER farm.stableBuilt', () => {
    const stableBuilt: GameEvent = {
      schemaVersion: 1,
      id: 'evt-stable',
      seq: 5,
      round: 2,
      phase: 'work',
      visibility: 'public',
      actorPlayerId: 'p1',
      type: 'farm.stableBuilt',
      stables: [{ row: 0, col: 0 }],
    } as unknown as GameEvent
    const paid: GameEvent = {
      ...paidEvent('evt-paid', 6),
      paymentFor: 'stables',
      sourceCardId: 'SomeCard',
    } as GameEvent

    const buckets = buildActionLogTimelineRows({
      entries: [
        replayEntryForEvent(stableBuilt, 3, 0),
        replayEntryForEvent(paid, 3, 1),
      ],
      stateLog: [],
      currentRound: 2,
      locale: 'en',
      playerNames: { p1: 'Alice' },
    })

    const rows = buckets.flatMap((bucket) => bucket.rows)
    const keys = rows.map((row) => row.logEntry?.key)
    expect(keys).not.toContain('log.cardEffectPay')
  })

  it('keeps absorbed payments out of canceled (undone) timeline rows too', () => {
    const paid: GameEvent = {
      ...paidEvent('evt-paid', 7),
      paymentFor: 'major-improvement',
      sourceCardId: 'Major_Basket',
    } as GameEvent
    const played: GameEvent = {
      ...playedEvent('evt-played', 8),
      cardId: 'Major_Basket',
      cardType: 'major',
    } as GameEvent

    const buckets = buildActionLogTimelineRows({
      entries: [
        { ...replayEntryForEvent(paid, 3, 0), status: 'canceled' as const, replayable: false },
        { ...replayEntryForEvent(played, 3, 1), status: 'canceled' as const, replayable: false },
      ],
      stateLog: [],
      currentRound: 2,
      locale: 'en',
      playerNames: { p1: 'Alice' },
    })

    const rows = buckets.flatMap((bucket) => bucket.rows)
    const keys = rows.map((row) => row.logEntry?.key)
    expect(keys).toContain('log.playImprovement')
    expect(keys).not.toContain('log.cardEffectPay')
  })

  it('does not suppress same-seq payments from unrelated archive packets', () => {
    const absorbedPaid: GameEvent = {
      ...paidEvent('evt-paid-absorbed', 7),
      paymentFor: 'major-improvement',
      sourceCardId: 'Major_Basket',
    } as GameEvent
    const played: GameEvent = {
      ...playedEvent('evt-played', 8),
      cardId: 'Major_Basket',
      cardType: 'major',
    } as GameEvent
    const standalonePaid: GameEvent = {
      ...paidEvent('evt-paid-standalone', 7),
      paymentFor: 'minor-improvement',
      sourceCardId: 'A1_TestMinor',
    } as GameEvent

    const buckets = buildActionLogTimelineRows({
      entries: [
        replayEntryForEvent(absorbedPaid, 3, 0),
        replayEntryForEvent(played, 3, 1),
        replayEntryForEvent(standalonePaid, 4, 0),
      ],
      stateLog: [],
      currentRound: 2,
      locale: 'en',
      playerNames: { p1: 'Alice' },
    })

    const rows = buckets.flatMap((bucket) => bucket.rows)
    const standalone = rows.find((row) => row.key === 'event:4:0:evt-paid-standalone:7')
    expect(standalone?.logEntry?.key).toBe('log.cardEffectPay')
  })

  it('builds replay event rows and keeps state log rows', () => {
    const stateLog: LogEntry[] = [
      { key: 'log.startGame' },
    ]

    const buckets = buildActionLogTimelineRows({
      entries: [replayEntry()],
      stateLog,
      currentRound: 2,
      locale: 'en',
      playerNames: { p1: 'Alice' },
      actionNames: { forest: 'Forest' },
    })

    expect(buckets).toHaveLength(1)
    expect(buckets[0]?.round).toBe(2)
    expect(buckets[0]?.rows.map((row) => row.kind)).toEqual(['event', 'stateLog'])
    expect(buckets[0]?.rows[0]).toMatchObject({
      kind: 'event',
      status: 'active',
      replayable: true,
      label: '',
    })
    expect(buckets[0]?.rows[1]).toMatchObject({ kind: 'stateLog', replayable: false })
  })

  it('does not duplicate state log rows already derived from active replay events', () => {
    const buckets = buildActionLogTimelineRows({
      entries: [replayEntry()],
      stateLog: [
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

    expect(buckets[0]?.rows.map((row) => row.kind)).toEqual(['event', 'stateLog'])
    expect(buckets[0]?.rows[1]).toMatchObject({
      kind: 'stateLog',
      logEntry: { key: 'log.startGame' },
    })
  })

  it('uses context-aware event logs for replay rows before removing derived state log rows', () => {
    const paid = paidEvent('evt-pay', 1)
    const played = playedEvent('evt-play', 2)
    const buckets = buildActionLogTimelineRows({
      entries: [replayEntryForEvent(paid, 1, 0), replayEntryForEvent(played, 1, 1)],
      stateLog: [
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
          player: 'Alice',
          improvements: 'A1_TestMinor',
          costResources: { wood: 1 },
        },
      },
    })
    expect(rows.some((row) =>
      row.kind === 'stateLog' && row.logEntry.key === 'log.playMinorImprovement')).toBe(false)
  })

  it('uses a structured fallback for replayable silent events without logs or notifications', () => {
    const event = silentReplayableEvent('evt-silent-replayable', 3)
    const buckets = buildActionLogTimelineRows({
      entries: [replayEntryForEvent(event, 1)],
      stateLog: [],
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
    expect(row?.label).toContain('resource.moved')
    expect(row?.label).toContain('seq=3')
  })

  it('omits metadata-only replay entries without logs or notifications', () => {
    const event = cardStateChangedEvent('evt-card-state', 3)
    const buckets = buildActionLogTimelineRows({
      entries: [{ ...replayEntryForEvent(event, 1), replayable: false }],
      stateLog: [],
      currentRound: 2,
      locale: 'en',
      playerNames: { p1: 'Alice' },
      actionNames: {},
    })

    expect(buckets).toEqual([])
  })

  it('does not attach payment context across archive packet boundaries', () => {
    const paid = paidEvent('evt-pay', 1)
    const played = playedEvent('evt-play', 2)
    const buckets = buildActionLogTimelineRows({
      entries: [replayEntryForEvent(paid, 1), replayEntryForEvent(played, 2)],
      stateLog: [],
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
      stateLog: [],
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

  it('keeps missing and state log rows non-replayable', () => {
    const buckets = buildActionLogTimelineRows({
      entries: [replayEntry({ event: null, status: 'missing', payloadSource: 'missing', replayable: false })],
      stateLog: [{ key: 'log.startGame' }],
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
      { kind: 'stateLog', replayable: false },
    ])
  })
})
