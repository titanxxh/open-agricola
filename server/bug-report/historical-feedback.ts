import { createHash, randomUUID } from 'node:crypto'
import type { FeedbackDetails, VerifiedFixPullRequest } from '../../shared/contract/bug-report-feedback'
import { parseFeedbackDetails } from '../../shared/contract/bug-report-feedback'
import type { PostgresDatabase } from '../database/postgres'
import { assertStorageReady } from '../db'
import type { BugReportFeedbackService, FeedbackWriteContext, FeedbackOperation } from './feedback-service'
import { FeedbackError } from './feedback-error'
import { fixEvidenceFingerprint, type GitHubFixVerifier } from './github-fix-verifier'

const repository = 'titanxxh/open-agricola'
const issueUrl = (issue: number) => `https://github.com/${repository}/issues/${issue}`
type HistoricalReport = FeedbackDetails & { issueNumber: number; reportSummary: string; fix?: { number: number; commit: string; firstIncluded: string } }
const reports: HistoricalReport[] = [
  { issueNumber: 1464, reportSummary: '游戏中途断连', kind: 'needs_info', explanation: '目前还不能确认断连原因。请在原 issue 补充以下信息，便于继续排查。', missingItems: ['断连发生的时点，以及此前的具体操作步骤。', '发生频次，是否每局或同一时点重复发生。', '是整个页面掉线、页面重载，还是只有连接中断；当时页面显示什么。', '是否自动重连、需要刷新，以及重连后能否继续。', '错误提示、控制台错误或截图。', '浏览器及版本、设备与操作系统。', '同局其他玩家是否同时断连。'] },
  { issueNumber: 1465, reportSummary: '无法主动丢弃已获得资源', kind: 'confirmed_bug', explanation: '已确认缺少主动丢弃资源的能力，影响夜班工人等需要丢弃资源的情况；对应修复已关联。', fix: { number: 1534, commit: 'a94787d1e61004fc863aaf3dbf2171bda834a716', firstIncluded: 'v0.11.8' } },
  { issueNumber: 1479, reportSummary: '缺少提前结束对局的选项', kind: 'confirmed_bug', explanation: '已确认缺少提前结束对局的操作；修复增加了全员同意后结束对局的能力。', fix: { number: 1484, commit: 'db196efe21951429230301454cee7eef35a8d249', firstIncluded: 'v0.11.7' } },
  { issueNumber: 1490, reportSummary: '对局中频繁自动刷新页面', kind: 'needs_info', explanation: '目前还不能确认自动刷新的原因。请在原 issue 补充以下信息；诊断改进 #1499 不是该问题的已确认修复。', missingItems: ['自动刷新的频次及两次之间的间隔。', '刷新发生时正在进行什么操作或处于什么阶段。', '是整个页面重新加载，还是只有游戏画面闪动或更新。', '刷新后对局进度及刚才的操作是否保留。', '错误提示、控制台错误或截图。', '浏览器及版本、设备与操作系统。'] },
  { issueNumber: 1504, reportSummary: '建围栏额外收取木材', kind: 'confirmed_bug', explanation: '已确认农场改建时建围栏会多收木材；修复更正了费用并移除了客户端附加费。', fix: { number: 1515, commit: 'd1570f66cd2dac96c0f66d008684cfff12f168f5', firstIncluded: 'v0.11.7' } },
  { issueNumber: 1564, reportSummary: '春季与篱笆护理员建围栏被拒绝', kind: 'not_bug', explanation: '本次拒绝符合规则。当时已有 13 段普通围栏，每人上限为 15 段，只剩 2 段，无法再建 5 段。篱笆护理员及春季只减免木材，不增加围栏件数或上限。错误 key 的显示属于可改进的界面说明。' },
  { issueNumber: 1574, reportSummary: '单人局成人消耗三个食物', kind: 'not_bug', explanation: '本局是单人局。单人规则中，每位成人在收获喂养阶段需要 3 食物，新生儿仍为 1；多人局成人才是 2 食物。这是预期规则。' },
  { issueNumber: 1586, reportSummary: '非传递双小发展牌出现传递箭头', kind: 'confirmed_bug', explanation: '已确认非传递的双小发展牌错误显示了传递箭头；对应渲染修复已关联。', fix: { number: 1592, commit: 'f9edb37342f4f9deeb2ccd344d5c0b9ab9a3cebf', firstIncluded: 'v0.12.6' } },
  { issueNumber: 1591, reportSummary: '地块 M066 的文字与计分', kind: 'not_bug', explanation: '地块 Land Parcel 的未使用农场格为 1、2、3 个及以上时，额外奖励分分别为 +2、-1、-3；此项与空格本身每格 -1 分分开计算，与卡面和计分问答一致。' },
  { issueNumber: 1595, reportSummary: '最后一张牌仍需确认选择', kind: 'not_bug', explanation: '' },
  { issueNumber: 1622, reportSummary: '普通收获繁殖阶段无法将动物转为食物', kind: 'not_bug', explanation: '按规则，普通收获的繁殖阶段不能将牲畜，包括新生动物，转换为食物。本局繁殖后多出的一只羊无法安置，因此被放走，这是预期行为。' },
  { issueNumber: 1637, reportSummary: '拓荒者奖励后的家庭增长无法执行', kind: 'not_bug', explanation: '拓荒者允许先结算奖励，再检查后续必选行动，以兼容奖励触发其他卡牌后满足家庭增长条件的情况。本局没有这样的后续卡牌效果，且没有空房，家庭增长无法执行，因此需要撤销此次行动。' },
]
export const historicalIssueNumbers: readonly number[] = reports.map(report => report.issueNumber)
type Import = { issueNumber: number; submissionId: string; reporterSiteId: string; roomId: string; bodySha256: string; auditReference: string }
type Input = { explanation1595?: string; imports: Import[] }
export type HistoricalIssueReader = (issue: number) => Promise<unknown>
export async function readHistoricalIssue(issue: number): Promise<unknown> {
  const response = await fetch(`https://api.github.com/repos/${repository}/issues/${issue}`, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'open-agricola-feedback' }, redirect: 'error', signal: AbortSignal.timeout(15000),
  })
  if (!response.ok || Number(response.headers.get('content-length')) > 2_000_000) throw new Error('issue_evidence_unavailable')
  const body = await response.text()
  if (body.length > 2_000_000) throw new Error('issue_evidence_unavailable')
  return JSON.parse(body)
}
function parseInput(value: unknown): Input {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !['explanation1595', 'imports'].includes(key))) throw new FeedbackError('invalid_historical_feedback', 400)
  let explanation1595: string | undefined
  if ('explanation1595' in value) {
    const details = parseFeedbackDetails({ kind: 'not_bug', explanation: value.explanation1595 })
    if (/^(体验建议|改进建议|improvementsuggestion|experiencesuggestion|suggestion)$/u.test(details.explanation.toLowerCase().replace(/[\s\p{P}]/gu, ''))) throw new FeedbackError('invalid_historical_feedback', 400)
    explanation1595 = details.explanation
  }
  const entries = 'imports' in value ? value.imports : []
  if (!Array.isArray(entries) || entries.length > 12) throw new FeedbackError('invalid_historical_feedback', 400)
  const imports = entries.map((entry: unknown): Import => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry) || Object.keys(entry).some(key => !['issueNumber','submissionId','reporterSiteId','roomId','bodySha256','auditReference'].includes(key))
      || !('issueNumber' in entry) || typeof entry.issueNumber !== 'number' || !historicalIssueNumbers.includes(entry.issueNumber)
      || !('submissionId' in entry) || typeof entry.submissionId !== 'string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(entry.submissionId)
      || !('reporterSiteId' in entry) || typeof entry.reporterSiteId !== 'string' || !entry.reporterSiteId.trim() || entry.reporterSiteId.length > 200
      || !('roomId' in entry) || typeof entry.roomId !== 'string' || !/^[a-zA-Z0-9-]{1,128}$/.test(entry.roomId)
      || !('bodySha256' in entry) || typeof entry.bodySha256 !== 'string' || !/^[a-f0-9]{64}$/.test(entry.bodySha256)
      || !('auditReference' in entry) || typeof entry.auditReference !== 'string' || !entry.auditReference.trim() || entry.auditReference.length > 200) throw new FeedbackError('invalid_historical_feedback', 400)
    return { issueNumber: entry.issueNumber, submissionId: entry.submissionId, reporterSiteId: entry.reporterSiteId, roomId: entry.roomId, bodySha256: entry.bodySha256, auditReference: entry.auditReference }
  })
  if (new Set(imports.map(entry => entry.issueNumber)).size !== imports.length || new Set(imports.map(entry => entry.submissionId)).size !== imports.length) throw new FeedbackError('invalid_historical_feedback', 400)
  return { explanation1595, imports }
}
type Subject = { submission_id: string; reporter_user_id: string | null; github_issue_number: number; source: 'native' | 'historical'; recipient_version: number }
export type HistoricalPreviewRow = { issueNumber: number; issueUrl: string; reportSummary: string; details: FeedbackDetails;
  mapping?: { submissionId: string; recipientId: string; source: 'native' | 'historical' | 'import' };
  skipReason?: string; triage: 'send' | 'already_assessed' | 'skip'; triageText: string;
  fix?: { pullRequests: VerifiedFixPullRequest[]; historicalFirstIncluded: { version: string; url: string }; status: 'send' | 'already_sent' | 'awaiting_verification' | 'conflict';
    firstVerified?: { version: string; url: string; verifiedAt: number }; currentProduction?: { version: string; url: string; verifiedAt: number }; text: string; reason?: string } }
