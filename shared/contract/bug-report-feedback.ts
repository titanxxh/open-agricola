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

export type VerifiedProductionRelease = { version: string; url: string; sha: string; publishedAt: number; verifiedAt: number }
export type RelatedFeedbackReport = { submissionId: string; issueNumber: number }
export type ReleaseFeedbackRecord = Omit<FeedbackRecord, 'kind' | 'version' | 'missingItems'> & {
  kind: 'fix_released'
  version: null
  release: { rootId: string; firstVerified: VerifiedProductionRelease; reports: RelatedFeedbackReport[] }
}
export type InboxMessage = (FeedbackRecord | ReleaseFeedbackRecord) & { readAt: number | null;
  relatedReports?: RelatedFeedbackReport[]; currentProduction?: VerifiedProductionRelease }
export type InboxPage = { messages: InboxMessage[]; unreadCount: number; nextCursor: number | null }
export type ReportFeedbackView = {
  submissionId: string
  issueNumber: number
  issueUrl: string
  version: number
  feedback: FeedbackRecord[]
  fix?: FixAssociation
}

export type FixPullRequestInput = { number: number; requiredCommits: string[] }
export type VerifiedFixPullRequest = FixPullRequestInput & { url: string; mergeCommit: string }
export type FixAssociation = {
  rootId: string
  rootIssueNumber: number
  version: number
  associationVersion: number
  status: 'pending_release' | 'unlinked' | 'released'
  firstVerifiedRelease?: VerifiedProductionRelease
  currentProductionRelease?: VerifiedProductionRelease
  reports: Array<{ submissionId: string; issueNumber: number }>
  pullRequests: VerifiedFixPullRequest[]
  requiredCommits: string[]
}
export type AssociateFixInput = {
  issueNumber: number
  requestId: string
  expectedVersion: number
  purpose: 'fix'
  pullRequests: FixPullRequestInput[]
}
export type AssociateDuplicateInput = {
  issueNumber: number
  rootIssueNumber: number
  requestId: string
  expectedVersion: number
}

const positive = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0
const version = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
const requestId = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9_-]{8,100}$/.test(value)
export const isCommitSha = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value)

export function parseAssociateFix(value: unknown): AssociateFixInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).some(key => !['issueNumber', 'requestId', 'expectedVersion', 'purpose', 'pullRequests'].includes(key))
    || !('issueNumber' in value) || !positive(value.issueNumber)
    || !('requestId' in value) || !requestId(value.requestId)
    || !('expectedVersion' in value) || !version(value.expectedVersion)
    || !('purpose' in value) || value.purpose !== 'fix'
    || !('pullRequests' in value) || !Array.isArray(value.pullRequests) || !value.pullRequests.length || value.pullRequests.length > 5) {
    throw new Error('invalid_fix_association')
  }
  const pullRequests = value.pullRequests.map((entry: unknown): FixPullRequestInput => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)
      || Object.keys(entry).some(key => !['number', 'requiredCommits'].includes(key))
      || !('number' in entry) || !positive(entry.number)
      || !('requiredCommits' in entry) || !Array.isArray(entry.requiredCommits)
      || !entry.requiredCommits.length || entry.requiredCommits.length > 20 || !entry.requiredCommits.every(isCommitSha)) {
      throw new Error('invalid_fix_association')
    }
    return { number: entry.number, requiredCommits: [...new Set(entry.requiredCommits)].sort() }
  }).sort((a, b) => a.number - b.number)
  if (new Set(pullRequests.map(pr => pr.number)).size !== pullRequests.length
    || pullRequests.flatMap(pr => pr.requiredCommits).length > 40) throw new Error('invalid_fix_association')
  return { issueNumber: value.issueNumber, requestId: value.requestId, expectedVersion: value.expectedVersion, purpose: 'fix', pullRequests }
}

export function parseAssociateDuplicate(value: unknown): AssociateDuplicateInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).some(key => !['issueNumber', 'rootIssueNumber', 'requestId', 'expectedVersion'].includes(key))
    || !('issueNumber' in value) || !positive(value.issueNumber)
    || !('rootIssueNumber' in value) || !positive(value.rootIssueNumber) || value.rootIssueNumber === value.issueNumber
    || !('requestId' in value) || !requestId(value.requestId)
    || !('expectedVersion' in value) || !version(value.expectedVersion)) throw new Error('invalid_fix_association')
  return { issueNumber: value.issueNumber, rootIssueNumber: value.rootIssueNumber,
    requestId: value.requestId, expectedVersion: value.expectedVersion }
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
