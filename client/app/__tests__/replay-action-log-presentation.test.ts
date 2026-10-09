import { describe, expect, it } from 'vitest'
import type { GameEvent, PublicEventArchivePacket } from '../../../shared/contract/events'
import type { LogEntry } from '../../../shared/contract/types'
import { buildReplayActionLogPresentation } from '../replay-action-log-presentation'
import { eventsToLogEntries } from '../../../shared/events/log-mapper'
import { projectHistoryLogNames } from '../../../shared/projections/history-names'

const movedEvent = (id: string, seq: number, resources = { wood: 3 }): GameEvent => ({
  schemaVersion: 1,
  id,
  seq,
  round: 2,
  phase: 'work',
  visibility: 'public',
  actorPlayerId: 'p1',
  sourceActionId: 'forest',
  type: 'resource.moved',
  resources,
  from: { kind: 'actionSpace', spaceId: 'forest' },
  to: { kind: 'player', playerId: 'p1' },
  reason: 'collect',
})

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
  canceledEventIds: canceledEvents.map((event) => event.id),
  canceledSeqs: canceledEvents.map((event) => event.seq),
  canceledEvents,
})

describe('buildReplayActionLogPresentation', () => {
  it.each(['gain', 'bonus-grain'])('deduplicates %s logs when the client only knows board action names', (actionId) => {
    const event: GameEvent = actionId === 'gain' ? {
      schemaVersion: 1, id: 'gain-trigger', seq: 1, round: 2, phase: 'work',
      visibility: 'public', actorPlayerId: 'p1', type: 'card.triggered',
      cardId: 'E116_FirCutter', triggerActionId: actionId,
    } : {
      ...movedEvent('summer-grain', 1), sourceActionId: actionId,
      resources: { grain: 1 }, from: { kind: 'supply' }, reason: 'gain',
    }
    const playerNames = { p1: 'Alice' }
    const stateLog = eventsToLogEntries([event], {
      playerNames, actionNames: { [actionId]: `actions.${actionId}.name` },
    })
    const presentation = buildReplayActionLogPresentation({
      events: [event], publicEventArchive: [committed(1, [event])], stateLog,
      currentRound: 2, locale: 'en', playerNames,
      actionNames: { forest: 'actions.forest.name' }, replayFilter: 'all',
    })
    const rows = presentation.timelineBuckets.flatMap(bucket => bucket.rows)
    expect(rows.map(row => row.kind)).toEqual(['event'])
    expect(rows[0]!.logEntry).toEqual(stateLog[0])
  })

  it('keeps canceled attempts ahead of older active rows after history name projection', () => {
    const older = movedEvent('older', 1)
    const attempt = movedEvent('attempt', 2)
    const started: GameEvent = {
      schemaVersion: 1, id: 'started', seq: 0, round: 2, phase: 'work',
      visibility: 'public', type: 'game.started',
    }
    const context = { playerNames: { p1: 'Old name' }, actionNames: { forest: 'actions.forest.name' } }
    const stateLog = eventsToLogEntries([older], context).map(entry => projectHistoryLogNames(
      entry, { 'params.player': 'p1', 'params.playerName': 'p1' }, { p1: 'Player 1' },
    ))
    const presentation = buildReplayActionLogPresentation({
      events: [started, older], publicEventArchive: [committed(1, [started, older]), committed(2, [attempt]), canceled(3, [attempt])],
      stateLog: [...stateLog, { key: 'log.startGame' }], currentRound: 2, locale: 'zh', playerNames: { p1: '玩家 1' },
      actionNames: context.actionNames, replayFilter: 'all',
    })
    const rows = presentation.timelineBuckets.flatMap(bucket => bucket.rows)
    expect(rows.map(row => row.kind === 'event' ? row.status : row.kind)).toEqual(['canceled', 'active', 'active'])
    expect(rows.slice(0, 2).map(row => row.logEntry?.params?.player)).toEqual(['玩家 1', '玩家 1'])
  })

  it('derives Action Log buckets, replay controls, selected entry, and replay feedback together', () => {
    const active = movedEvent('evt-active', 2)
    const canceledPayload = movedEvent('evt-canceled', 1, { clay: 1 })
    const stateLog: LogEntry[] = [
      {
        key: 'log.actionDetail',
        params: {
          player: 'Alice',
          action: 'Forest',
          detailParts: { gains: { wood: 3 } },
        },
      },
      { key: 'log.startGame' },
    ]

    const presentation = buildReplayActionLogPresentation({
      events: [active],
      publicEventArchive: [
        committed(1, [{ id: canceledPayload.id, seq: canceledPayload.seq }]),
        canceled(2, [canceledPayload]),
        committed(3, [{ id: active.id, seq: active.seq }]),
        committed(4, [{ id: 'missing', seq: 9 }]),
      ],
      stateLog,
      currentRound: 2,
      locale: 'en',
      playerNames: { p1: 'Alice' },
      actionNames: { forest: 'Forest' },
      replayFilter: 'active',
      selectedReplayKey: 'event:3:0:evt-active:2',
    })

    expect(presentation.replaySummary).toEqual({
      totalEvents: 3,
      activeEvents: 1,
      canceledEvents: 1,
      missingEvents: 1,
    })
    expect(presentation.replayStepEntries.map((entry) => entry.key)).toEqual([
      'event:3:0:evt-active:2',
    ])
    expect(presentation.selectedReplayEntry).toMatchObject({
      key: 'event:3:0:evt-active:2',
      status: 'active',
    })
    expect(presentation.replayFeedback.resourceAnimations.map((item) => item.id)).toEqual([
      expect.stringMatching(/^replay:event:3:0:evt-active:2:/),
    ])

    const rows = presentation.timelineBuckets.flatMap((bucket) => bucket.rows)
    expect(rows.filter((row) => row.kind === 'event').map((row) => ({
      key: row.key,
      status: row.status,
      replayable: row.replayable,
    }))).toEqual([
      { key: 'event:4:0:missing:9', status: 'missing', replayable: false },
      { key: 'event:3:0:evt-active:2', status: 'active', replayable: true },
      { key: 'event:1:0:evt-canceled:1', status: 'canceled', replayable: true },
    ])
    expect(rows.some((row) => row.kind === 'stateLog' && row.logEntry.key === 'log.actionDetail')).toBe(false)
    expect(rows.some((row) => row.kind === 'stateLog' && row.logEntry.key === 'log.startGame')).toBe(true)
  })
})