export type HistoricalPreview = { projectedMessages: number; rows: HistoricalPreviewRow[] }

export class HistoricalFeedback {
  private readonly db: PostgresDatabase
  private readonly service: BugReportFeedbackService
  private readonly verifier: GitHubFixVerifier
  private readonly readIssue: HistoricalIssueReader
  constructor(db: PostgresDatabase, service: BugReportFeedbackService, verifier: GitHubFixVerifier, readIssue: HistoricalIssueReader) {
    this.db = db; this.service = service; this.verifier = verifier; this.readIssue = readIssue
  }

  async preview(value: unknown): Promise<HistoricalPreview> {
    const input = parseInput(value)
    return this.db.transaction(async () => {
      await this.db.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
      await assertStorageReady(this.db)
      const rows: HistoricalPreviewRow[] = []
      for (const report of reports) {
        const details: FeedbackDetails = report.issueNumber === 1595 ? { kind: 'not_bug', explanation: input.explanation1595 ?? '' } : parseFeedbackDetails(report)
        const row: HistoricalPreviewRow = { issueNumber: report.issueNumber, issueUrl: issueUrl(report.issueNumber), reportSummary: report.reportSummary,
          details, triage: 'skip', triageText: `${report.reportSummary}\n${details.kind}\n${details.explanation}${details.kind === 'needs_info' ? '\n' + details.missingItems.join('\n') : ''}\n${issueUrl(report.issueNumber)}` }
        rows.push(row)
        try {
          if (!details.explanation) throw new Error('missing_explanation')
          row.mapping = await this.resolveMapping(report.issueNumber, input)
          const view = row.mapping.source === 'import' ? undefined : await this.service.getReport(report.issueNumber)
          const latest = view?.feedback.at(-1)
          if (latest && latest.kind !== details.kind) throw new Error('assessment_conflict')
          row.triage = latest ? 'already_assessed' : 'send'
          if (!report.fix) continue
          const historicalFirstIncluded = { version: report.fix.firstIncluded, url: `https://github.com/${repository}/releases/tag/${report.fix.firstIncluded}` }
          const desired = [{ number: report.fix.number, requiredCommits: [report.fix.commit] }]
          const pullRequests = await this.verifier.verify(desired)
          const plan = await this.service.previewFixDeployment(pullRequests)
          const convert = (deployment: typeof plan.firstVerified | undefined) => deployment ? { version: deployment.proof.release.version, url: deployment.proof.release.url, verifiedAt: deployment.proof.observedAt } : undefined
          const firstVerified = convert(plan.firstVerified), currentProduction = convert(plan.currentProduction)
          const exists = await this.db.prepare("SELECT 1 FROM bug_report_feedback WHERE recipient_user_id=? AND root_id=? AND kind='fix_released'").get(row.mapping.recipientId, view?.fix?.rootId ?? row.mapping.submissionId)
          const conflict = view?.fix && (view.fix.rootIssueNumber !== report.issueNumber || (view.fix.pullRequests.length && fixEvidenceFingerprint(view.fix.pullRequests) !== fixEvidenceFingerprint(pullRequests)))
          row.fix = { pullRequests, historicalFirstIncluded, status: conflict ? 'conflict' : exists ? 'already_sent' : plan.currentProduction ? 'send' : 'awaiting_verification',
            firstVerified, currentProduction, reason: conflict ? 'fix_evidence_conflict' : !plan.currentProduction ? 'no_verified_containing_production' : undefined,
            text: `${report.reportSummary}\n修复已上线\n历史首次包含修复的版本：${historicalFirstIncluded.version}\n${historicalFirstIncluded.url}\n${firstVerified ? `首次核验上线版本：${firstVerified.version}\n${firstVerified.url}\n核验时间：${new Date(firstVerified.verifiedAt).toISOString()}` : '等待正式生产核验'}${currentProduction ? `\n核验时生产版本：${currentProduction.version}\n${currentProduction.url}` : ''}\n${issueUrl(report.issueNumber)}` }
        } catch (error) {
          row.skipReason = error instanceof Error ? error.message : 'historical_preview_failed'
          row.triage = 'skip'
        }
      }
      return { rows, projectedMessages: rows.reduce((sum, row) => sum + (row.triage === 'send' ? 1 : 0) + (!row.skipReason && row.fix?.status === 'send' ? 1 : 0), 0) }
    })()
  }

