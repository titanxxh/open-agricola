import { describe, expect, it } from 'vitest'
import {
  applyReplayDelta,
  canonicalJson,
  createReplayDelta,
  decodeReplayFrame,
  encodeReplayFrame,
  type JsonValue,
  type ReplayDeltaOperation,
} from '../replay-codec.ts'

const json = (value: string): JsonValue => JSON.parse(value) as JsonValue

describe('Replay delta own JSON properties', () => {
  it('adds, replaces and removes prototype-like property names as ordinary JSON data', () => {
    const empty: JsonValue = {}
    const added = json('{"__proto__":{"food":1},"constructor":{"name":"card"},"toString":"text"}')
    const replaced = json('{"__proto__":{"food":2},"constructor":{"name":"other"},"toString":"new"}')

    const adds = createReplayDelta(empty, added)
    expect(adds).toEqual([
      { op: 'add', path: '/__proto__', value: { food: 1 } },
      { op: 'add', path: '/constructor', value: { name: 'card' } },
      { op: 'add', path: '/toString', value: 'text' },
    ])
    const restored = applyReplayDelta(empty, adds)
    expect(canonicalJson(restored)).toBe(canonicalJson(added))
    expect(Object.getPrototypeOf(restored)).toBe(Object.prototype)
    expect(Object.getOwnPropertyDescriptor(restored, '__proto__'))
      .toMatchObject({ value: { food: 1 }, enumerable: true })

    const changes = createReplayDelta(added, replaced)
    expect(changes).toEqual([
      { op: 'replace', path: '/__proto__/food', value: 2 },
      { op: 'replace', path: '/constructor/name', value: 'other' },
      { op: 'replace', path: '/toString', value: 'new' },
    ])
    expect(canonicalJson(applyReplayDelta(added, changes))).toBe(canonicalJson(replaced))
    const removes = createReplayDelta(replaced, empty)
    expect(removes).toEqual([
      { op: 'remove', path: '/__proto__' },
      { op: 'remove', path: '/constructor' },
      { op: 'remove', path: '/toString' },
    ])
    expect(applyReplayDelta(replaced, removes)).toEqual(empty)
    expect(canonicalJson(added)).toBe('{"__proto__":{"food":1},"constructor":{"name":"card"},"toString":"text"}')
  })

  it('round-trips prototype-like fields inside nested arrays and escaped pointer paths', () => {
    const before = json('{"rows":[{"a/b":{"~key":{"__proto__":{"food":1},"constructor":2}}}]}')
    const after = json('{"rows":[{"a/b":{"~key":{"__proto__":3,"constructor":4,"hasOwnProperty":5}}},{"__proto__":6}]}')
    const delta = createReplayDelta(before, after)

    expect(delta).toContainEqual({ op: 'replace', path: '/rows/0/a~1b/~0key/__proto__', value: 3 })
    expect(delta).toContainEqual({ op: 'add', path: '/rows/0/a~1b/~0key/hasOwnProperty', value: 5 })
    expect(canonicalJson(applyReplayDelta(before, delta))).toBe(canonicalJson(after))
    expect(canonicalJson(applyReplayDelta(after, createReplayDelta(after, before)))).toBe(canonicalJson(before))
  })

  it('keeps valid prototype-like fields inside a hash-verified encoded delta', () => {
    const before: JsonValue = { stable: 'x'.repeat(1_000), record: {} }
    const after: JsonValue = { stable: 'x'.repeat(1_000), record: json('{"__proto__":{"__replay_delta_frame__":1}}') }
    const encoded = encodeReplayFrame({ frame: after, previousFrame: before, stepNo: 1, previousCheckpointStepNo: 0 })

    try {
      expect(encoded.payloadKind).toBe('delta')
      expect(canonicalJson(decodeReplayFrame(before, encoded))).toBe(canonicalJson(after))
      expect(Object.hasOwn(Object.prototype, '__replay_delta_frame__')).toBe(false)
    } finally {
      Reflect.deleteProperty(Object.prototype, '__replay_delta_frame__')
    }
  })

  it.each([
    { op: 'add', path: '/__proto__/__replay_delta_polluted__', value: true },
    { op: 'add', path: '/constructor/prototype/__replay_delta_polluted__', value: true },
    { op: 'add', path: '/rows/0/__proto__/__replay_delta_polluted__', value: true },
    { op: 'replace', path: '/__proto__', value: null },
    { op: 'replace', path: '/constructor', value: null },
    { op: 'remove', path: '/toString' },
  ] satisfies ReplayDeltaOperation[])('rejects inherited-only paths: $op $path', (operation) => {
    const before: JsonValue = { rows: [{}] }

    try {
      expect(() => applyReplayDelta(before, [operation])).toThrow('JSON pointer does not exist')
      expect(before).toEqual({ rows: [{}] })
      expect(Object.hasOwn(Object.prototype, '__replay_delta_polluted__')).toBe(false)
      expect(Object.hasOwn(Array.prototype, '__replay_delta_polluted__')).toBe(false)
    } finally {
      Reflect.deleteProperty(Object.prototype, '__replay_delta_polluted__')
      Reflect.deleteProperty(Array.prototype, '__replay_delta_polluted__')
    }
  })
})
