import { describe, expect, it } from 'vitest'
import type { GameEvent } from '../../contract/events'
import { createEventQuery } from '../query'

const events = [
  {
    schemaVersion: 1,
    id: '1',
    seq: 1,
    round: 1,
    phase: 'work',
    type: 'resource.exchanged',
    visibility: 'public',
    paid: { food: 1 },
    gained: { grain: 1 },
    paidFrom: { kind: 'player', playerId: 'p1' },
    paidTo: { kind: 'supply' },
    gainedFrom: { kind: 'supply' },
    gainedTo: { kind: 'player', playerId: 'p1' },
  },
] satisfies GameEvent[]

describe('createEventQuery', () => {
  it('filters typed transaction events', () => {
    const query = createEventQuery(events)
    expect(query.has('resource.exchanged', (e) => (e.gained.grain ?? 0) > 0)).toBe(true)
    expect(query.find('resource.moved')).toBeUndefined()
    expect(query.filter('resource.exchanged')).toHaveLength(1)
  })
})
