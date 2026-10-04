import { describe, expect, it } from 'vitest'
import { capturePrivateCursor, privateCursorEquals } from '../private-cursor-comparison.ts'
import { canonicalJson } from '../replay-codec.ts'
import {
  historyBranch,
  isCapturedHistoryStream,
  materializeHistoryBranch,
  registerRestoredHistoryNode,
  type HistoryNode,
} from '../../../shared/session/history-streams.ts'

describe('private cursor comparison', () => {
  it('agrees with canonical JSON for reordered, omitted and normalized values', () => {
    const sparse: unknown[] = new Array(3)
    sparse[0] = 1
    sparse[2] = 2
    const values: unknown[] = [
      null, false, true, 0, -0, 1, Number.NaN, Infinity, -Infinity, '', '游标\ud800',
      {}, { omitted: undefined }, { omitted: () => 1 }, { omitted: Symbol('private') },
      { a: 1, b: { x: null, y: [1, 2] } }, { b: { y: [1, 2], x: null }, a: 1 },
      { a: 1, b: { x: Infinity, y: [1, 2] } }, { a: 1, b: { x: null, y: [2, 1] } },
      { value: undefined }, { value: null }, { toJSON: () => 'ignored' },
      JSON.parse('{"__proto__":{"saved":1},"constructor":2}'),
      [], new Array(1), new Array(2), [null], [undefined], [() => 1], [Symbol('private')],
      sparse, [1, undefined, 2], [1, null, 2],
    ]
    for (const before of values) {
      const captured = capturePrivateCursor(before)
      expect(canonicalJson(captured)).toBe(canonicalJson(before))
      for (const current of values) {
        expect(privateCursorEquals(captured, current)).toBe(
          canonicalJson(before) === canonicalJson(current),
        )
      }
    }
  })

  it('owns mutable engine, undo and nested checkpoint values even under shallow freezing', () => {
    const history = [{ state: { players: [{ resources: { food: 2 } }], log: [{ params: { food: 2 } }] } }]
    const cursor = {
      engineStackCursor: { frames: [{ pending: { value: 'before' } }] },
      history,
      provisionalContinuationScopes: [{ checkpoint: { history, state: { players: [{ resources: { food: 2 } }] } } }],
      shallow: Object.freeze({ nested: { value: 1 } }),
    }
    const unchanged = structuredClone(cursor)
    const captured = capturePrivateCursor(cursor)

    cursor.engineStackCursor.frames[0]!.pending.value = 'after'
    cursor.history[0]!.state.players[0]!.resources.food = 4
    cursor.history[0]!.state.log[0]!.params.food = 4
    cursor.provisionalContinuationScopes[0]!.checkpoint.state.players[0]!.resources.food = 4
    cursor.shallow.nested.value = 2

    expect(privateCursorEquals(captured, unchanged)).toBe(true)
    expect(privateCursorEquals(captured, cursor)).toBe(false)
    expect(canonicalJson(captured)).toBe(canonicalJson(unchanged))
  })

  it('rejects BigInt rather than silently dropping an unencodable cursor value', () => {
    expect(() => capturePrivateCursor({ pending: { value: 1n } })).toThrow(TypeError)
    expect(() => privateCursorEquals(capturePrivateCursor({ pending: { value: 1 } }), {
      pending: { value: 1n },
    })).toThrow(TypeError)
  })

  it('does not share a shallow-frozen source array merely because its branch was registered', () => {
    const source = Object.freeze([{ params: { food: 1 } }])
    const branch = historyBranch(source, 'events', { players: [] })
    const immutable = materializeHistoryBranch(branch)
    const captured = capturePrivateCursor({ events: source })
    const original = canonicalJson(captured)
    source[0]!.params.food = 2

    expect(isCapturedHistoryStream(source)).toBe(false)
    expect(isCapturedHistoryStream(immutable)).toBe(true)
    expect(canonicalJson(captured)).toBe(original)
    expect(privateCursorEquals(captured, { events: source })).toBe(false)
    expect(privateCursorEquals(captured, { events: immutable })).toBe(true)
  })

  it('does not share a materialized stream containing an unproven restored record', () => {
    const params = { food: 1 }
    const node: HistoryNode = {
      id: 'shallow-restored', kind: 'events', previous: null, length: 1,
      value: Object.freeze({ params }),
      identity: { recordId: 'shallow-record', operationGroupId: 'operation', participantRoles: {} },
    }
    registerRestoredHistoryNode(node)
    const events = materializeHistoryBranch({ kind: 'events', head: node, length: 1 })
    const captured = capturePrivateCursor({ events })
    params.food = 2

    expect(isCapturedHistoryStream(events)).toBe(false)
    expect(canonicalJson(captured)).toBe('{"events":[{"params":{"food":1}}]}')
    expect(privateCursorEquals(captured, { events })).toBe(false)
  })
})
