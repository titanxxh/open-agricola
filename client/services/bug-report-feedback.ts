import { isCommitSha, parseFeedbackDetails, type FeedbackRecord, type FixAssociation, type InboxMessage, type InboxPage, type ReportFeedbackView, type VerifiedFixPullRequest, type VerifiedProductionRelease, type RelatedFeedbackReport } from '../../shared/contract/bug-report-feedback'

export const feedbackKindKey = { confirmed_bug: 'feedback.confirmedBug', not_bug: 'feedback.notBug', needs_info: 'feedback.needsInfo', fix_released: 'feedback.releaseKind' } satisfies Record<InboxMessage['kind'], string>

const integer = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0

function feedbackBase(value: unknown) {
  if (!value || typeof value !== 'object'
    || !('id' in value) || !integer(value.id) || value.id < 1
    || !('submissionId' in value) || typeof value.submissionId !== 'string'
    || !('issueNumber' in value) || !integer(value.issueNumber) || value.issueNumber < 1
    || !('issueUrl' in value) || value.issueUrl !== `https://github.com/titanxxh/open-agricola/issues/${value.issueNumber}`
    || !('reportSummary' in value) || typeof value.reportSummary !== 'string'
    || !('explanation' in value) || typeof value.explanation !== 'string'
    || !('createdAt' in value) || !integer(value.createdAt)) throw new Error('invalid_feedback_response')
  return { id: value.id, submissionId: value.submissionId, issueNumber: value.issueNumber, issueUrl: value.issueUrl,
    explanation: value.explanation, reportSummary: value.reportSummary, createdAt: value.createdAt }
}

function feedback(value: unknown): FeedbackRecord {
  const base = feedbackBase(value)
  if (!value || typeof value !== 'object' || !('version' in value) || !integer(value.version)) throw new Error('invalid_feedback_response')
  return { ...base, ...parseFeedbackDetails(value), version: value.version }
}

function productionRelease(value: unknown): VerifiedProductionRelease {
  if (!value || typeof value !== 'object' || !('version' in value) || typeof value.version !== 'string' || !/^v\d+\.\d+\.\d+$/.test(value.version)
    || !('url' in value) || value.url !== `https://github.com/titanxxh/open-agricola/releases/tag/${value.version}`
    || !('sha' in value) || !isCommitSha(value.sha)
    || !('publishedAt' in value) || !integer(value.publishedAt)
    || !('verifiedAt' in value) || !integer(value.verifiedAt)) throw new Error('invalid_feedback_response')
  return { version: value.version, url: value.url, sha: value.sha, publishedAt: value.publishedAt, verifiedAt: value.verifiedAt }
}

function relatedReports(value: unknown): RelatedFeedbackReport[] {
  if (!Array.isArray(value)) throw new Error('invalid_feedback_response')
  return value.map((report: unknown) => {
    if (!report || typeof report !== 'object' || !('submissionId' in report) || typeof report.submissionId !== 'string'
      || !('issueNumber' in report) || !integer(report.issueNumber) || !report.issueNumber) throw new Error('invalid_feedback_response')
    return { submissionId: report.submissionId, issueNumber: report.issueNumber }
  })
}

function historicalRelease(value: unknown): { version: string; url: string } {
  if (!value || typeof value !== 'object' || !('version' in value) || typeof value.version !== 'string' || !/^v\d+\.\d+\.\d+$/.test(value.version)
    || !('url' in value) || value.url !== `https://github.com/titanxxh/open-agricola/releases/tag/${value.version}`) throw new Error('invalid_feedback_response')
  return { version: value.version, url: value.url }
}

function message(value: unknown): InboxMessage {
  if (!value || typeof value !== 'object' || !('readAt' in value) || (value.readAt !== null && !integer(value.readAt))) throw new Error('invalid_feedback_response')
  if ('kind' in value && value.kind === 'fix_released') {
    const base = feedbackBase(value)
    if (!('version' in value) || value.version !== null || !('release' in value) || !value.release || typeof value.release !== 'object'
      || !('rootId' in value.release) || typeof value.release.rootId !== 'string'
      || !('firstVerified' in value.release) || !('reports' in value.release)) throw new Error('invalid_feedback_response')
    return { ...base, kind: 'fix_released', version: null, readAt: value.readAt,
      release: { rootId: value.release.rootId, firstVerified: productionRelease(value.release.firstVerified), reports: relatedReports(value.release.reports), ...('historicalFirstIncluded' in value.release ? { historicalFirstIncluded: historicalRelease(value.release.historicalFirstIncluded) } : {}) },
      ...('relatedReports' in value ? { relatedReports: relatedReports(value.relatedReports) } : {}),
      ...('currentProduction' in value ? { currentProduction: productionRelease(value.currentProduction) } : {}) }
  }
  return { ...feedback(value), readAt: value.readAt }
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
    version: report.version, feedback: report.feedback.map(feedback), ...('fix' in report ? { fix: fixAssociation(report.fix) } : {}) }
}

function fixAssociation(value: unknown): FixAssociation {
  if (!value || typeof value !== 'object'
    || !('rootId' in value) || typeof value.rootId !== 'string'
    || !('rootIssueNumber' in value) || !integer(value.rootIssueNumber) || !value.rootIssueNumber
    || !('version' in value) || !integer(value.version)
    || !('associationVersion' in value) || !integer(value.associationVersion)
    || !('status' in value) || (value.status !== 'unlinked' && value.status !== 'pending_release' && value.status !== 'released')
    || !('reports' in value) || !Array.isArray(value.reports)
    || !('pullRequests' in value) || !Array.isArray(value.pullRequests)
    || !('requiredCommits' in value) || !Array.isArray(value.requiredCommits) || !value.requiredCommits.every(isCommitSha)) {
    throw new Error('invalid_feedback_response')
  }
  const reports = value.reports.map((report: unknown) => {
    if (!report || typeof report !== 'object' || !('submissionId' in report) || typeof report.submissionId !== 'string'
      || !('issueNumber' in report) || !integer(report.issueNumber) || !report.issueNumber) throw new Error('invalid_feedback_response')
    return { submissionId: report.submissionId, issueNumber: report.issueNumber }
  })
  const pullRequests = value.pullRequests.map((pr: unknown): VerifiedFixPullRequest => {
    if (!pr || typeof pr !== 'object' || !('number' in pr) || !integer(pr.number) || !pr.number
      || !('url' in pr) || pr.url !== `https://github.com/titanxxh/open-agricola/pull/${pr.number}`
      || !('mergeCommit' in pr) || !isCommitSha(pr.mergeCommit)
      || !('requiredCommits' in pr) || !Array.isArray(pr.requiredCommits) || !pr.requiredCommits.every(isCommitSha)) throw new Error('invalid_feedback_response')
    return { number: pr.number, url: pr.url, mergeCommit: pr.mergeCommit, requiredCommits: pr.requiredCommits }
  })
  return { rootId: value.rootId, rootIssueNumber: value.rootIssueNumber, version: value.version, associationVersion: value.associationVersion,
    status: value.status, reports, pullRequests, requiredCommits: value.requiredCommits,
    ...('firstVerifiedRelease' in value ? { firstVerifiedRelease: productionRelease(value.firstVerifiedRelease) } : {}),
    ...('currentProductionRelease' in value ? { currentProductionRelease: productionRelease(value.currentProductionRelease) } : {}) }
}
