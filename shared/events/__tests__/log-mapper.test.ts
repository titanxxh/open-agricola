import { describe, expect, it } from 'vitest'
import type { GameEvent } from '../../contract/events'
import { eventsToLogEntries } from '../log-mapper'

describe('eventsToLogEntries', () => {
  it('returns newest-first entries to match GameState.log order', () => {
    const events = [
      {
        schemaVersion: 1,
        id: '1',
        seq: 1,
        round: 1,
        phase: 'work',
        type: 'resource.moved',
        visibility: 'public',
        actorPlayerId: 'p1',
        sourceActionId: 'gain',
        resources: { wood: 1 },
        from: { kind: 'supply' },
        to: { kind: 'player', playerId: 'p1' },
        reason: 'gain',
      },
      {
        schemaVersion: 1,
        id: '2',
        seq: 2,
        round: 1,
        phase: 'work',
        type: 'resource.moved',
        visibility: 'public',
        actorPlayerId: 'p1',
        sourceActionId: 'gain',
        resources: { clay: 1 },
        from: { kind: 'supply' },
        to: { kind: 'player', playerId: 'p1' },
        reason: 'gain',
      },
    ] satisfies GameEvent[]
    expect(
      eventsToLogEntries(events, { playerNames: { p1: 'Alice' } }).map(
        (entry) => entry.params?.detailParts,
      ),
    ).toEqual([{ gains: { clay: 1 } }, { gains: { wood: 1 } }])
  })

  it('maps resource moved to action detail logs', () => {
    const events = [
      {
        schemaVersion: 1,
        id: '1',
        seq: 1,
        round: 1,
        phase: 'work',
        type: 'resource.moved',
        visibility: 'public',
        actorPlayerId: 'p1',
        sourceActionId: 'collect',
        resources: { wood: 2 },
        from: { kind: 'actionSpace', spaceId: 'forest' },
        to: { kind: 'player', playerId: 'p1' },
        reason: 'collect',
      },
    ] satisfies GameEvent[]
    expect(eventsToLogEntries(events, { playerNames: { p1: 'Alice' }, actionNames: { collect: 'Forest' } })).toEqual([
      {
        key: 'log.actionDetail',
        params: { player: 'Alice', action: 'Forest', detailParts: { gains: { wood: 2 } } },
      },
    ])
  })

  it('maps resource paid to action detail logs', () => {
    const events = [
      {
        schemaVersion: 1,
        id: '1',
        seq: 1,
        round: 1,
        phase: 'work',
        type: 'resource.paid',
        visibility: 'public',
        actorPlayerId: 'p1',
        sourceActionId: 'build',
        resources: { wood: 2 },
        paymentFor: 'room',
      },
    ] satisfies GameEvent[]
    expect(eventsToLogEntries(events, { playerNames: { p1: 'Alice' }, actionNames: { build: 'Build rooms' } })).toEqual([
      {
        key: 'log.actionDetail',
        params: { player: 'Alice', action: 'Build rooms', detailParts: { costs: { wood: 2 } } },
      },
    ])
  })

  it('keeps resource exchange as one action detail log entry', () => {
    const events = [
      {
        schemaVersion: 1,
        id: '1',
        seq: 1,
        round: 1,
        phase: 'work',
        type: 'resource.exchanged',
        visibility: 'public',
        actorPlayerId: 'p1',
        paid: { grain: 1 },
        gained: { food: 4 },
        paidFrom: { kind: 'player', playerId: 'p1' },
        paidTo: { kind: 'supply' },
        gainedFrom: { kind: 'supply' },
        gainedTo: { kind: 'player', playerId: 'p1' },
        exchangeSource: 'Fireplace',
      },
    ] satisfies GameEvent[]
    expect(eventsToLogEntries(events, { playerNames: { p1: 'Alice' } })).toEqual([
      {
        key: 'log.actionDetail',
        params: {
          player: 'Alice',
          action: 'Fireplace',
          detailParts: { gains: { food: 4 }, costs: { grain: 1 } },
        },
      },
    ])
  })

  it('falls back to exchange action name for exchange events without source', () => {
    const events = [
      {
        schemaVersion: 1,
        id: '1',
        seq: 1,
        round: 1,
        phase: 'work',
        type: 'resource.exchanged',
        visibility: 'public',
        actorPlayerId: 'p1',
        paid: { grain: 1 },
        gained: { food: 2 },
        paidFrom: { kind: 'player', playerId: 'p1' },
        paidTo: { kind: 'supply' },
        gainedFrom: { kind: 'supply' },
        gainedTo: { kind: 'player', playerId: 'p1' },
      },
    ] satisfies GameEvent[]
    expect(eventsToLogEntries(events, { playerNames: { p1: 'Alice' } })[0]?.params?.action).toBe('exchange')
  })
})
