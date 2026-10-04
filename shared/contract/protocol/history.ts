import type { GameState } from '../types'

export type HistoryDisplayRecord = {
  recordId: string
  operationGroupId: string
  participantRoles?: Record<string, string>
}
export type HistoryWindow = {
  branchId: string
  operationGroupIds: string[]
  nextCursor: string | null
  logRecords: HistoryDisplayRecord[]
  eventRecords: HistoryDisplayRecord[]
  archiveRecords: HistoryDisplayRecord[]
}
export type RoomHistoryPage = Pick<GameState, 'log' | 'events' | 'publicEventArchive'> & { window: HistoryWindow }
