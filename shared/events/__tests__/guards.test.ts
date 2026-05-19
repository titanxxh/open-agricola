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
})
