export type FeedbackDetails = { kind: 'confirmed_bug' | 'not_bug'; explanation: string }
  | { kind: 'needs_info'; explanation: string; missingItems: [string, ...string[]] }

export type FeedbackRecord = FeedbackDetails & {
  id: number
  submissionId: string
  issueNumber: number
  issueUrl: string
  reportSummary: string
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
export type RecordFeedbackInput = FeedbackDetails & Pick<FeedbackRecord, 'issueNumber' | 'reportSummary'> & {
  requestId: string
  expectedVersion: number
}

const genericFeedback = new Set([
  'insufficientinformation', 'notenoughinformation', 'moreinformation', 'moreinformationneeded', 'needmoreinformation',
  'informationneeded', 'details', '信息不足', '更多信息', '需要更多信息', '需要补充信息', '缺少信息',
  'notbug', 'notabug', 'normalbehavior', '不是bug', '非bug', '无效', '正常行为',
])
const specific = (value: string) => !genericFeedback.has(value.toLowerCase().replace(/[\s\p{P}]/gu, ''))

export function parseFeedbackDetails(value: unknown): FeedbackDetails {
  if (!value || typeof value !== 'object'
    || !('explanation' in value) || typeof value.explanation !== 'string' || !value.explanation.trim() || value.explanation.length > 2000
    || !('kind' in value)) throw new Error('invalid_feedback')
  const explanation = value.explanation.trim()
  if ((value.kind === 'confirmed_bug' || value.kind === 'not_bug') && !('missingItems' in value)
    && (value.kind !== 'not_bug' || specific(explanation))) return { kind: value.kind, explanation }
  if (value.kind === 'needs_info' && 'missingItems' in value && Array.isArray(value.missingItems)
    && value.missingItems.length <= 10 && value.missingItems.every((item: unknown) => typeof item === 'string' && item.trim() && specific(item) && item.length <= 200)) {
    const [first, ...rest]: unknown[] = value.missingItems
    if (typeof first === 'string' && rest.every((item): item is string => typeof item === 'string')) {
      return { kind: value.kind, explanation, missingItems: [first.trim(), ...rest.map(item => item.trim())] }
    }
  }
  throw new Error('invalid_feedback')
}

export function parseRecordFeedback(value: unknown): RecordFeedbackInput {
  const details = parseFeedbackDetails(value)
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).some(key => !['issueNumber', 'kind', 'reportSummary', 'explanation', 'missingItems', 'requestId', 'expectedVersion'].includes(key))
    || !('issueNumber' in value) || typeof value.issueNumber !== 'number' || !Number.isSafeInteger(value.issueNumber) || value.issueNumber < 1
    || !('reportSummary' in value) || typeof value.reportSummary !== 'string' || !value.reportSummary.trim() || value.reportSummary.length > 200
    || !('requestId' in value) || typeof value.requestId !== 'string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(value.requestId)
    || !('expectedVersion' in value) || typeof value.expectedVersion !== 'number' || !Number.isSafeInteger(value.expectedVersion) || value.expectedVersion < 0) {
    throw new Error('invalid_feedback')
  }
  return { ...details, issueNumber: value.issueNumber, reportSummary: value.reportSummary.trim(),
    requestId: value.requestId, expectedVersion: value.expectedVersion }
}
