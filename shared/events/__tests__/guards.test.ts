import { describe, expect, it } from 'vitest'
import {
  assertEventSizeUnderLimit,
  assertGameEventEnvelope,
  assertJsonSafeEvent,
  assertKnownGameEventShape,
  assertPublicGameEvent,
} from '../guards'

describe('event guards', () => {
  it('accepts public json-safe events under size limit', () => {
    const event = {
      schemaVersion: 1,
      id: '1',
      seq: 1,
      round: 1,
      phase: 'work',
      type: 'card.stateChanged',
      visibility: 'public',
      cardId: 'B21_HayloftBarn',
      key: 'foodCount',
      value: 3,
      targetPlayerId: 'p1',
    }
    expect(() => assertGameEventEnvelope(event)).not.toThrow()
    expect(() => assertKnownGameEventShape(event)).not.toThrow()
    expect(() => assertPublicGameEvent(event)).not.toThrow()
    expect(() => assertJsonSafeEvent(event)).not.toThrow()
    expect(() => assertEventSizeUnderLimit(event, 4096)).not.toThrow()
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
