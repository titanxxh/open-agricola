export const DEFAULT_ROOM_RETENTION_DAYS = Object.freeze({ waiting: 3, playing: 7 })
export const MIN_ROOM_RETENTION_DAYS = 1
export const MAX_ROOM_RETENTION_DAYS = 90

export type RoomRetentionPolicy = {
  revision: number
  waitingDays: number
  playingDays: number
  updatedAt: number | null
  updatedBy: string | null
}

export type RoomRetentionUpdate = {
  expectedRevision: number
  waitingDays: number
  playingDays: number
}

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

const days = (value: unknown, field: string): number => {
  if (typeof value !== 'number' || !Number.isInteger(value)
    || value < MIN_ROOM_RETENTION_DAYS || value > MAX_ROOM_RETENTION_DAYS) {
    throw new Error(`${field}: expected an integer from ${MIN_ROOM_RETENTION_DAYS} to ${MAX_ROOM_RETENTION_DAYS}`)
  }
  return value
}

const revision = (value: unknown, field: string): number => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${field}: expected a positive safe integer`)
  }
  return value
}

export function parseRoomRetentionPolicy(value: unknown): RoomRetentionPolicy {
  if (!record(value) || Object.keys(value).some(key => !['revision', 'waitingDays', 'playingDays', 'updatedAt', 'updatedBy'].includes(key))) {
    throw new Error('Expected a room retention policy')
  }
  const { updatedAt, updatedBy } = value
  if (updatedAt !== null && (typeof updatedAt !== 'number' || !Number.isSafeInteger(updatedAt) || updatedAt < 0)) {
    throw new Error('updatedAt: expected a non-negative timestamp or null')
  }
  if (updatedBy !== null && (typeof updatedBy !== 'string' || !updatedBy.trim())) {
    throw new Error('updatedBy: expected a display name or null')
  }
  return {
    revision: revision(value.revision, 'revision'),
    waitingDays: days(value.waitingDays, 'waitingDays'),
    playingDays: days(value.playingDays, 'playingDays'),
    updatedAt,
    updatedBy,
  }
}

export function parseRoomRetentionUpdate(value: unknown): RoomRetentionUpdate {
  if (!record(value) || Object.keys(value).some(key => !['expectedRevision', 'waitingDays', 'playingDays'].includes(key))) {
    throw new Error('Expected a room retention update')
  }
  return {
    expectedRevision: revision(value.expectedRevision, 'expectedRevision'),
    waitingDays: days(value.waitingDays, 'waitingDays'),
    playingDays: days(value.playingDays, 'playingDays'),
  }
}
