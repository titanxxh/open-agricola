import { describe, expect, it } from 'vitest'
import { applyReplayDelta, createReplayDelta, type JsonValue } from '../replay-codec.ts'

describe('Replay delta with shared immutable history', () => {
  it('preserves the delta when a Frame reuses an entire history array', () => {
    const record = { id: 'event-1', params: { food: 1 } }
    Object.freeze(record.params)
    Object.freeze(record)
    const events = [record]
    Object.freeze(events)
    const before: JsonValue = { events, round: 1 }
    const after: JsonValue = { events, round: 2 }

    const delta = createReplayDelta(before, after)
    expect(delta).toEqual([{ op: 'replace', path: '/round', value: 2 }])
    expect(delta).toEqual(createReplayDelta(structuredClone(before), structuredClone(after)))
    expect(applyReplayDelta(before, delta)).toEqual(after)
    expect(createReplayDelta(before, before)).toEqual([])
    expect(before).toEqual({ events: [{ id: 'event-1', params: { food: 1 } }], round: 1 })
  })

  it('preserves replacement and tail-removal operations around shared records', () => {
    const shared = { id: 'event-1', params: { food: 1 } }
    Object.freeze(shared.params)
    Object.freeze(shared)
    const before: JsonValue = {
      events: [shared, { id: 'event-2', params: { food: 2 } }, { id: 'event-3' }],
      round: 1,
    }
    const after: JsonValue = {
      events: [shared, { id: 'event-2', params: { food: 3 } }],
      round: 2,
    }

    const delta = createReplayDelta(before, after)
    expect(delta).toEqual([
      { op: 'replace', path: '/events/1/params/food', value: 3 },
      { op: 'remove', path: '/events/2' },
      { op: 'replace', path: '/round', value: 2 },
    ])
    expect(delta).toEqual(createReplayDelta(structuredClone(before), structuredClone(after)))
    expect(applyReplayDelta(before, delta)).toEqual(after)
    expect(applyReplayDelta(after, createReplayDelta(after, before))).toEqual(before)
  })

  it('still detects edits to separately captured bodies beneath shallow-frozen containers', () => {
    const before: JsonValue = Object.freeze({ body: { food: 1 } })
    const after: JsonValue = Object.freeze({ body: { food: 2 } })
    const delta = createReplayDelta(before, after)

    expect(delta).toEqual([{ op: 'replace', path: '/body/food', value: 2 }])
    expect(applyReplayDelta(before, delta)).toEqual(after)
  })
})
