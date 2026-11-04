import { describe, expect, it } from 'vitest'
import { parseRoomRetentionPolicy, parseRoomRetentionUpdate } from '../room-retention'

describe('room retention contract', () => {
  it('accepts the supported day boundaries and optional update provenance', () => {
    expect(parseRoomRetentionUpdate({ expectedRevision: 1, waitingDays: 1, playingDays: 90 }))
      .toEqual({ expectedRevision: 1, waitingDays: 1, playingDays: 90 })
    expect(parseRoomRetentionPolicy({ revision: 1, waitingDays: 3, playingDays: 7, updatedAt: null, updatedBy: null }))
      .toEqual({ revision: 1, waitingDays: 3, playingDays: 7, updatedAt: null, updatedBy: null })
    expect(parseRoomRetentionPolicy({ revision: 2, waitingDays: 4, playingDays: 8, updatedAt: 1_793_000_000_000, updatedBy: '管理员' }))
      .toEqual({ revision: 2, waitingDays: 4, playingDays: 8, updatedAt: 1_793_000_000_000, updatedBy: '管理员' })
  })

  it.each([null, [], {}, 0, 91, -1, 1.5, NaN, Infinity, '3', true])('rejects an invalid day value %j', value => {
    expect(() => parseRoomRetentionUpdate({ expectedRevision: 1, waitingDays: value, playingDays: 7 })).toThrow('waitingDays')
    expect(() => parseRoomRetentionPolicy({ revision: 1, waitingDays: 3, playingDays: value, updatedAt: null, updatedBy: null })).toThrow('playingDays')
  })

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '1', null, undefined])('rejects invalid revision %j', value => {
    expect(() => parseRoomRetentionUpdate({ expectedRevision: value, waitingDays: 3, playingDays: 7 })).toThrow('expectedRevision')
  })

  it('rejects missing provenance, invalid timestamps and extra properties', () => {
    expect(() => parseRoomRetentionPolicy({ revision: 1, waitingDays: 3, playingDays: 7 })).toThrow('updatedAt')
    expect(() => parseRoomRetentionPolicy({ revision: 1, waitingDays: 3, playingDays: 7, updatedAt: -1, updatedBy: null })).toThrow('updatedAt')
    expect(() => parseRoomRetentionPolicy({ revision: 1, waitingDays: 3, playingDays: 7, updatedAt: null, updatedBy: '' })).toThrow('updatedBy')
    expect(() => parseRoomRetentionUpdate({ expectedRevision: 1, waitingDays: 3, playingDays: 7, resetExisting: true })).toThrow('Expected a room retention update')
    expect(() => parseRoomRetentionUpdate([])).toThrow('Expected a room retention update')
  })
})
