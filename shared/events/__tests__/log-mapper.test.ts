import { describe, expect, it } from 'vitest'
import type { GameEvent } from '../../contract/events'
import { buildLogPresentationPlan, eventsToLogEntries } from '../log-mapper'

describe('eventsToLogEntries', () => {
  it('builds a presentation plan with source identity and consumed payment refs', () => {
    const events = [
      {
        schemaVersion: 1,
        id: 'pay',
        seq: 1,
        round: 1,
        phase: 'work',
        type: 'resource.paid',
        visibility: 'public',
        actorPlayerId: 'p1',
        sourceActionId: 'improvement',
        resources: { food: 1 },
        paymentFor: 'minor-improvement',
      },
      {
        schemaVersion: 1,
        id: 'play',
        seq: 2,
        round: 1,
        phase: 'work',
        type: 'card.played',
        visibility: 'public',
        actorPlayerId: 'p1',
        sourceActionId: 'improvement',
        sourceCardId: 'D020_TurnwrestPlow',
        cardId: 'D020_TurnwrestPlow',
        cardType: 'minor',
      },
    ] satisfies GameEvent[]

    const plan = buildLogPresentationPlan(events, { playerNames: { p1: 'Alice' } })

    expect(plan.rows).toEqual([
      expect.objectContaining({
        logEntry: {
          key: 'log.playMinorImprovement',
          params: {
            player: 'Alice',
            improvements: 'D020_TurnwrestPlow',
            costResources: { food: 1 },
          },
        },
        sourceEventRef: { id: 'play', seq: 2, type: 'card.played' },
        consumedEventRefs: [{ id: 'pay', seq: 1, type: 'resource.paid' }],
        identity: {
          logKey: 'log.playMinorImprovement',
          params: {
            costResources: { food: 1 },
            improvements: 'D020_TurnwrestPlow',
          },
        },
      }),
    ])
    expect(plan.consumedEvents).toEqual([
      {
        consumedEventRef: { id: 'pay', seq: 1, type: 'resource.paid' },
        consumerEventRef: { id: 'play', seq: 2, type: 'card.played' },
        reason: 'cardPayment',
      },
    ])
    expect(eventsToLogEntries(events, { playerNames: { p1: 'Alice' } })).toEqual(
      plan.rows.map((row) => row.logEntry),
    )
  })

  it('suppresses pure resource future meeple resolution delegated to receive', () => {
    const event = {
      schemaVersion: 1,
      id: 'future-resource',
      seq: 1,
      round: 3,
      phase: 'preWork',
      type: 'futureMeeple.resolved',
      visibility: 'public',
      actorPlayerId: 'p1',
      sourceCardId: 'PR11',
      playerId: 'p1',
      cardId: 'PR11',
      resources: { food: 1 },
    } satisfies GameEvent

    const plan = buildLogPresentationPlan([event], { playerNames: { p1: 'Alice' } })

    expect(plan.rows).toEqual([])
    expect(plan.suppressedEvents).toEqual([
      {
        suppressedEventRef: {
          id: 'future-resource',
          seq: 1,
          type: 'futureMeeple.resolved',
        },
        reason: 'futureResourceReceive',
      },
    ])
    expect(eventsToLogEntries([event], { playerNames: { p1: 'Alice' } })).toEqual([])
  })

  it('keeps future meeple resolution with a standalone effect', () => {
    const event = {
      schemaVersion: 1,
      id: 'future-room',
      seq: 1,
      round: 3,
      phase: 'preWork',
      type: 'futureMeeple.resolved',
      visibility: 'public',
      actorPlayerId: 'p1',
      sourceCardId: 'B157_Salter',
      playerId: 'p1',
      cardId: 'B157_Salter',
      resources: { food: 2 },
      roomType: 'clay',
    } satisfies GameEvent

    const plan = buildLogPresentationPlan([event], { playerNames: { p1: 'Alice' } })

    expect(plan.rows).toHaveLength(1)
    expect(plan.rows[0]?.logEntry.key).toBe('log.futureMeepleResolved')
    expect(plan.suppressedEvents).toEqual([])
  })

  it.each([
    ['field', { field: 1 }],
    ['stable', { stable: 1 }],
    ['forest mixed with food', { food: 1, forest: 1 }],
    ['moor', { moor: 1 }],
    ['no resource gain', {}],
  ] as const)('keeps future meeple resolution with %s', (_label, resources) => {
    const event: GameEvent = {
      schemaVersion: 1,
      id: 'future-standalone',
      seq: 1,
      round: 3,
      phase: 'preWork',
      type: 'futureMeeple.resolved',
      visibility: 'public',
      actorPlayerId: 'p1',
      sourceCardId: 'PR02',
      playerId: 'p1',
      cardId: 'PR02',
      resources,
    }

    const plan = buildLogPresentationPlan([event], { playerNames: { p1: 'Alice' } })

    expect(plan.rows).toHaveLength(1)
    expect(plan.rows[0]?.logEntry.key).toBe('log.futureMeepleResolved')
    expect(plan.suppressedEvents).toEqual([])
  })

  it('uses the canonical name key for the internal receive action', () => {
    const event = {
      schemaVersion: 1,
      id: 'received',
      seq: 1,
      round: 3,
      phase: 'preWork',
      type: 'resource.moved',
      visibility: 'public',
      actorPlayerId: 'p1',
      sourceActionId: 'receive',
      sourceCardId: 'PR11',
      resources: { food: 1 },
      from: { kind: 'roundCard', round: 3 },
      to: { kind: 'player', playerId: 'p1' },
      reason: 'receive',
    } satisfies GameEvent

    expect(eventsToLogEntries([event], { playerNames: { p1: 'Alice' } })).toEqual([
      {
        key: 'log.actionDetail',
        params: {
          player: 'Alice',
          action: 'actions.receive.name',
          detailParts: { gains: { food: 1 } },
        },
      },
    ])
  })

  it('uses legacy state log dedupe params for presentation row identity', () => {
    const events = [
      {
        schemaVersion: 1,
        id: 'play',
        seq: 1,
        round: 1,
        phase: 'work',
        type: 'card.played',
        visibility: 'public',
        actorPlayerId: 'p1',
        sourceActionId: 'improvement',
        sourceCardId: 'A001_TestMinor',
        cardId: 'A001_TestMinor',
        cardType: 'minor',
      },
    ] satisfies GameEvent[]

    const [row] = buildLogPresentationPlan(events, { playerNames: { p1: 'Alice' } }).rows

    expect(row?.identity).toEqual({
      logKey: 'log.playMinorImprovement',
      params: {
        costResources: {},
        improvements: 'A001_TestMinor',
      },
    })
    expect(row?.logEntry.params?.player).toBe('Alice')
  })

  it('records a consumed payment once when repeated consumers match it', () => {
    const events = [
      {
        schemaVersion: 1,
        id: 'pay',
        seq: 1,
        round: 1,
        phase: 'work',
        type: 'resource.paid',
        visibility: 'public',
        actorPlayerId: 'p1',
        sourceActionId: 'improvement',
        resources: { food: 1 },
        paymentFor: 'minor-improvement',
      },
      {
        schemaVersion: 1,
        id: 'play-a',
        seq: 2,
        round: 1,
        phase: 'work',
        type: 'card.played',
        visibility: 'public',
        actorPlayerId: 'p1',
        sourceActionId: 'improvement',
        sourceCardId: 'A001_First',
        cardId: 'A001_First',
        cardType: 'minor',
      },
      {
        schemaVersion: 1,
        id: 'play-b',
        seq: 3,
        round: 1,
        phase: 'work',
        type: 'card.played',
        visibility: 'public',
        actorPlayerId: 'p1',
        sourceActionId: 'improvement',
        sourceCardId: 'A002_Second',
        cardId: 'A002_Second',
        cardType: 'minor',
      },
    ] satisfies GameEvent[]

    const plan = buildLogPresentationPlan(events, { playerNames: { p1: 'Alice' } })

    expect(plan.rows.flatMap((row) => row.consumedEventRefs)).toEqual([
      { id: 'pay', seq: 1, type: 'resource.paid' },
    ])
    expect(plan.consumedEvents).toHaveLength(1)
    expect(plan.consumedEvents[0]).toEqual({
      consumedEventRef: { id: 'pay', seq: 1, type: 'resource.paid' },
      consumerEventRef: { id: 'play-b', seq: 3, type: 'card.played' },
      reason: 'cardPayment',
    })
    expect(eventsToLogEntries(events, { playerNames: { p1: 'Alice' } })).toEqual([
      {
        key: 'log.playMinorImprovement',
        params: {
          player: 'Alice',
          improvements: 'A002_Second',
          costResources: { food: 1 },
        },
      },
      {
        key: 'log.playMinorImprovement',
        params: {
          player: 'Alice',
          improvements: 'A001_First',
          costResources: { food: 1 },
        },
      },
    ])
  })

  it('records renovation payment metadata on the renovation row', () => {
    const events = [
      {
        schemaVersion: 1,
        id: 'pay-renovation',
        seq: 1,
        round: 6,
        phase: 'work',
        type: 'resource.paid',
        visibility: 'public',
        actorPlayerId: 'p1',
        sourceActionId: 'renovate-house',
        resources: { clay: 2, reed: 1 },
        paymentFor: 'renovation',
      },
      {
        schemaVersion: 1,
        id: 'renovated',
        seq: 2,
        round: 6,
        phase: 'work',
        type: 'farm.renovated',
        visibility: 'public',
        actorPlayerId: 'p1',
        sourceActionId: 'renovate-house',
        playerId: 'p1',
        from: 'wood',
        to: 'clay',
        rooms: [{ row: 0, col: 0 }],
      },
    ] satisfies GameEvent[]

    const plan = buildLogPresentationPlan(events, {
      playerNames: { p1: 'Alice' },
      actionNames: { 'renovate-house': 'Renovate' },
    })

    expect(plan.rows).toEqual([
      expect.objectContaining({
        logEntry: {
          key: 'log.actionDetail',
          params: {
            player: 'Alice',
            action: 'Renovate',
            detailParts: {
              costs: { clay: 2, reed: 1 },
              effects: { renovate: { from: 'wood', to: 'clay' } },
            },
          },
        },
        sourceEventRef: { id: 'renovated', seq: 2, type: 'farm.renovated' },
        consumedEventRefs: [{ id: 'pay-renovation', seq: 1, type: 'resource.paid' }],
      }),
    ])
    expect(plan.consumedEvents).toEqual([
      {
        consumedEventRef: { id: 'pay-renovation', seq: 1, type: 'resource.paid' },
        consumerEventRef: { id: 'renovated', seq: 2, type: 'farm.renovated' },
        reason: 'renovationPayment',
      },
    ])
  })

  it('absorbs nearest following stable payment into stable plan metadata', () => {
    const events = [
      {
        schemaVersion: 1,
        id: 'stable',
        seq: 1,
        round: 1,
        phase: 'work',
        type: 'farm.stableBuilt',
        visibility: 'public',
        actorPlayerId: 'p1',
        sourceActionId: 'stables',
        stables: [{ playerId: 'p1', row: 0, col: 0 }],
      },
      {
        schemaVersion: 1,
        id: 'pay-stable',
        seq: 2,
        round: 1,
        phase: 'work',
        type: 'resource.paid',
        visibility: 'public',
        actorPlayerId: 'p1',
        sourceActionId: 'stables',
        resources: { wood: 2 },
        paymentFor: 'stables',
      },
    ] satisfies GameEvent[]

    const plan = buildLogPresentationPlan(events, {
      playerNames: { p1: 'Alice' },
      actionNames: { stables: 'Build stables' },
    })

    expect(plan.rows).toEqual([
      expect.objectContaining({
        logEntry: {
          key: 'log.actionDetail',
          params: {
            player: 'Alice',
            action: 'Build stables',
            detailParts: {
              costs: { wood: 2 },
              effects: { buildStables: 1 },
            },
          },
        },
        sourceEventRef: { id: 'stable', seq: 1, type: 'farm.stableBuilt' },
        consumedEventRefs: [{ id: 'pay-stable', seq: 2, type: 'resource.paid' }],
      }),
    ])
    expect(plan.consumedEvents).toEqual([
      {
        consumedEventRef: { id: 'pay-stable', seq: 2, type: 'resource.paid' },
        consumerEventRef: { id: 'stable', seq: 1, type: 'farm.stableBuilt' },
        reason: 'stablePayment',
      },
    ])
  })

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
    expect(eventsToLogEntries(events, { playerNames: { p1: 'Alice' }, actionNames: { forest: 'Forest' } })).toEqual([
      {
        key: 'log.actionDetail',
        params: { player: 'Alice', action: 'Forest', detailParts: { gains: { wood: 2 } } },
      },
    ])
  })

  it('maps Reap resource movement to generic Reap logs', () => {
    const events = [
      {
        schemaVersion: 1,
        id: '1',
        seq: 1,
        round: 4,
        phase: 'field',
        type: 'resource.moved',
        visibility: 'public',
        actorPlayerId: 'p1',
        sourceActionId: 'reap',
        trigger: { phase: 'harvest' },
        resources: { grain: 1 },
        from: { kind: 'field', playerId: 'p1', row: 0, col: 0 },
        to: { kind: 'player', playerId: 'p1' },
        reason: 'reap',
      },
    ] satisfies GameEvent[]

    expect(eventsToLogEntries(events, { playerNames: { p1: 'Alice' } })).toEqual([
      {
        key: 'log.reapDetail',
        params: { player: 'Alice', resources: { grain: 1 } },
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

  it('maps card played logs with the actor player name', () => {
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
        sourceActionId: 'improvement',
        resources: { food: 1 },
        paymentFor: 'minor-improvement',
      },
      {
        schemaVersion: 1,
        id: '2',
        seq: 2,
        round: 1,
        phase: 'work',
        type: 'card.played',
        visibility: 'public',
        actorPlayerId: 'p1',
        sourceActionId: 'improvement',
        sourceCardId: 'D020_TurnwrestPlow',
        cardId: 'D020_TurnwrestPlow',
        cardType: 'minor',
      },
    ] satisfies GameEvent[]

    expect(eventsToLogEntries(events, { playerNames: { p1: 'Alice' } })).toEqual([
      {
        key: 'log.playMinorImprovement',
        params: {
          player: 'Alice',
          improvements: 'D020_TurnwrestPlow',
          costResources: { food: 1 },
        },
      },
    ])
  })

  it('maps explicit action detail log events', () => {
    const events = [
      {
        schemaVersion: 1,
        id: '1',
        seq: 1,
        round: 1,
        phase: 'work',
        type: 'action.detailLogged',
        visibility: 'public',
        playerId: 'p1',
        actionId: 'forest',
        detailParts: {
          gains: { wood: 3 },
          costs: {},
          effects: {},
        },
      },
    ] satisfies GameEvent[]
    expect(eventsToLogEntries(events, { playerNames: { p1: 'Alice' }, actionNames: { forest: 'Forest' } })).toEqual([
      {
        key: 'log.actionDetail',
        params: {
          player: 'Alice',
          action: 'Forest',
          detailParts: {
            gains: { wood: 3 },
            costs: {},
            effects: {},
          },
        },
      },
    ])
  })

  it('maps payment provenance with bonus source and choice index', () => {
    const events = [
      {
        schemaVersion: 1,
        id: '1',
        seq: 1,
        round: 5,
        phase: 'work',
        type: 'resource.paid',
        visibility: 'public',
        actorPlayerId: 'p1',
        sourceActionId: 'construct',
        resources: { wood: 1, clay: 1 },
        paymentFor: 'construct',
        paymentSources: [
          { from: { kind: 'player', playerId: 'p1' }, resources: { wood: 1, clay: 1 } },
        ],
        bonusSources: ['E123_ResourceHoarder'],
        bonusChoiceIndex: { E123_ResourceHoarder: 2 },
      },
    ] satisfies GameEvent[]
    expect(eventsToLogEntries(events, { playerNames: { p1: 'Alice' }, actionNames: { construct: 'Build rooms' } })).toEqual([
      {
        key: 'log.actionDetail',
        params: {
          player: 'Alice',
          action: 'Build rooms',
          detailParts: {
            costs: { wood: 1, clay: 1 },
            bonusSources: ['E123_ResourceHoarder'],
          },
          bonusChoiceIndex: { E123_ResourceHoarder: 2 },
        },
      },
    ])
  })

  it('pairs repeated stable builds with their nearest following payment', () => {
    const base = {
      schemaVersion: 1,
      round: 1,
      phase: 'work',
      visibility: 'public',
      actorPlayerId: 'p1',
      sourceActionId: 'farm-expansion',
    } as const
    const events = [
      {
        ...base,
        id: '1',
        seq: 1,
        type: 'farm.stableBuilt',
        stables: [{ playerId: 'p1', row: 0, col: 0 }],
      },
      {
        ...base,
        id: '2',
        seq: 2,
        type: 'resource.paid',
        resources: { wood: 2 },
        paymentFor: 'stables',
      },
      {
        ...base,
        id: '3',
        seq: 3,
        type: 'farm.stableBuilt',
        stables: [{ playerId: 'p1', row: 0, col: 1 }],
      },
      {
        ...base,
        id: '4',
        seq: 4,
        type: 'resource.paid',
        resources: { clay: 2 },
        paymentFor: 'stables',
      },
    ] satisfies GameEvent[]

    expect(eventsToLogEntries(events, {
      playerNames: { p1: 'Alice' },
      actionNames: { 'farm-expansion': 'Farm Expansion' },
    })).toEqual([
      {
        key: 'log.actionDetail',
        params: {
          player: 'Alice',
          action: 'Farm Expansion',
          detailParts: {
            costs: { clay: 2 },
            effects: { buildStables: 1 },
          },
        },
      },
      {
        key: 'log.actionDetail',
        params: {
          player: 'Alice',
          action: 'Farm Expansion',
          detailParts: {
            costs: { wood: 2 },
            effects: { buildStables: 1 },
          },
        },
      },
    ])
  })

  it('does not reuse a previous paid stable payment for a later free stable build', () => {
    const base = {
      schemaVersion: 1,
      round: 1,
      phase: 'work',
      visibility: 'public',
      actorPlayerId: 'p1',
      sourceActionId: 'farm-expansion',
    } as const
    const events = [
      {
        ...base,
        id: '1',
        seq: 1,
        type: 'farm.stableBuilt',
        stables: [{ playerId: 'p1', row: 0, col: 0 }],
      },
      {
        ...base,
        id: '2',
        seq: 2,
        type: 'resource.paid',
        resources: { wood: 2 },
        paymentFor: 'stables',
      },
      {
        ...base,
        id: '3',
        seq: 3,
        type: 'farm.stableBuilt',
        stables: [{ playerId: 'p1', row: 0, col: 1 }],
        sourceCardId: 'A089_StablePlanner',
      },
    ] satisfies GameEvent[]

    expect(eventsToLogEntries(events, {
      playerNames: { p1: 'Alice' },
      actionNames: { 'farm-expansion': 'Farm Expansion' },
    })).toEqual([
      {
        key: 'log.actionDetail',
        params: {
          player: 'Alice',
          action: 'Farm Expansion',
          detailParts: {
            costs: {},
            effects: { buildStables: 1 },
          },
        },
      },
      {
        key: 'log.actionDetail',
        params: {
          player: 'Alice',
          action: 'Farm Expansion',
          detailParts: {
            costs: { wood: 2 },
            effects: { buildStables: 1 },
          },
        },
      },
    ])
  })

  it('maps action exclusive-use lifecycle events', () => {
    const events = [
      {
        schemaVersion: 1,
        id: '0',
        seq: 0,
        round: 13,
        phase: 'work',
        type: 'action.revealed',
        visibility: 'public',
        actionId: 'round14',
        roundSlot: 14,
      },
      {
        schemaVersion: 1,
        id: '1',
        seq: 1,
        round: 13,
        phase: 'work',
        type: 'action.exclusiveUseSet',
        visibility: 'public',
        actionId: 'round14',
        playerId: 'p1',
        sourceCardId: 'B023_FinalScenario',
        untilRound: 14,
      },
      {
        schemaVersion: 1,
        id: '2',
        seq: 2,
        round: 14,
        phase: 'work',
        type: 'action.exclusiveUseCleared',
        visibility: 'public',
        actionId: 'round14',
        playerId: 'p1',
        sourceCardId: 'B023_FinalScenario',
      },
    ] satisfies GameEvent[]
    expect(eventsToLogEntries(events, { playerNames: { p1: 'Alice' }, actionNames: { round14: 'Round 14 Action' } })).toEqual([
      {
        key: 'log.actionExclusiveUseCleared',
        params: { player: 'Alice', action: 'Round 14 Action', cardId: 'B023_FinalScenario' },
      },
      {
        key: 'log.actionExclusiveUseSet',
        params: { player: 'Alice', action: 'Round 14 Action', cardId: 'B023_FinalScenario' },
      },
      {
        key: 'log.actionRevealed',
        params: { action: 'Round 14 Action', roundSlot: 14 },
      },
    ])
  })

  it('maps accumulation events to log entries', () => {
    const events = [
      {
        schemaVersion: 1,
        id: 'action-acc',
        seq: 1,
        round: 2,
        phase: 'work',
        visibility: 'public',
        type: 'action.accumulated',
        spaceId: 'forest',
        resources: { wood: 3, clay: 0 },
      },
      {
        schemaVersion: 1,
        id: 'resource-space',
        seq: 2,
        round: 2,
        phase: 'work',
        visibility: 'public',
        type: 'resource.accumulated',
        resources: { food: 1 },
        to: { kind: 'actionSpace', spaceId: 'fishing' },
      },
      {
        schemaVersion: 1,
        id: 'resource-card',
        seq: 3,
        round: 2,
        phase: 'work',
        visibility: 'public',
        actorPlayerId: 'p1',
        type: 'resource.accumulated',
        resources: { food: 2 },
        to: { kind: 'card', playerId: 'p1', cardId: 'B048_ForestStone' },
      },
      {
        schemaVersion: 1,
        id: 'resource-round',
        seq: 4,
        round: 2,
        phase: 'work',
        visibility: 'public',
        type: 'resource.accumulated',
        resources: { stone: 1 },
        to: { kind: 'roundCard', round: 7 },
        silent: true,
      },
    ] satisfies GameEvent[]

    expect(eventsToLogEntries(events, {
      playerNames: { p1: 'Alice' },
      actionNames: { forest: 'Forest', fishing: 'Fishing' },
    })).toEqual([
      {
        key: 'log.resourceAccumulated',
        params: { target: 'roundCard', round: 7, resources: { stone: 1 } },
      },
      {
        key: 'log.resourceAccumulated',
        params: { target: 'card', cardId: 'B048_ForestStone', player: 'Alice', resources: { food: 2 } },
      },
      {
        key: 'log.resourceAccumulated',
        params: { target: 'actionSpace', action: 'Fishing', resources: { food: 1 } },
      },
      {
        key: 'log.actionAccumulated',
        params: { action: 'Forest', resources: { wood: 3 } },
      },
    ])
  })

  it('does not map empty accumulation resources', () => {
    const events = [
      {
        schemaVersion: 1,
        id: 'empty-action',
        seq: 1,
        round: 2,
        phase: 'work',
        visibility: 'public',
        type: 'action.accumulated',
        spaceId: 'forest',
        resources: { wood: 0 },
      },
      {
        schemaVersion: 1,
        id: 'empty-resource',
        seq: 2,
        round: 2,
        phase: 'work',
        visibility: 'public',
        type: 'resource.accumulated',
        resources: {},
        to: { kind: 'card', cardId: 'B048_ForestStone' },
        silent: true,
      },
    ] satisfies GameEvent[]

    expect(eventsToLogEntries(events, { playerNames: {} })).toEqual([])
  })

  it('maps future meeple source summary logs', () => {
    const event = {
      schemaVersion: 1,
      id: '10',
      seq: 10,
      round: 3,
      phase: 'work',
      visibility: 'public',
      type: 'futureMeeple.queued',
      actorPlayerId: 'p1',
      playerId: 'p1',
      cardId: 'B157_Salter',
      entries: [
        { round: 4, resources: { food: 2 } },
        { round: 5, resources: { food: 2 } },
        { round: 6, resources: { food: 2 } },
      ],
      sourceSummary: {
        key: 'log.salterFutureFood',
        params: {
          cardId: 'B157_Salter',
          animals: '2 sheep',
          sheep: 2,
          boar: 0,
          cattle: 0,
          futureFood: 6,
          schedule: '2 food in rounds 4-6',
        },
      },
    } satisfies GameEvent

    expect(eventsToLogEntries([event], { playerNames: { p1: 'Alice' } })).toEqual([
      {
        key: 'log.salterFutureFood',
        params: {
          player: 'Alice',
          cardId: 'B157_Salter',
          animals: '2 sheep',
          sheep: 2,
          boar: 0,
          cattle: 0,
          futureFood: 6,
          schedule: '2 food in rounds 4-6',
        },
      },
    ])
  })

  it('maps grain-to-food resource exchange as bake bread', () => {
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
        key: 'log.bakeBread',
        params: {
          count: 1,
          food: 4,
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
    expect(eventsToLogEntries(events, { playerNames: { p1: 'Alice' } })[0]?.params?.action).toBe('actions.exchange.name')
  })

  it('maps farm and phase events to legacy log entries', () => {
    const base = {
      schemaVersion: 1,
      round: 3,
      phase: 'work',
      visibility: 'public',
      actorPlayerId: 'p1',
    } as const
    const events = [
      {
        ...base,
        id: '1',
        seq: 1,
        type: 'round.started',
      },
      {
        ...base,
        id: '2',
        seq: 2,
        type: 'worker.placed',
        sourceActionId: 'forest',
        workerId: '1',
        spaceId: 'forest',
      },
      {
        ...base,
        id: '3',
        seq: 3,
        type: 'farm.sown',
        sourceActionId: 'sow',
        sows: [{
          location: { kind: 'field', playerId: 'p1', row: 0, col: 0 },
          crop: 'grain',
          added: 3,
        }],
      },
      {
        ...base,
        id: '4',
        seq: 4,
        type: 'farm.fenceBuilt',
        sourceActionId: 'fence',
        fences: [{ edge: 'H-0-0', type: 'fence' }],
      },
      {
        ...base,
        id: '5',
        seq: 5,
        type: 'harvest.phaseStarted',
        phase: 'field',
        harvestPhase: 'field',
      },
      {
        ...base,
        id: '6',
        seq: 6,
        type: 'farm.animalBred',
        phase: 'breeding',
        animals: { sheep: 1 },
        source: 'harvest',
      },
      {
        ...base,
        id: '7',
        seq: 7,
        type: 'farm.animalDiscarded',
        animals: { sheep: 2 },
        reason: 'noRoom',
      },
    ] satisfies GameEvent[]

    expect(eventsToLogEntries(events, {
      playerNames: { p1: 'Alice' },
      actionNames: { forest: 'Forest', fence: 'Fences' },
    })).toEqual([
      {
        key: 'log.reorganizeDiscard',
        params: { player: 'Alice', resources: { sheep: 2 } },
      },
      {
        key: 'log.harvestBreedDetail',
        params: { player: 'Alice', resources: { sheep: 1 } },
      },
      { key: 'log.harvestPhaseReap' },
      {
        key: 'log.actionDetail',
        params: {
          player: 'Alice',
          action: 'Fences',
          detailParts: { effects: { fencing: 1 } },
        },
      },
      { key: 'log.sow', params: { player: 'Alice' } },
      { key: 'log.placeFarmer', params: { player: 'Alice', action: 'Forest' } },
      { key: 'log.enterRound', params: { round: 3 } },
    ])
  })

  it('maps continuation restore reasons to explicit log entries', () => {
    const base = {
      schemaVersion: 1,
      round: 3,
      phase: 'work',
      visibility: 'public',
    } as const
    const events = [
      { ...base, id: '1', seq: 1, type: 'continuation.restored', reason: 'commandRejected' },
      { ...base, id: '2', seq: 2, type: 'continuation.restored', reason: 'protectedObservationRejected' },
      { ...base, id: '3', seq: 3, type: 'continuation.restored', reason: 'scopeRollback' },
    ] satisfies GameEvent[]

    expect(eventsToLogEntries(events, { playerNames: {} }).map((entry) => entry.key)).toEqual([
      'log.provisionalContinuationRollback',
      'log.provisionalProtectedObservationRejected',
      'log.provisionalContinuationCommandRejected',
    ])
  })

  it('maps start and card-granted events to legacy log entries', () => {
    const events = [
      {
        schemaVersion: 1,
        id: '1',
        seq: 1,
        round: 1,
        phase: 'work',
        type: 'game.started',
        visibility: 'public',
      },
      {
        schemaVersion: 1,
        id: '2',
        seq: 2,
        round: 1,
        phase: 'work',
        type: 'action.granted',
        visibility: 'public',
        actorPlayerId: 'p1',
        sourceCardId: 'A150_Stagehand',
        playerId: 'p1',
        actionId: 'construct',
        cardId: 'A150_Stagehand',
      },
    ] satisfies GameEvent[]

    expect(eventsToLogEntries(events, { playerNames: { p1: 'Alice' } })).toEqual([
      {
        key: 'log.cardGrantedAction',
        params: {
          player: 'Alice',
          actionId: 'construct',
          cardId: 'A150_Stagehand',
        },
      },
      { key: 'log.startGame' },
    ])
  })

  it('maps parent mother scheduled events to legacy log entries', () => {
    const event = {
      schemaVersion: 1,
      id: 'parent-mother-scheduled',
      seq: 1,
      round: 1,
      phase: 'work',
      type: 'parent.motherScheduled',
      visibility: 'public',
      playerId: 'p1',
      cardId: 'PR02',
      targetRound: 12,
      reward: 'field',
    } satisfies GameEvent

    expect(eventsToLogEntries([event], { playerNames: { p1: 'Alice' } })).toEqual([
      {
        key: 'log.parentMotherScheduled',
        params: { player: 'Alice', cardId: 'PR02', round: 12, reward: 'field' },
      },
    ])
  })

  it('maps card lifecycle events to newest-first log entries', () => {
    const base = {
      schemaVersion: 1,
      round: 4,
      phase: 'work',
      visibility: 'public',
      actorPlayerId: 'p1',
    } as const
    const events = [
      {
        ...base,
        id: '1',
        seq: 1,
        type: 'card.triggered',
        cardId: 'B048_ForestStone',
        triggerActionId: 'forest',
        replacement: true,
        optional: true,
        accepted: false,
      },
      {
        ...base,
        id: '2',
        seq: 2,
        type: 'card.infoboxChanged',
        cardId: 'B048_ForestStone',
        text: '2 wood',
        targetPlayerId: 'p1',
      },
      {
        ...base,
        id: '3',
        seq: 3,
        type: 'card.stackChanged',
        cardId: 'B048_ForestStone',
        targetPlayerId: 'p1',
        resources: { wood: 2, food: 0 },
        delta: 2,
        reason: 'store',
      },
      {
        ...base,
        id: '4',
        seq: 4,
        type: 'card.swappedWithBoard',
        playerId: 'p1',
        fromPlayerCardId: 'A001_FromHand',
        toPlayerCardId: 'A002_FromBoard',
      },
      {
        ...base,
        id: '5',
        seq: 5,
        type: 'card.returnedToBoard',
        playerId: 'p1',
        cardId: 'A002_FromBoard',
      },
      {
        ...base,
        id: '6',
        seq: 6,
        type: 'card.destroyed',
        playerId: 'p1',
        cardId: 'A003_Destroyed',
        reason: 'cardEffect',
      },
      {
        ...base,
        id: '7',
        seq: 7,
        type: 'card.passed',
        fromPlayerId: 'p1',
        toPlayerId: 'p2',
        cardId: 'A004_Passed',
      },
    ] satisfies GameEvent[]

    const entries = eventsToLogEntries(events, {
      playerNames: { p1: 'Alice', p2: 'Bob' },
      actionNames: { forest: 'Forest' },
    })

    expect(entries.map((entry) => entry.key)).toEqual([
      'log.cardPassed',
      'log.cardDestroyed',
      'log.cardReturnedToBoard',
      'log.cardSwappedWithBoard',
      'log.cardStackChanged',
      'log.cardInfoboxChanged',
      'log.cardTriggered',
    ])
    expect(entries).toEqual([
      { key: 'log.cardPassed', params: { fromPlayer: 'Alice', toPlayer: 'Bob', cardId: 'A004_Passed' } },
      { key: 'log.cardDestroyed', params: { player: 'Alice', cardId: 'A003_Destroyed' } },
      { key: 'log.cardReturnedToBoard', params: { player: 'Alice', cardId: 'A002_FromBoard' } },
      { key: 'log.cardSwappedWithBoard', params: { player: 'Alice', fromCardId: 'A001_FromHand', toCardId: 'A002_FromBoard' } },
      { key: 'log.cardStackChanged', params: { cardId: 'B048_ForestStone', resources: { wood: 2 }, delta: 2, reason: 'store' } },
      { key: 'log.cardInfoboxChanged', params: { cardId: 'B048_ForestStone', text: '2 wood' } },
      { key: 'log.cardTriggered', params: { cardId: 'B048_ForestStone', triggerAction: 'Forest', replacement: true, optional: true, declined: true } },
    ])
  })

  it('maps remaining farm, future meeple, worker, and lifecycle events to newest-first log entries', () => {
    const base = {
      schemaVersion: 1,
      round: 5,
      phase: 'work',
      visibility: 'public',
      actorPlayerId: 'p1',
    } as const
    const events = [
      {
        ...base,
        id: '1',
        seq: 1,
        type: 'farm.cropAdded',
        crops: [
          { location: { kind: 'field', playerId: 'p1', row: 0, col: 0 }, crop: 'grain', amount: 2 },
          { location: { kind: 'field', playerId: 'p1', row: 0, col: 1 }, crop: 'grain', amount: 1 },
          { location: { kind: 'field', playerId: 'p1', row: 0, col: 2 }, crop: 'vegetable', amount: 0 },
        ],
        reason: 'cardEffect',
      },
      {
        ...base,
        id: '2',
        seq: 2,
        type: 'farm.cropRemoved',
        crops: [
          { location: { kind: 'field', playerId: 'p1', row: 0, col: 0 }, crop: 'vegetable', amount: 1 },
          { location: { kind: 'field', playerId: 'p1', row: 0, col: 1 }, crop: 'grain', amount: -1 },
        ],
        reason: 'harvest',
      },
      {
        ...base,
        id: '3',
        seq: 3,
        type: 'farm.fenceConsumed',
        count: 3,
        reason: 'cardEffect',
      },
      {
        ...base,
        id: '4',
        seq: 4,
        type: 'farm.animalMoved',
        animals: { sheep: 2, boar: 0, cattle: 1 },
        from: { kind: 'supply' },
        to: { kind: 'player', playerId: 'p1' },
      },
      {
        ...base,
        id: '5',
        seq: 5,
        type: 'futureMeeple.removed',
        playerId: 'p1',
        cardId: 'B157_Salter',
        rounds: [6, 7],
      },
      {
        ...base,
        id: '6',
        seq: 6,
        type: 'futureMeeple.resolved',
        playerId: 'p1',
        cardId: 'B157_Salter',
        round: 6,
        roomType: 'clay',
        resources: { food: 2, wood: 0 },
      },
      {
        ...base,
        id: '7',
        seq: 7,
        type: 'worker.returned',
        workers: [{ playerId: 'p1', workerId: 'w1' }],
        to: 'home',
      },
      {
        ...base,
        id: '8',
        seq: 8,
        type: 'worker.promoted',
        playerId: 'p1',
        workerId: 'w2',
        from: 'newborn',
        to: 'adult',
      },
      {
        ...base,
        id: '9',
        seq: 9,
        type: 'work.started',
      },
      {
        ...base,
        id: '10',
        seq: 10,
        type: 'returnHome.started',
      },
    ] satisfies GameEvent[]

    const entries = eventsToLogEntries(events, { playerNames: { p1: 'Alice' } })

    expect(entries.map((entry) => entry.key)).toEqual([
      'log.returnHomeStarted',
      'log.workStarted',
      'log.workerPromoted',
      'log.workerReturned',
      'log.futureMeepleResolved',
      'log.futureMeepleRemoved',
      'log.farmAnimalMoved',
      'log.farmFenceConsumed',
      'log.farmCropRemoved',
      'log.farmCropAdded',
    ])
    expect(entries).toEqual([
      { key: 'log.returnHomeStarted' },
      { key: 'log.workStarted' },
      { key: 'log.workerPromoted', params: { player: 'Alice' } },
      { key: 'log.workerReturned', params: { destination: 'home' } },
      { key: 'log.futureMeepleResolved', params: { player: 'Alice', cardId: 'B157_Salter', round: 6, roomType: 'clay', resources: { food: 2 } } },
      { key: 'log.futureMeepleRemoved', params: { player: 'Alice', cardId: 'B157_Salter', rounds: '6, 7' } },
      { key: 'log.farmAnimalMoved', params: { player: 'Alice', animals: { sheep: 2, cattle: 1 } } },
      { key: 'log.farmFenceConsumed', params: { player: 'Alice', count: 3 } },
      { key: 'log.farmCropRemoved', params: { player: 'Alice', crops: { vegetable: 1 } } },
      { key: 'log.farmCropAdded', params: { player: 'Alice', crops: { grain: 3 } } },
    ])
  })

  it('maps returned workers without player attribution when multiple players return workers', () => {
    const event = {
      schemaVersion: 1,
      id: 'worker-returned',
      seq: 1,
      round: 5,
      phase: 'returnHome',
      visibility: 'public',
      type: 'worker.returned',
      workers: [
        { playerId: 'p1', workerId: 'w1' },
        { playerId: 'p2', workerId: 'w2' },
      ],
      to: 'home',
    } satisfies GameEvent

    expect(eventsToLogEntries([event], { playerNames: { p1: 'Alice', p2: 'Bob' } })).toEqual([
      { key: 'log.workerReturned', params: { destination: 'home' } },
    ])
  })
})
