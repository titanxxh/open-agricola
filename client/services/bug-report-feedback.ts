import { parseFeedbackDetails, type FeedbackDetails, type FeedbackRecord, type InboxMessage, type InboxPage, type ReportFeedbackView } from '../../shared/contract/bug-report-feedback'

export const feedbackKindKey = { confirmed_bug: 'feedback.confirmedBug', not_bug: 'feedback.notBug', needs_info: 'feedback.needsInfo' } satisfies Record<FeedbackDetails['kind'], string>

const integer = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0

function feedback(value: unknown): FeedbackRecord {
  if (!value || typeof value !== 'object'
    || !('id' in value) || !integer(value.id) || value.id < 1
    || !('submissionId' in value) || typeof value.submissionId !== 'string'
    || !('issueNumber' in value) || !integer(value.issueNumber) || value.issueNumber < 1
    || !('issueUrl' in value) || value.issueUrl !== `https://github.com/titanxxh/open-agricola/issues/${value.issueNumber}`
    || !('reportSummary' in value) || typeof value.reportSummary !== 'string'
    || !('explanation' in value) || typeof value.explanation !== 'string'
    || !('version' in value) || !integer(value.version)
    || !('createdAt' in value) || !integer(value.createdAt)) throw new Error('invalid_feedback_response')
  return { id: value.id, submissionId: value.submissionId, issueNumber: value.issueNumber, issueUrl: value.issueUrl,
    ...parseFeedbackDetails(value), reportSummary: value.reportSummary, version: value.version, createdAt: value.createdAt }
}

function message(value: unknown): InboxMessage {
  const record = feedback(value)
  if (!value || typeof value !== 'object' || !('readAt' in value) || (value.readAt !== null && !integer(value.readAt))) {
    throw new Error('invalid_feedback_response')
  }
  return { ...record, readAt: value.readAt }
}

async function body(response: Response): Promise<object> {
  const value: unknown = await response.json()
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    if (!response.ok && 'code' in value && typeof value.code === 'string') throw new Error(value.code)
    if (response.ok && 'ok' in value && value.ok === true) return value
  }
  throw new Error('feedback_unavailable')
}

export async function readInboxPage(response: Response): Promise<InboxPage> {
  const value = await body(response)
  if (!('messages' in value) || !Array.isArray(value.messages)
    || !('unreadCount' in value) || !integer(value.unreadCount)
    || !('nextCursor' in value) || (value.nextCursor !== null && !integer(value.nextCursor))) throw new Error('invalid_feedback_response')
  return { messages: value.messages.map(message), unreadCount: value.unreadCount, nextCursor: value.nextCursor }
}

export async function readInboxMessage(response: Response): Promise<InboxMessage> {
  const value = await body(response)
  if (!('message' in value)) throw new Error('invalid_feedback_response')
  return message(value.message)
}

export async function readReportFeedback(response: Response): Promise<ReportFeedbackView> {
  const value = await body(response)
  if (!('report' in value) || !value.report || typeof value.report !== 'object') throw new Error('invalid_feedback_response')
  const report = value.report
  if (!('submissionId' in report) || typeof report.submissionId !== 'string'
    || !('issueNumber' in report) || !integer(report.issueNumber) || report.issueNumber < 1
    || !('issueUrl' in report) || report.issueUrl !== `https://github.com/titanxxh/open-agricola/issues/${report.issueNumber}`
    || !('version' in report) || !integer(report.version)
    || !('feedback' in report) || !Array.isArray(report.feedback)) throw new Error('invalid_feedback_response')
  return { submissionId: report.submissionId, issueNumber: report.issueNumber, issueUrl: report.issueUrl,
    version: report.version, feedback: report.feedback.map(feedback) }
}
