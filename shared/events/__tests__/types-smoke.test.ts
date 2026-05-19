import { describe, expect, it } from 'vitest'
import type { GameEvent, ResourceMovedEvent } from '../../contract/events'
import type { GameState } from '../../contract/types'

describe('event contract smoke', () => {
  it('allows GameState to carry public events', () => {
    const event: ResourceMovedEvent = {
      schemaVersion: 1,
      id: '1',
      seq: 1,
      round: 1,
      phase: 'work',
      type: 'resource.moved',
      visibility: 'public',
      actorPlayerId: 'p1',
      resources: { wood: 2 },
      from: { kind: 'actionSpace', spaceId: 'forest' },
      to: { kind: 'player', playerId: 'p1' },
      reason: 'collect',
    }
    const state = { events: [event], nextEventSeq: 2 } as GameState
    expect((state.events[0] as GameEvent).type).toBe('resource.moved')
    expect(state.nextEventSeq).toBe(2)
  })
})