  private async resolveMapping(issueNumber: number, input: Input): Promise<NonNullable<HistoricalPreviewRow['mapping']>> {
    const matches = await this.db.prepare('SELECT * FROM bug_report_feedback_subjects WHERE github_issue_number=?').all<Subject>(issueNumber)
    if (matches.length > 1) throw new Error('mapping_conflict')
    const existing = matches[0]
    let recipient = existing?.reporter_user_id
    let imported: Import | undefined
    if (!existing) {
      imported = input.imports.find(entry => entry.issueNumber === issueNumber)
      if (!imported) throw new Error('missing_mapping')
      if (await this.db.prepare('SELECT 1 FROM bug_report_feedback_subjects WHERE submission_id=?').get(imported.submissionId)
        || await this.db.prepare('SELECT 1 FROM bug_reports WHERE submission_id=? OR github_issue_number=?').get(imported.submissionId, issueNumber)) throw new Error('mapping_conflict')
      const evidence = await this.readIssue(issueNumber)
      if (!evidence || typeof evidence !== 'object' || !('number' in evidence) || evidence.number !== issueNumber
        || !('html_url' in evidence) || evidence.html_url !== issueUrl(issueNumber) || 'pull_request' in evidence
        || !('body' in evidence) || typeof evidence.body !== 'string') throw new Error('issue_evidence_conflict')
      const body = evidence.body
      const markers = [...body.matchAll(/<!-- open-agricola-report:([^>\s]+) -->/g)]
      const field = (name: string) => [...body.matchAll(new RegExp('^- ' + name + ': `([^`]+)`$', 'gm'))]
      if (markers.length !== 1 || markers[0][1] !== imported.submissionId || field('Reporter site ID').length !== 1 || field('Reporter site ID')[0][1] !== imported.reporterSiteId
        || field('Room ID').length !== 1 || field('Room ID')[0][1] !== imported.roomId
        || createHash('sha256').update(body).digest('hex') !== imported.bodySha256) throw new Error('issue_evidence_conflict')
      if (!await this.db.prepare('SELECT 1 FROM game_contexts WHERE room_id=?').get(imported.roomId)) throw new Error('missing_game_context')
      recipient = imported.reporterSiteId
    }
    if (!recipient || !await this.db.prepare('SELECT 1 FROM users WHERE id=?').get(recipient)
      || await this.db.prepare('SELECT 1 FROM account_deletion_requests WHERE user_id=?').get(recipient)) throw new Error('reporter_unavailable')
    if (existing) return { submissionId: existing.submission_id, recipientId: recipient, source: existing.source }
    if (!imported) throw new Error('missing_mapping')
    return { submissionId: imported.submissionId, recipientId: recipient, source: 'import' }
  }

