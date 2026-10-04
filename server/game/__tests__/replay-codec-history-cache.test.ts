import { describe, expect, it } from 'vitest'
import {
  copyHistoryRecordIdentity,
  historyBranch,
  isCapturedHistoryRecord,
  materializeHistoryBranch,
  registerRestoredHistoryNode,
} from '../../../shared/session/history-streams.ts'
import { canonicalJson, frameHash } from '../replay-codec.ts'

const captureRecords = (records: object[]): object[] =>
  materializeHistoryBranch(historyBranch(records, 'events', { players: [] }))

const restoreRecord = (value: object): void => registerRestoredHistoryNode({
  id: 'restored-event', kind: 'events', previous: null, length: 1, value,
  identity: { recordId: 'restored-record', operationGroupId: 'restored-operation', participantRoles: {} },
})

const expectUncachedBytes = (value: unknown): void => {
  const detached = structuredClone(value)
  expect(canonicalJson(value)).toBe(canonicalJson(detached))
  expect(frameHash(value)).toBe(frameHash(detached))
}

describe('Canonical immutable history record reuse', () => {
  it('brands detached records without treating their mutable source as immutable', () => {
    const source = { id: 'event-1', params: { food: 1 } }
    const records = captureRecords([source])
    const captured = records[0]!

    expect(isCapturedHistoryRecord(captured)).toBe(true)
    expect(isCapturedHistoryRecord(source)).toBe(false)
    expect(isCapturedHistoryRecord(records)).toBe(false)
    const capturedHash = frameHash(captured)
    expect(capturedHash).toBe(frameHash(source))
    source.params.food = 2

    expect(frameHash(captured)).toBe(capturedHash)
    expect(frameHash(source)).not.toBe(capturedHash)
    expectUncachedBytes(captured)
    expectUncachedBytes(source)
  })

  it('keeps append, undo and renamed record versions byte-identical to detached Frames', () => {
    const first = captureRecords([{ id: 'event-1', params: { player: 'Alice', food: 1 } }])
    const appended = captureRecords([...first, { id: 'event-2', params: { food: 2 } }])
    const renamedSource = copyHistoryRecordIdentity(first[0]!, {
      id: 'event-1', params: { player: 'Bob', food: 1 },
    })
    const renamed = captureRecords([renamedSource, appended[1]!])

    expect(appended[0]).toBe(first[0])
    expect(renamed[0]).not.toBe(first[0])
    expect(isCapturedHistoryRecord(renamed[0]!)).toBe(true)
    expect(isCapturedHistoryRecord(renamedSource)).toBe(false)
    for (const events of [first, appended, first, renamed, appended]) {
      expectUncachedBytes({ events, duplicate: events, round: 2 })
    }
    expect(frameHash(first[0])).not.toBe(frameHash(renamed[0]))
  })

  it('admits restored JSON records only after their nested data is frozen', () => {
    const restored = { id: 'event-1', params: { amounts: [1, 2] } }
    restoreRecord(restored)

    expect(isCapturedHistoryRecord(restored)).toBe(true)
    expect(Object.isFrozen(restored.params)).toBe(true)
    expect(Object.isFrozen(restored.params.amounts)).toBe(true)
    expectUncachedBytes({ events: [restored, restored] })
  })

  it('does not cache a restored shallow-frozen object with a mutable descendant', () => {
    const params = { food: 1 }
    const restored = Object.freeze({ id: 'event-1', params })
    restoreRecord(restored)
    const before = frameHash(restored)
    params.food = 2

    expect(isCapturedHistoryRecord(restored)).toBe(false)
    expect(frameHash(restored)).not.toBe(before)
    expectUncachedBytes(restored)
  })

  it('does not cache a frozen accessor whose return value can change', () => {
    let food = 1
    const restored = Object.freeze({ get food() { return food } })
    restoreRecord(restored)
    const before = frameHash(restored)
    food = 2

    expect(isCapturedHistoryRecord(restored)).toBe(false)
    expect(frameHash(restored)).not.toBe(before)
    expect(canonicalJson(restored)).toBe('{"food":2}')
  })

  it('does not admit sparse arrays or custom array mapping as immutable JSON data', () => {
    const sparse = Object.freeze({ values: Object.freeze(new Array(2)) })
    let mapped = 'first'
    const values = [1]
    Object.defineProperty(values, 'map', { value: () => [JSON.stringify(mapped)] })
    const custom = Object.freeze({ values: Object.freeze(values) })
    restoreRecord(sparse)
    restoreRecord(custom)
    const before = frameHash(custom)
    mapped = 'second'

    expect(isCapturedHistoryRecord(sparse)).toBe(false)
    expect(isCapturedHistoryRecord(custom)).toBe(false)
    expect(canonicalJson(sparse)).toBe('{"values":[,]}')
    expect(canonicalJson(custom)).toBe('{"values":["second"]}')
    expect(frameHash(custom)).not.toBe(before)
  })
})
