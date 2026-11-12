import { createHash, generateKeyPairSync } from 'node:crypto'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import * as database from '../db'
import { requestAccountDeletion, claimPendingAccountDeletion, finishAccountDeletion } from '../auth'
import { createTestDatabase } from './_helpers/postgres'
import type { PostgresDatabase } from '../database/postgres'
import { BugReportFeedbackService } from '../bug-report/feedback-service'
import { BugReportStore, BugReportDelivery, TokenCipher } from '../bug-report/bug-report-store'
import { GitHubIssueClient } from '../bug-report/github-issue-client'

const marker = '11111111-1111-4111-8111-111111111111'
const repository = 'titanxxh/open-agricola'
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
let db: PostgresDatabase
let store: BugReportStore
beforeEach(async () => {
  db = await createTestDatabase()
  vi.spyOn(database, 'getDb').mockReturnValue(db)
  for (const id of ['reporter','admin']) await db.prepare("INSERT INTO users(id,username,display_name,password_hash,created_at) VALUES(?,?,?,'',1)").run(id,id,id)
  await db.prepare("INSERT INTO game_contexts(room_id,lifecycle,created_at,updated_at) VALUES('historical-room','expired',1,1)").run()
  store = new BugReportStore(db, new TokenCipher('test', new Map([['test', Buffer.alloc(32,7)]])))
})
afterEach(async () => { vi.restoreAllMocks(); await db?.close() })

it.each([false,true])('anonymizes imported public identity before finishing deletion, with native reports=%s', async native => {
  const body = `- Reporter site ID: \`reporter\`\n- Room ID: \`historical-room\`\n\n<!-- open-agricola-report:${marker} -->`
  const publicIssues = new Map([[1464,{ number:1464,html_url:`https://github.com/${repository}/issues/1464`,title:'Game bug',body }]])
  const feedback = new BugReportFeedbackService(db, Date.now, undefined, async () => publicIssues.get(1464))
  await feedback.executeHistoricalFeedback('admin', { imports: [{ issueNumber:1464,submissionId:marker,reporterSiteId:'reporter',roomId:'historical-room',bodySha256:createHash('sha256').update(body).digest('hex'),auditReference:'synthetic-reviewed-audit' }] })
  if (native) {
    await db.prepare(`INSERT INTO bug_reports(submission_id,reporter_user_id,room_id,player_index,lifecycle,room_version,step_no,frame_hash,status,github_issue_number,created_at,updated_at)
      VALUES('native-report','reporter','historical-room',0,'active',1,0,?,'submitted',1465,1,1)`).run('a'.repeat(64))
    publicIssues.set(1465,{ number:1465,html_url:`https://github.com/${repository}/issues/1465`,title:'Native game bug',body:'- Reporter site ID: `reporter`\n\n<!-- open-agricola-report:native-report -->' })
  }
  await requestAccountDeletion('reporter')
  const claim = await claimPendingAccountDeletion('reporter')
  if (!claim) throw new Error('Missing deletion claim')
  let failPatch = true
  const external: typeof fetch = async (resource, init) => {
    const url = new URL(String(resource))
    expect(url.origin).toBe('https://api.github.com')
    if (url.pathname === '/app/installations/2/access_tokens') return Response.json({ token:'synthetic-installation',expires_at:new Date(Date.now()+3600000).toISOString() })
    const match = new RegExp(`^/repos/${repository}/issues/(1464|1465)$`).exec(url.pathname)
    if (!match) throw new Error(`Unexpected GitHub operation ${url.pathname}`)
    const number = Number(match[1]), issue = publicIssues.get(number)
    if (!issue) throw new Error('Missing public issue')
    if (init?.method === 'PATCH') {
      if (failPatch) return Response.json({}, { status:503 })
      const patch = JSON.parse(String(init.body))
      publicIssues.set(number,{ ...issue,title:patch.title,body:patch.body })
    }
    return Response.json(publicIssues.get(number))
  }
  const github = new GitHubIssueClient({ appId:'1',clientId:'test',clientSecret:'test',privateKey:privateKey.export({ type:'pkcs1',format:'pem' }).toString(),installationId:'2',repositoryId:'3',fetchImpl:external })
  const delivery = new BugReportDelivery(store,github,'https://example.test')
  await expect(delivery.deleteReporter('reporter')).rejects.toMatchObject({ code:expect.any(String) })
  expect(await db.prepare('SELECT reporter_user_id FROM bug_report_feedback_subjects WHERE submission_id=?').get(marker)).toEqual({ reporter_user_id:'reporter' })
  expect(publicIssues.get(1464)?.body).toContain('`reporter`')
  failPatch = false
  await delivery.deleteReporter('reporter')
  for (const issue of publicIssues.values()) expect(issue.body).not.toContain('`reporter`')
  expect(publicIssues.get(1464)?.body).toContain(`<!-- open-agricola-report:${marker} -->`)
  expect(await store.reportForEvidence(marker)).toBeNull()
  expect(await db.prepare('SELECT reporter_user_id FROM bug_report_feedback_subjects WHERE submission_id=?').get(marker)).toEqual({ reporter_user_id:null })
  expect(await finishAccountDeletion(claim)).toBe(true)
  expect(await db.prepare("SELECT 1 FROM users WHERE id='reporter'").get()).toBeUndefined()
  expect((await feedback.listInbox('reporter')).messages).toEqual([])
})