  private async prepareSubject(actorId: string, row: HistoricalPreviewRow, input: Input, scope: readonly number[]): Promise<FeedbackWriteContext> {
    const mapping = row.mapping
    if (!mapping) throw new FeedbackError('feedback_mapping_conflict', 409)
    return this.db.transaction(async () => {
      await this.db.query('SELECT pg_advisory_xact_lock(1673001)')
      await this.db.prepare('SELECT id FROM users WHERE id=? FOR UPDATE').get(mapping.recipientId)
      if (!await this.db.prepare('SELECT 1 FROM users WHERE id=?').get(mapping.recipientId)
        || await this.db.prepare('SELECT 1 FROM account_deletion_requests WHERE user_id=?').get(mapping.recipientId)) throw new FeedbackError('reporter_unavailable', 410)
      const matches = await this.db.prepare('SELECT * FROM bug_report_feedback_subjects WHERE submission_id=? OR github_issue_number=? FOR UPDATE').all<Subject>(mapping.submissionId, row.issueNumber)
      if (matches.length > 1 || matches.some(subject => subject.submission_id !== mapping.submissionId || subject.github_issue_number !== row.issueNumber || subject.reporter_user_id !== mapping.recipientId)) throw new FeedbackError('feedback_mapping_conflict', 409)
      if (!matches.length) {
        const imported = input.imports.find(entry => entry.issueNumber === row.issueNumber)
        if (!imported || mapping.source !== 'import' || !await this.db.prepare('SELECT 1 FROM game_contexts WHERE room_id=?').get(imported.roomId)
          || await this.db.prepare('SELECT 1 FROM bug_reports WHERE submission_id=? OR github_issue_number=?').get(mapping.submissionId, row.issueNumber)) throw new FeedbackError('feedback_mapping_conflict', 409)
        await this.db.prepare(`INSERT INTO bug_report_feedback_subjects(submission_id,source,reporter_user_id,github_issue_number,import_actor_user_id,import_audit)
          VALUES(?,'historical',?,?,?,?::jsonb)`).run(mapping.submissionId, mapping.recipientId, row.issueNumber, actorId, JSON.stringify({ reference: imported.auditReference, bodySha256: imported.bodySha256 }))
      }
      if (row.fix && row.fix.status !== 'conflict') await this.db.prepare('UPDATE bug_report_feedback_subjects SET historical_first_included=?::jsonb WHERE submission_id=?')
        .run(JSON.stringify({ ...row.fix.historicalFirstIncluded, pullRequests: row.fix.pullRequests }), mapping.submissionId)
      return { issueNumbers: scope, submissionId: mapping.submissionId, recipientId: mapping.recipientId, recipientVersion: matches[0]?.recipient_version ?? 0 }
    })()
  }

