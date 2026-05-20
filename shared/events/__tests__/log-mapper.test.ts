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
    expect(eventsToLogEntries(events, { playerNames: { p1: 'Alice' }, actionNames: { forest: 'Forest' } })).toEqual([
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
        sourceCardId: 'B23_FinalScenario',
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
        sourceCardId: 'B23_FinalScenario',
      },
    ] satisfies GameEvent[]
    expect(eventsToLogEntries(events, { playerNames: { p1: 'Alice' }, actionNames: { round14: 'Round 14 Action' } })).toEqual([
      {
        key: 'log.actionExclusiveUseCleared',
        params: { player: 'Alice', action: 'Round 14 Action', cardId: 'B23_FinalScenario' },
      },
      {
        key: 'log.actionExclusiveUseSet',
        params: { player: 'Alice', action: 'Round 14 Action', cardId: 'B23_FinalScenario' },
      },
      {
        key: 'log.actionRevealed',
        params: { action: 'Round 14 Action', roundSlot: 14 },
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
    expect(eventsToLogEntries(events, { playerNames: { p1: 'Alice' } })[0]?.params?.action).toBe('exchange')
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
})
