import type { GameState } from '../types'

export type HistoryDisplayRecord = {
  recordId: string
  operationGroupId: string
  participantRoles?: Record<string, string>
}
export type HistoryWindow = {
  branchId: string
  /** Full stream lengths distinguish a restored prefix from an ordinary append. */
  streamLengths?: number[]
  operationGroupIds: string[]
  nextCursor: string | null
  logRecords: HistoryDisplayRecord[]
  eventRecords: HistoryDisplayRecord[]
  archiveRecords: HistoryDisplayRecord[]
}
export type RoomHistoryPage = Pick<GameState, 'log' | 'events' | 'publicEventArchive'> & { window: HistoryWindow }