  async execute(actorId: string, value: unknown) {
    const input = parseInput(value), preview = await this.preview(value)
    const errors: Array<{ issueNumber: number; reason: string }> = []
    const contexts = new Map<number, FeedbackWriteContext>()
    const operations: FeedbackOperation[] = []
    let insertedTriages = 0
    for (const row of preview.rows) {
      if (row.skipReason || row.fix?.status === 'conflict') continue
      try {
        // Historical source intents are durable but cannot send until the final audited fix is fenced.
        const context = await this.prepareSubject(actorId, row, input, [])
        contexts.set(row.issueNumber, context)
        if (row.triage === 'send') {
          const feedback = await this.service.recordFeedback(actorId, { issueNumber: row.issueNumber, reportSummary: row.reportSummary,
            ...row.details, expectedVersion: 0, requestId: `backfill1675_triage_${row.issueNumber}` }, context)
          if (feedback.inserted) insertedTriages++
        }
      } catch (error) { contexts.delete(row.issueNumber); errors.push({ issueNumber: row.issueNumber, reason: error instanceof FeedbackError ? error.code : 'historical_write_failed' }) }
    }
    for (const row of preview.rows) {
      const context = contexts.get(row.issueNumber)
      if (!context || !row.fix || row.fix.status === 'conflict') continue
      try {
        let view = await this.service.getReport(row.issueNumber)
        if (view.submissionId !== context.submissionId || view.feedback.at(-1)?.kind !== 'confirmed_bug') throw new FeedbackError('assessment_conflict', 409)
        if (view.fix?.pullRequests.length && (view.fix.rootIssueNumber !== row.issueNumber || fixEvidenceFingerprint(view.fix.pullRequests) !== fixEvidenceFingerprint(row.fix.pullRequests))) throw new FeedbackError('fix_evidence_conflict', 409)
        if (!view.fix?.pullRequests.length) view = await this.service.associateFix(actorId, { issueNumber: row.issueNumber, expectedVersion: view.fix?.version ?? 0,
          requestId: `backfill1675_fix_${row.issueNumber}`, purpose: 'fix', pullRequests: row.fix.pullRequests.map(pr => ({ number: pr.number, requiredCommits: pr.requiredCommits })) }, context)
        if (!view.fix || view.fix.rootIssueNumber !== row.issueNumber || fixEvidenceFingerprint(view.fix.pullRequests) !== fixEvidenceFingerprint(row.fix.pullRequests)) throw new FeedbackError('fix_evidence_conflict', 409)
        const operation = await this.service.reconcileVerifiedFixes(`backfill1675_${randomUUID()}`, [row.issueNumber], [{ issueNumber: row.issueNumber,
          submissionId: context.submissionId, recipientVersion: context.recipientVersion, rootId: view.fix.rootId, fixVersion: view.fix.version }])
        operations.push(operation)
        if (operation.result?.pendingFixes.some(fix => fix.reason === 'historical_subject_changed')) errors.push({ issueNumber: row.issueNumber, reason: 'historical_subject_changed' })
      } catch (error) { errors.push({ issueNumber: row.issueNumber, reason: error instanceof FeedbackError ? error.code : 'historical_fix_failed' }) }
    }
    const releasedMessages = operations.reduce((sum, operation) => sum + (operation.result?.sentMessages ?? 0), 0)
    return { preview, newMessages: insertedTriages + releasedMessages, insertedTriages, releasedMessages, errors,
      reconciliation: { status: operations.some(operation => operation.status === 'pending') ? 'pending' : 'completed', operations } }
  }
}
