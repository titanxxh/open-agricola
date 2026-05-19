import { describe, expect, it } from 'vitest'
import { noopEventSink } from '../noop'

describe('noopEventSink', () => {
  it('returns undefined and does not throw for single or many events', () => {
    const event = {
      type: 'resource.moved',
      resources: { wood: 1 },
      from: { kind: 'supply' },
      to: { kind: 'player', playerId: 'p1' },
      reason: 'gain',
    } as const

    expect(() => noopEventSink.emit(event)).not.toThrow()
    expect(noopEventSink.emit(event)).toBeUndefined()
    expect(() => noopEventSink.emitMany([event])).not.toThrow()
    expect(noopEventSink.emitMany([event])).toBeUndefined()
  })
})
