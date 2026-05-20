import { describe, expect, it } from 'vitest'
import {
  assertEventSizeUnderLimit,
  assertGameEventEnvelope,
  assertJsonSafeEvent,
  assertKnownGameEventShape,
  assertPublicGameEvent,
} from '../guards'

describe('event guards', () => {
  const baseEvent = {
    schemaVersion: 1,
    id: '1',
    seq: 1,
    round: 1,
    phase: 'work',
    visibility: 'public',
  } as const

  it('accepts public json-safe events under size limit', () => {
    const event = {
      ...baseEvent,
      cardId: 'B21_HayloftBarn',
      key: 'foodCount',
      type: 'card.stateChanged',
      value: 3,
      targetPlayerId: 'p1',
    }
    expect(() => assertGameEventEnvelope(event)).not.toThrow()
    expect(() => assertKnownGameEventShape(event)).not.toThrow()
    expect(() => assertPublicGameEvent(event)).not.toThrow()
    expect(() => assertJsonSafeEvent(event)).not.toThrow()
    expect(() => assertEventSizeUnderLimit(event, 4096)).not.toThrow()
  })

  it('accepts empty card infobox text as an explicit clear event', () => {
    expect(() => assertKnownGameEventShape({
      ...baseEvent,
      type: 'card.infoboxChanged',
      cardId: 'C115_Sower',
      text: '',
      targetPlayerId: 'p1',
    })).not.toThrow()
  })

  it('accepts action exclusive-use clear events', () => {
    expect(() => assertKnownGameEventShape({
      ...baseEvent,
      round: 13,
      type: 'action.exclusiveUseCleared',
      actionId: 'round-14-action',
      playerId: 'p1',
      sourceCardId: 'B23_FinalScenario',
    })).not.toThrow()
  })

  it('accepts future meeple queued source summaries', () => {
    expect(() => assertKnownGameEventShape({
      ...baseEvent,
      type: 'futureMeeple.queued',
      playerId: 'p1',
      cardId: 'B157_Salter',
      entries: [{ round: 4, resources: { food: 2 } }],
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
    })).not.toThrow()
  })

  it('accepts fence-built provenance metadata', () => {
    expect(() => assertKnownGameEventShape({
      ...baseEvent,
      type: 'farm.fenceBuilt',
      fences: [{ edge: 'H-0-0', type: 'fence' }],
      newFenceEdges: ['H-0-0'],
      newPastures: [{ tiles: [{ row: 0, col: 0 }] }],
    })).not.toThrow()
  })

  it.each([
    [
      'resource.moved resources',
      {
        resources: undefined,
        type: 'resource.moved',
        from: { kind: 'supply' },
        to: { kind: 'player', playerId: 'p1' },
        reason: 'gain',
      },
      /resources/,
    ],
    [
      'resource.moved reason',
      {
        resources: { wood: 1 },
        type: 'resource.moved',
        from: { kind: 'supply' },
        to: { kind: 'player', playerId: 'p1' },
      },
      /reason/,
    ],
    [
      'resource.paid paymentFor',
      {
        resources: { food: 1 },
        type: 'resource.paid',
      },
      /paymentFor/,
    ],
    [
      'farm.sown crop',
      {
        type: 'farm.sown',
        sows: [{ location: { kind: 'field', playerId: 'p1', row: 0, col: 0 }, added: 2 }],
      },
      /sows\[0\]\.crop/,
    ],
    [
      'farm.cropRemoved reason',
      {
        type: 'farm.cropRemoved',
        crops: [{ location: { kind: 'field', playerId: 'p1', row: 0, col: 0 }, crop: 'grain', amount: 1 }],
      },
      /reason/,
    ],
    [
      'farm.cropAdded crop',
      {
        type: 'farm.cropAdded',
        reason: 'cardEffect',
        crops: [{ location: { kind: 'field', playerId: 'p1', row: 0, col: 0 }, amount: 1 }],
      },
      /crops\[0\]\.crop/,
    ],
    [
      'farm.animalDiscarded reason',
      {
        type: 'farm.animalDiscarded',
        animals: { sheep: 1 },
      },
      /reason/,
    ],
    [
      'worker.returned to',
      {
        type: 'worker.returned',
        workers: [{ playerId: 'p1', workerId: '1' }],
      },
      /to/,
    ],
    [
      'worker.placed workerId',
      {
        type: 'worker.placed',
        spaceId: 'forest',
      },
      /workerId/,
    ],
    [
      'card.played cardId',
      {
        type: 'card.played',
        cardType: 'minor',
      },
      /cardId/,
    ],
    [
      'farm.renovated rooms',
      {
        type: 'farm.renovated',
        playerId: 'p1',
        from: 'wood',
        to: 'clay',
      },
      /rooms/,
    ],
    [
      'futureMeeple.queued entries round',
      {
        type: 'futureMeeple.queued',
        playerId: 'p1',
        cardId: 'E47_SyrupTap',
        entries: [{ resources: { wood: 1 } }],
      },
      /entries\[0\]\.round/,
    ],
    [
      'round.started round',
      {
        round: undefined,
        type: 'round.started',
      },
      /round/,
    ],
  ])('rejects missing required event field for %s', (_name, event, error) => {
    expect(() => assertKnownGameEventShape({ ...baseEvent, ...event })).toThrow(error)
  })

  it('rejects private visibility and non-json values', () => {
    expect(() => assertPublicGameEvent({ visibility: 'private' })).toThrow(/public/)
    expect(() => assertJsonSafeEvent({ value: () => 1 })).toThrow(/JSON-safe/)
    expect(() => assertJsonSafeEvent({ value: Symbol('private') })).toThrow(/JSON-safe/)
  })

  it('rejects undefined and non-finite numbers', () => {
    expect(() => assertJsonSafeEvent({ value: undefined })).toThrow(/JSON-safe/)
    expect(() => assertJsonSafeEvent({ value: Number.NaN })).toThrow(/JSON-safe/)
    expect(() => assertJsonSafeEvent({ value: Infinity })).toThrow(/JSON-safe/)
  })

  it('rejects malformed event envelopes', () => {
    expect(() => assertGameEventEnvelope({
      schemaVersion: 2,
      id: '1',
      seq: 1,
      round: 1,
      phase: 'work',
      type: 'resource.moved',
    })).toThrow(/schemaVersion/)
    expect(() => assertGameEventEnvelope({
      schemaVersion: 1,
      id: '1',
      seq: -1,
      round: 1,
      phase: 'work',
      type: 'resource.moved',
    })).toThrow(/seq/)
  })

  it('rejects unknown event types and schema fields', () => {
    expect(() => assertKnownGameEventShape({
      schemaVersion: 1,
      id: '1',
      seq: 1,
      round: 1,
      phase: 'work',
      type: 'unknown.event',
      visibility: 'public',
    })).toThrow(/Unknown GameEvent type/)
    expect(() => assertKnownGameEventShape({
      schemaVersion: 1,
      id: '1',
      seq: 1,
      round: 1,
      phase: 'work',
      type: 'resource.moved',
      visibility: 'public',
      resources: { wood: 1 },
      from: { kind: 'supply' },
      to: { kind: 'player', playerId: 'p1' },
      reason: 'gain',
      privateHand: ['E1_PrivateCard'],
    })).toThrow(/Unknown GameEvent field privateHand/)
  })

  it('rejects nested private shapes in public event schema fields', () => {
    expect(() => assertKnownGameEventShape({
      schemaVersion: 1,
      id: '1',
      seq: 1,
      round: 1,
      phase: 'work',
      type: 'resource.moved',
      visibility: 'public',
      resources: { wood: 1 },
      from: { kind: 'supply' },
      to: { kind: 'player', playerId: 'p1', minorHand: ['E1_PrivateCard'] },
      reason: 'gain',
    })).toThrow(/to/)

    expect(() => assertKnownGameEventShape({
      schemaVersion: 1,
      id: '1',
      seq: 1,
      round: 1,
      phase: 'work',
      type: 'resource.moved',
      visibility: 'public',
      resources: { wood: 1, prompt: { kind: 'choose-card' } },
      from: { kind: 'supply' },
      to: { kind: 'player', playerId: 'p1' },
      reason: 'gain',
    })).toThrow(/resources/)

    expect(() => assertKnownGameEventShape({
      schemaVersion: 1,
      id: '1',
      seq: 1,
      round: 1,
      phase: 'work',
      type: 'resource.paid',
      visibility: 'public',
      resources: { food: 1 },
      paymentFor: 'feeding',
      paymentSources: [
        {
          from: { kind: 'player', playerId: 'p1', draft: { pools: {} } },
          resources: { food: 1 },
        },
      ],
    })).toThrow(/paymentSources/)

    expect(() => assertKnownGameEventShape({
      schemaVersion: 1,
      id: '1',
      seq: 1,
      round: 1,
      phase: 'work',
      type: 'resource.moved',
      visibility: 'public',
      resources: { wood: 1 },
      from: { kind: 'supply' },
      to: { kind: 'player', playerId: 'p1' },
      reason: 'gain',
      trigger: { phase: 'after', prompt: 'private' },
    })).toThrow(/private payload/)

    expect(() => assertKnownGameEventShape({
      schemaVersion: 1,
      id: '1',
      seq: 1,
      round: 1,
      phase: 'work',
      type: 'resource.paid',
      visibility: 'public',
      resources: { food: 1 },
      paymentFor: 'feeding',
      bonusChoiceIndex: { prompt: 1 },
    })).toThrow(/private payload/)
  })

  it('only allows public scalar and array card state values', () => {
    const base = {
      schemaVersion: 1,
      id: '1',
      seq: 1,
      round: 1,
      phase: 'work',
      type: 'card.stateChanged',
      visibility: 'public',
      cardId: 'B21_HayloftBarn',
      key: 'foodCount',
      targetPlayerId: 'p1',
    }

    expect(() => assertKnownGameEventShape({ ...base, value: [null, 'x', 1, true, [2]] })).not.toThrow()
    expect(() => assertKnownGameEventShape({ ...base, value: { public: true } })).toThrow(/value/)
    expect(() => assertKnownGameEventShape({ ...base, value: [{ minorHand: ['E1_PrivateCard'] }] })).toThrow(/value/)
  })

  it('rejects events over the size limit', () => {
    expect(() => assertEventSizeUnderLimit({ payload: 'x'.repeat(4097) }, 4096)).toThrow(/4096/)
  })
})
