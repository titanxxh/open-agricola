import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
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
  cardId: 'A001_TestMinor',
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
  cardId: 'B021_HayloftBarn',
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
  from: { kind: 'card', cardId: 'A001_Test' },
  to: { kind: 'card', cardId: 'A002_Test' },
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
  it('does not keep timeline-local state log identity rules', () => {
    const source = readFileSync(fileURLToPath(new URL('../action-log-timeline.ts', import.meta.url)), 'utf8')

    expect(source).not.toContain('const stableValue')
    expect(source).not.toContain('const logEntryIdentity')
  })

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
      sourceCardId: 'A001_TestMinor',
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

  it('keeps newer state-only logs ahead of replay-derived rows', () => {
    const buckets = buildActionLogTimelineRows({
      entries: [replayEntry()],
      stateLog: [
        { key: 'log.provisionalContinuationRollback' },
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

    expect(buckets[0]?.rows.map((row) => row.logEntry?.key)).toEqual([
      'log.provisionalContinuationRollback',
      'log.actionDetail',
      'log.startGame',
    ])
  })

  it('keeps the round cursor across a replay-derived state-log split', () => {
    const buckets = buildActionLogTimelineRows({
      entries: [replayEntry()],
      stateLog: [
        { key: 'log.enterRound', params: { round: 3 } },
        { key: 'log.startGame' },
        {
          key: 'log.actionDetail',
          params: {
            player: 'Alice',
            action: 'Forest',
            detailParts: { gains: { wood: 3 } },
          },
        },
        { key: 'log.provisionalContinuationRollback' },
      ],
      currentRound: 3,
      locale: 'en',
      playerNames: { p1: 'Alice' },
      actionNames: { forest: 'Forest' },
    })

    const rollback = buckets.flatMap((bucket) => bucket.rows)
      .find((row) => row.logEntry?.key === 'log.provisionalContinuationRollback')
    expect(rollback?.round).toBe(2)
  })

  it('suppresses pure resource future resolution across archive packets', () => {
    const resolved = {
      schemaVersion: 1,
      id: 'evt-future',
      seq: 4,
      round: 3,
      phase: 'work',
      visibility: 'public',
      actorPlayerId: 'p2',
      sourceCardId: 'PR11',
      type: 'futureMeeple.resolved',
      playerId: 'p2',
      cardId: 'PR11',
      resources: { food: 1 },
    } satisfies GameEvent
    const received = {
      schemaVersion: 1,
      id: 'evt-received',
      seq: 5,
      round: 3,
      phase: 'work',
      visibility: 'public',
      actorPlayerId: 'p2',
      sourceActionId: 'receive',
      sourceCardId: 'PR11',
      type: 'resource.moved',
      resources: { food: 1 },
      from: { kind: 'roundCard', round: 3 },
      to: { kind: 'player', playerId: 'p2' },
      reason: 'receive',
    } satisfies GameEvent

    const buckets = buildActionLogTimelineRows({
      entries: [
        replayEntryForEvent(resolved, 1),
        replayEntryForEvent(received, 2),
      ],
      stateLog: [
        {
          key: 'log.actionDetail',
          params: {
            player: 'Player 2',
            action: 'actions.receive.name',
            detailParts: { gains: { food: 1 } },
          },
        },
      ],
      currentRound: 3,
      locale: 'en',
      playerNames: { p2: 'Player 2' },
    })

    const rows = buckets.flatMap((bucket) => bucket.rows)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.logEntry?.key).toBe('log.actionDetail')
    expect(rows[0]?.logEntry?.params?.action).toBe('actions.receive.name')
  })

  it('keeps future resolution when it has a standalone room effect', () => {
    const resolved = {
      schemaVersion: 1,
      id: 'evt-future-room',
      seq: 4,
      round: 3,
      phase: 'work',
      visibility: 'public',
      actorPlayerId: 'p2',
      sourceCardId: 'B157_Salter',
      type: 'futureMeeple.resolved',
      playerId: 'p2',
      cardId: 'B157_Salter',
      resources: { food: 2 },
      roomType: 'clay',
    } satisfies GameEvent
    const received = {
      schemaVersion: 1,
      id: 'evt-received-room',
      seq: 5,
      round: 3,
      phase: 'work',
      visibility: 'public',
      actorPlayerId: 'p2',
      sourceActionId: 'receive',
      sourceCardId: 'B157_Salter',
      type: 'resource.moved',
      resources: { food: 2 },
      from: { kind: 'roundCard', round: 3 },
      to: { kind: 'player', playerId: 'p2' },
      reason: 'receive',
    } satisfies GameEvent

    const buckets = buildActionLogTimelineRows({
      entries: [
        replayEntryForEvent(resolved, 1),
        replayEntryForEvent(received, 2),
      ],
      stateLog: [],
      currentRound: 3,
      locale: 'en',
      playerNames: { p2: 'Player 2' },
    })

    expect(buckets.flatMap((bucket) => bucket.rows).map((row) => row.logEntry?.key)).toEqual([
      'log.actionDetail',
      'log.futureMeepleResolved',
    ])
  })

  it('suppresses canceled pure resource resolution but keeps its canceled receive row', () => {
    const resolved = {
      schemaVersion: 1,
      id: 'evt-canceled-future',
      seq: 4,
      round: 3,
      phase: 'work',
      visibility: 'public',
      actorPlayerId: 'p2',
      sourceCardId: 'PR11',
      type: 'futureMeeple.resolved',
      playerId: 'p2',
      cardId: 'PR11',
      resources: { food: 1 },
    } satisfies GameEvent
    const received = {
      schemaVersion: 1,
      id: 'evt-canceled-received',
      seq: 5,
      round: 3,
      phase: 'work',
      visibility: 'public',
      actorPlayerId: 'p2',
      sourceActionId: 'receive',
      sourceCardId: 'PR11',
      type: 'resource.moved',
      resources: { food: 1 },
      from: { kind: 'roundCard', round: 3 },
      to: { kind: 'player', playerId: 'p2' },
      reason: 'receive',
    } satisfies GameEvent

    const buckets = buildActionLogTimelineRows({
      entries: [
        {
          ...replayEntryForEvent(resolved, 1),
          status: 'canceled',
          payloadSource: 'canceledArchive',
        },
        {
          ...replayEntryForEvent(received, 2),
          status: 'canceled',
          payloadSource: 'canceledArchive',
        },
      ],
      stateLog: [],
      currentRound: 3,
      locale: 'en',
      playerNames: { p2: 'Player 2' },
    })

    const rows = buckets.flatMap((bucket) => bucket.rows)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      logEntry: { key: 'log.actionDetail' },
      status: 'canceled',
      strikethrough: true,
    })
  })

  it('dedupes internal leaf action logs from replay events', () => {
    const renovated: GameEvent = {
      schemaVersion: 1,
      id: 'evt-renovated',
      seq: 4,
      round: 14,
      phase: 'work',
      visibility: 'public',
      actorPlayerId: 'p1',
      sourceActionId: 'renovate-house',
      type: 'farm.renovated',
      playerId: 'p1',
      from: 'wood',
      to: 'clay',
      rooms: [{ row: 0, col: 0 }],
    }
    const fenceBuilt: GameEvent = {
      schemaVersion: 1,
      id: 'evt-fence',
      seq: 5,
      round: 14,
      phase: 'work',
      visibility: 'public',
      actorPlayerId: 'p1',
      sourceActionId: 'fence',
      type: 'farm.fenceBuilt',
      fences: Array.from({ length: 7 }, (_, index) => ({ edge: `e-${index}`, type: 'fence' })),
    }

    const buckets = buildActionLogTimelineRows({
      entries: [
        replayEntryForEvent(renovated, 5, 0),
        replayEntryForEvent(fenceBuilt, 6, 0),
      ],
      stateLog: [
        {
          key: 'log.actionDetail',
          params: {
            player: 'Alice',
            action: 'actions.fencing.name',
            detailParts: { effects: { fencing: 7 } },
          },
        },
        {
          key: 'log.actionDetail',
          params: {
            player: 'Alice',
            action: 'actions.renovate-house.name',
            detailParts: { costs: {}, effects: { renovate: { from: 'wood', to: 'clay' } } },
          },
        },
      ],
      currentRound: 14,
      locale: 'zh',
      playerNames: { p1: 'Alice' },
      actionNames: { 'farm-redevelopment': 'actions.farm-redevelopment.name' },
    })

    const rows = buckets.flatMap((bucket) => bucket.rows)
    expect(rows.map((row) => row.kind)).toEqual(['event', 'event'])
    expect(rows.map((row) => row.logEntry?.params?.action)).toEqual([
      'actions.fencing.name',
      'actions.renovate-house.name',
    ])
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
            improvements: 'A001_TestMinor',
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
          improvements: 'A001_TestMinor',
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
          improvements: 'A001_TestMinor',
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
