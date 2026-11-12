export type FeedbackRecord = {
  id: number
  submissionId: string
  issueNumber: number
  issueUrl: string
  reportSummary: string
  kind: 'confirmed_bug'
  explanation: string
  version: number
  createdAt: number
}

export type InboxMessage = FeedbackRecord & { readAt: number | null }
export type InboxPage = { messages: InboxMessage[]; unreadCount: number; nextCursor: number | null }
export type ReportFeedbackView = {
  submissionId: string
  issueNumber: number
  issueUrl: string
  version: number
  feedback: FeedbackRecord[]
}
export type RecordFeedbackInput = Pick<FeedbackRecord, 'issueNumber' | 'kind' | 'reportSummary' | 'explanation'> & {
  requestId: string
  expectedVersion: number
}

export function parseRecordFeedback(value: unknown): RecordFeedbackInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).some(key => !['issueNumber', 'kind', 'reportSummary', 'explanation', 'requestId', 'expectedVersion'].includes(key))
    || !('issueNumber' in value) || typeof value.issueNumber !== 'number' || !Number.isSafeInteger(value.issueNumber) || value.issueNumber < 1
    || !('kind' in value) || value.kind !== 'confirmed_bug'
    || !('reportSummary' in value) || typeof value.reportSummary !== 'string' || !value.reportSummary.trim() || value.reportSummary.length > 200
    || !('explanation' in value) || typeof value.explanation !== 'string' || !value.explanation.trim() || value.explanation.length > 2000
    || !('requestId' in value) || typeof value.requestId !== 'string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(value.requestId)
    || !('expectedVersion' in value) || typeof value.expectedVersion !== 'number' || !Number.isSafeInteger(value.expectedVersion) || value.expectedVersion < 0) {
    throw new Error('invalid_feedback')
  }
  return { issueNumber: value.issueNumber, kind: value.kind, reportSummary: value.reportSummary.trim(),
    explanation: value.explanation.trim(), requestId: value.requestId, expectedVersion: value.expectedVersion }
}