it('keeps deletion pending if a historical issue mapping changes during external anonymization', async () => {
  await db.prepare(`INSERT INTO bug_report_feedback_subjects(submission_id,source,reporter_user_id,github_issue_number,import_audit)
    VALUES(?,'historical','reporter',1464,'{}')`).run(marker)
  await requestAccountDeletion('reporter')
  let issue = { number:1464,html_url:`https://github.com/${repository}/issues/1464`,title:'Game bug',body:`- Reporter site ID: \`reporter\`\n\n<!-- open-agricola-report:${marker} -->` }
  let changeMapping = true
  const external: typeof fetch = async (resource,init) => {
    const path = new URL(String(resource)).pathname
    if (path === '/app/installations/2/access_tokens') return Response.json({ token:'fixture',expires_at:new Date(Date.now()+3600000).toISOString() })
    expect(path).toBe(`/repos/${repository}/issues/1464`)
    if (init?.method === 'PATCH') {
      issue = { ...issue,...JSON.parse(String(init.body)) }
      if (changeMapping) await db.prepare('UPDATE bug_report_feedback_subjects SET github_issue_number=1490 WHERE submission_id=?').run(marker)
    }
    return Response.json(issue)
  }
  const github = new GitHubIssueClient({ appId:'1',clientId:'test',clientSecret:'test',privateKey:privateKey.export({ type:'pkcs1',format:'pem' }).toString(),installationId:'2',repositoryId:'3',fetchImpl:external })
  const delivery = new BugReportDelivery(store,github,'https://example.test')
  await expect(delivery.deleteReporter('reporter')).rejects.toMatchObject({ code:'bug_report_deletion_mapping_conflict' })
  expect(await db.prepare('SELECT reporter_user_id FROM bug_report_feedback_subjects WHERE submission_id=?').get(marker)).toEqual({ reporter_user_id:'reporter' })
  expect(await db.prepare("SELECT 1 FROM account_deletion_requests WHERE user_id='reporter'").get()).toBeDefined()
  changeMapping = false
  await db.prepare('UPDATE bug_report_feedback_subjects SET github_issue_number=1464 WHERE submission_id=?').run(marker)
  await delivery.deleteReporter('reporter')
  expect(await db.prepare('SELECT reporter_user_id FROM bug_report_feedback_subjects WHERE submission_id=?').get(marker)).toEqual({ reporter_user_id:null })
  expect(await store.reportForEvidence(marker)).toBeNull()
})
it('honors a trusted deleted-issue tombstone without reviving its historical external obligation', async () => {
  await db.prepare(`INSERT INTO bug_report_feedback_subjects(submission_id,source,reporter_user_id,github_issue_number,import_audit)
    VALUES(?,'historical','reporter',1464,'{}')`).run(marker)
  await store.setIssueState(1464,'deleted')
  await store.setIssueState(1464,'closed')
  expect((await store.reporterDeletionPlan('reporter')).historicalIssues).toEqual([])
  const external: typeof fetch = async () => { throw new Error('Deleted public issue must not be fetched') }
  const github = new GitHubIssueClient({ appId:'1',clientId:'test',clientSecret:'test',privateKey:privateKey.export({ type:'pkcs1',format:'pem' }).toString(),installationId:'2',repositoryId:'3',fetchImpl:external })
  await requestAccountDeletion('reporter')
  await new BugReportDelivery(store,github,'https://example.test').deleteReporter('reporter')
  expect(await db.prepare('SELECT reporter_user_id,github_issue_state FROM bug_report_feedback_subjects WHERE submission_id=?').get(marker)).toEqual({ reporter_user_id:null,github_issue_state:'deleted' })
})
