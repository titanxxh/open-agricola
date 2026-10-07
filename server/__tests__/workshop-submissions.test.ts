import { readFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { generateKeyPairSync } from 'node:crypto'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestDatabase } from './_helpers/postgres'
import { SubmissionGitHub } from './_helpers/submission-github'

const db = await createTestDatabase()
vi.mock('../db', () => ({ getDb: () => db }))
import { createCard, checkpointDraft, pinCurrentDraftVersion, markSandboxPass, loadWorkspace, type WorkshopDraft } from '../workshop-drafts'
import { handleSubmitReviewRequest } from '../workshop-pr/propose-handler'
import { GitHubReviewProvider } from '../workshop-review/github-review-provider'
import { SubmissionStore } from '../workshop-pr/submission-store'
import { recoverPendingSubmissions } from '../workshop-pr/submission-service'
import { WorkshopGitHubApp } from '../workshop-pr/github-app'
import { workshopPrConfig } from '../workshop-pr/config'

const nativeFetch = globalThis.fetch
let server: Server
let address: string
let github: SubmissionGitHub
const privateKey = generateKeyPairSync('rsa', { modulusLength: 1024 }).privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()

beforeAll(async () => {
  await db.exec("INSERT INTO users(id, username, display_name, password_hash, created_at) VALUES ('author', 'author', 'Designer', 'x', 1)")
  await db.prepare('INSERT INTO sessions(token,user_id,created_at,expires_at) VALUES (?,?,?,?)').run('test-session','author',1,Date.now()+3600_000)
  const provider = new GitHubReviewProvider({ appId: '1', installationId: '2', privateKey, repositoryOwner: 'titanxxh', repositoryName: 'open-agricola', fetchImpl: (...args) => github.fetch(...args) })
  server = createServer((req, res) => {
    void handleSubmitReviewRequest(req, res, req.url!.slice(1), provider).catch(error => { res.writeHead(500); res.end(String(error)) })
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const bound = server.address()
  if (!bound || typeof bound === 'string') throw new Error('test server not listening')
  address = `http://127.0.0.1:${bound.port}`
})
beforeEach(async () => {
  await db.exec('DELETE FROM github_propose_audit; DELETE FROM workshop_cards; DELETE FROM request_rate_limits')
  github = new SubmissionGitHub()
  workshopPrConfig.enabled = true
  vi.stubEnv('WORKSHOP_REVIEW_GITHUB_APP_ID','1')
  vi.stubEnv('WORKSHOP_REVIEW_GITHUB_INSTALLATION_ID','2')
  vi.stubEnv('WORKSHOP_REVIEW_GITHUB_PRIVATE_KEY',privateKey)
  vi.stubGlobal('fetch', (...args: Parameters<typeof fetch>) => github.fetch(...args))
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs() })
afterAll(async () => { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); await db.close() })

async function readyCard() {
  const meta = { id: 'CUSTOM_TestCard', name: 'Test Card', deck: 'CUSTOM', number: 0, desc: ['A test card'], cost: {}, vp: 0 }
  const draft: WorkshopDraft = {
    cardId: meta.id, cardType: 'minor', name: meta.name, description: 'A test card',
    cardJson: { ...meta, card_type: 'minor', implemented: true, locales: { zh: { name: '测试卡', desc: ['测试说明'] } } },
    effectCode: `const CARD_DEF = ${JSON.stringify({cardType: 'minor', meta})}; const CARD_IMPL = {}`,
    compiledCode: '"use strict";', codeManifest: { effectHooks: [], listeners: [], cardDefinition: { cardType: 'minor', meta } },
    artUrl: null, generation: { secretPrompt: 'never publish me' },
  }
  const card = await createCard(db,{authorId:'author',draft})
  const {versionId} = await pinCurrentDraftVersion(db,{cardId:card.id,authorId:'author',baseRevision:card.revision})
  await markSandboxPass(db,{cardId:card.id,authorId:'author',versionId,authorConfirmed:true,runtimeErrors:[]})
  return card
}

async function submit(id: string, action = 'submit') {
  return (await nativeFetch(`${address}/${id}`, {
    method: 'POST', headers: { Authorization: 'Bearer test-session', 'Content-Type': 'application/json' }, body: JSON.stringify({action}),
  })).json()
}
async function edit(id: string) {
  const workspace = await loadWorkspace(db,id,'author')
  const next = await checkpointDraft(db,{cardId:id,authorId:'author',baseRevision:workspace.revision,draft:{...workspace.draft,description:'Revised description',cardJson:{...workspace.draft.cardJson,locales:{zh:{name:'测试卡',desc:['修改后的说明']}}}}})
  const {versionId} = await pinCurrentDraftVersion(db,{cardId:id,authorId:'author',baseRevision:next.revision})
  await markSandboxPass(db,{cardId:id,authorId:'author',versionId,authorConfirmed:true,runtimeErrors:[]})
  await db.exec('DELETE FROM request_rate_limits')
}

describe('Workshop submissions over HTTP', () => {
  it('does not allocate a submission when recovery has no saved operation', async () => {
    const card = await readyCard()
    expect(await submit(card.id,'recover')).toMatchObject({ok:false,code:'no_submission'})
    expect(await new SubmissionStore(db).latest(card.id)).toBeUndefined()
    expect(github.prs).toHaveLength(0)
  })

  it('regenerates shared indexes from the latest main when updating a proposal', async () => {
    const card = await readyCard()
    await submit(card.id)
    const sha = 'b'.repeat(40)
    const files = {...github.commits.get(github.refs.get('main')!)!}
    files['docs/community_cards.md'] = 'New upstream context\n' + files['docs/community_cards.md']
    github.commits.set(sha,files)
    github.refs.set('main',sha)
    await edit(card.id)
    expect(await submit(card.id)).toMatchObject({ok:true,prNumber:1})
    expect(github.commits.get(github.refs.get(github.prs[0]!.branch)!)!['docs/community_cards.md']).toContain('New upstream context')
  })

  it('pauses legacy migration when a reviewer changed a shared generated index', async () => {
    const card = await readyCard()
    await submit(card.id)
    const head = github.changeHead({'docs/community_cards.md':'Maintainer changes\n'})
    await db.exec('DELETE FROM workshop_submissions; DELETE FROM request_rate_limits')
    expect(await submit(card.id,'restart')).toMatchObject({ok:false,code:'generated_file_changed'})
    expect(github.refs.get(github.prs[0]!.branch)).toBe(head)
    expect(github.prs).toHaveLength(1)
  })

  it('creates an App PR and binds the submitted version without a user OAuth handshake', async () => {
    const card = await readyCard()
    const response = await nativeFetch(`${address}/${card.id}`, { method: 'POST', headers: { Authorization: 'Bearer test-session', 'Content-Type':'application/json' }, body:'{}' })
    const result = await response.json()
    expect(result).toMatchObject({ok:true,prNumber:1,prUrl:'https://github.com/titanxxh/open-agricola/pull/1'})
    const workspace = await loadWorkspace(db,card.id,'author')
    expect(workspace.reviewStatus).toBe('in_review')
    expect(github.prs).toHaveLength(1)
    expect(github.prs[0]!.body).toContain('Designer')
    expect(github.prs[0]!.body).not.toContain('never publish me')
  })

  it('recovers the same PR when GitHub created it but the response was lost', async () => {
    const card = await readyCard()
    github.loseCreateResponse = true
    const submit = async () => (await nativeFetch(`${address}/${card.id}`, {
      method: 'POST', headers: { Authorization: 'Bearer test-session', 'Content-Type': 'application/json' }, body: '{}',
    })).json()
    expect(await submit()).toMatchObject({ok:false,state:'pending'})
    expect(github.prs).toHaveLength(1)
    await db.exec('UPDATE workshop_submissions SET retry_at = 0')
    expect(await submit()).toMatchObject({ok:true,prNumber:1})
    expect(github.prs).toHaveLength(1)
    expect((await loadWorkspace(db,card.id,'author')).reviewStatus).toBe('in_review')
  })
  it('updates the same PR and preserves an independent reviewer test', async () => {
    const card = await readyCard()
    expect(await submit(card.id)).toMatchObject({ok:true,prNumber:1})
    github.changeHead({'server/__tests__/community-card.test.ts': 'reviewer test\n'})
    await edit(card.id)
    expect(await submit(card.id)).toMatchObject({ok:true,prNumber:1})
    expect(github.prs).toHaveLength(1)
    const files = github.commits.get(github.refs.get(github.prs[0]!.branch)!)!
    expect(files['server/__tests__/community-card.test.ts']).toBe('reviewer test\n')
    expect(files['docs/community_cards.md']).toContain('#1')
  })

  it('pauses on any reviewer edit to generated card source', async () => {
    const card = await readyCard()
    await submit(card.id)
    const head = github.changeHead({'shared/cards/community/CUSTOM_TestCard.ts': '// reviewer ability edit\n'})
    await edit(card.id)
    expect(await submit(card.id)).toMatchObject({ok:false,code:'generated_file_changed'})
    expect(github.refs.get(github.prs[0]!.branch)).toBe(head)
    expect(github.prs).toHaveLength(1)
  })

  it.each(['draft','base','closed'])('respects a maintainer %s action', async action => {
    const card = await readyCard()
    await submit(card.id)
    const pr = github.prs[0]!
    if (action === 'draft') pr.draft = true
    if (action === 'base') pr.base = 'other'
    if (action === 'closed') pr.state = 'closed'
    const head = github.refs.get(pr.branch)
    await edit(card.id)
    expect(await submit(card.id)).toMatchObject({ok:false,code:action === 'closed' ? 'pr_closed' : 'pr_paused'})
    expect(github.refs.get(pr.branch)).toBe(head)
    expect(github.prs).toHaveLength(1)
    if (action === 'closed') {
      expect(await submit(card.id,'restart')).toMatchObject({ok:true,prNumber:2})
      expect(pr.state).toBe('closed')
    }
  })

  it('deduplicates concurrent HTTP submissions through PostgreSQL', async () => {
    const card = await readyCard()
    const results = await Promise.all(Array.from({length:5},() => submit(card.id)))
    expect(new Set(results.map(result => result.submissionId)).size).toBe(1)
    expect(github.prs).toHaveLength(1)
    expect(await db.prepare('SELECT COUNT(*) AS count FROM workshop_submissions').get()).toEqual({count:1})
  })

  it('recovers a published branch after a lost response using a new executor', async () => {
    const card = await readyCard()
    github.loseRefResponse = true
    expect(await submit(card.id)).toMatchObject({ok:false,state:'pending'})
    await db.exec('UPDATE workshop_submissions SET retry_at = 0')
    await recoverPendingSubmissions(new SubmissionStore(db),WorkshopGitHubApp.fromEnv()!)
    expect(github.prs).toHaveLength(1)
    expect((await loadWorkspace(db,card.id,'author')).reviewStatus).toBe('in_review')
  })

  it('does not mark a rolled-back binding complete and repairs it on recovery', async () => {
    const card = await readyCard()
    const save = SubmissionStore.prototype.save
    let lost = false
    vi.spyOn(SubmissionStore.prototype,'save').mockImplementation(async function (row,payload) {
      if (row.state === 'complete' && !lost) { lost = true; throw new Error('database write failed') }
      return save.call(this,row,payload)
    })
    expect(await submit(card.id)).toMatchObject({ok:false,state:'pending'})
    expect((await loadWorkspace(db,card.id,'author')).reviewStatus).toBe('unsubmitted')
    await db.exec('UPDATE workshop_submissions SET retry_at = 0')
    expect(await submit(card.id,'recover')).toMatchObject({ok:true,prNumber:1})
    expect((await loadWorkspace(db,card.id,'author')).reviewStatus).toBe('in_review')
  })

  it('preserves a draft edited while its frozen version is being submitted', async () => {
    const card = await readyCard()
    github.afterCreate = async () => { github.afterCreate = undefined; await edit(card.id) }
    expect(await submit(card.id)).toMatchObject({ok:true,code:'draft_changed'})
    const workspace = await loadWorkspace(db,card.id,'author')
    expect(workspace.draft.description).toBe('Revised description')
    expect(workspace.reviewStatus).toBe('unsubmitted')
  })

  it('rejects a reviewer push between inspection and conditional branch update', async () => {
    const card = await readyCard()
    await submit(card.id)
    await edit(card.id)
    let reviewerHead: string | undefined
    github.beforeRefUpdate = () => {
      github.beforeRefUpdate = undefined
      reviewerHead = github.changeHead({'shared/cards/community/CUSTOM_TestCard.ts':'// race edit\n'})
    }
    expect(await submit(card.id)).toMatchObject({ok:false,code:'branch_conflict'})
    expect(github.refs.get(github.prs[0]!.branch)).toBe(reviewerHead)
  })

  it('does not create again when an uncertain PR result is temporarily absent', async () => {
    const card = await readyCard()
    github.loseCreateResponse = true
    await submit(card.id)
    const created = github.prs.splice(0)
    await db.exec('UPDATE workshop_submissions SET retry_at = 0')
    expect(await submit(card.id,'recover')).toMatchObject({ok:false,code:'creation_unknown'})
    expect(github.prs).toHaveLength(0)
    github.prs.push(...created)
    await db.exec('UPDATE workshop_submissions SET retry_at = 0')
    expect(await submit(card.id,'recover')).toMatchObject({ok:true,prNumber:1})
    expect(github.writes.filter(write => write.endsWith('/pulls'))).toHaveLength(1)
  })

  it.each(['head','marker'])('does not bypass uncertain creation through restart after a reviewer changes its %s', async changed => {
    const card = await readyCard()
    github.loseCreateResponse = true
    await submit(card.id)
    if (changed === 'head') github.changeHead({'server/__tests__/reviewer.test.ts':'reviewer test'})
    else github.prs[0]!.body = 'Marker removed by maintainer'
    await db.exec('UPDATE workshop_submissions SET retry_at = 0; DELETE FROM request_rate_limits')
    expect(await submit(card.id,'recover')).toMatchObject({ok:false,state:'blocked'})
    expect(await submit(card.id,'restart')).toMatchObject({ok:false})
    expect(github.prs).toHaveLength(1)
    expect(await db.prepare('SELECT COUNT(*) AS count FROM workshop_submissions').get()).toEqual({count:1})
  })

  it('migrates a verified legacy PR only on explicit resubmission', async () => {
    const card = await readyCard()
    await submit(card.id)
    const old = github.prs[0]!
    const head = github.refs.get(old.branch)
    await db.exec('DELETE FROM workshop_submissions; DELETE FROM request_rate_limits')
    expect(await submit(card.id)).toMatchObject({ok:false,code:'legacy_submission'})
    expect(await submit(card.id,'restart')).toMatchObject({ok:true,prNumber:2})
    expect(github.refs.get(old.branch)).toBe(head)
    expect(github.prs[1]!.body).toContain('Previous proposal: https://github.com/titanxxh/open-agricola/pull/1')
    const binding = await db.prepare('SELECT approved_review_id, github_pr_url FROM workshop_cards WHERE id = ?').get(card.id)
    expect(binding).toEqual({approved_review_id:null,github_pr_url:'https://github.com/titanxxh/open-agricola/pull/2'})
  })

  it('retires offline synthetic approvals with an audit while keeping the old version and PR', async () => {
    const card = await readyCard()
    await submit(card.id)
    await db.prepare("UPDATE workshop_cards SET review_status = 'approved',approved_review_id = 'owner:old',approved_version_id = review_version_id,approved_commit_sha = review_commit_sha WHERE id = ?").run(card.id)
    const before = await db.prepare('SELECT review_version_id,github_pr_url FROM workshop_cards WHERE id = ?').get(card.id)
    const migration = readFileSync(new URL('../database/017-retire-workshop-owner-approval.sql',import.meta.url),'utf8')
    await db.transaction(() => db.exec(migration))()
    await db.transaction(() => db.exec(migration))()
    expect(await db.prepare('SELECT review_version_id,github_pr_url,approved_review_id,review_status FROM workshop_cards WHERE id = ?').get(card.id)).toEqual({...before,approved_review_id:null,review_status:'stale'})
    expect(await db.prepare("SELECT COUNT(*) AS count FROM github_propose_audit WHERE workshop_card_id = ? AND action = 'legacy_approval_retired'").get(card.id)).toEqual({count:1})
  })

  it('stops cutover without changing a live synthetic approval', async () => {
    const card = await readyCard()
    await db.prepare("UPDATE workshop_cards SET review_status = 'approved',live = 1,approved_review_id = 'owner:old' WHERE id = ?").run(card.id)
    const migration = readFileSync(new URL('../database/017-retire-workshop-owner-approval.sql',import.meta.url),'utf8')
    await expect(db.transaction(() => db.exec(migration))()).rejects.toThrow('explicit author unpublish')
    expect(await db.prepare('SELECT live,approved_review_id FROM workshop_cards WHERE id = ?').get(card.id)).toEqual({live:1,approved_review_id:'owner:old'})
  })

  it('fences an expired executor after another instance claims the operation', async () => {
    const card = await readyCard()
    github.loseCreateResponse = true
    await submit(card.id)
    await db.exec('UPDATE workshop_submissions SET retry_at = 0')
    const first = new SubmissionStore(db)
    const operation = (await first.latest(card.id))!
    const old = (await first.claim(operation.id))!
    await db.prepare('UPDATE workshop_submissions SET lease_until = 0 WHERE id = ?').run(old.id)
    const replacement = new SubmissionStore(db)
    const current = (await replacement.claim(operation.id))!
    expect(current.lease_owner).not.toBe(old.lease_owner)
    old.phase = 'done'; old.state = 'complete'
    await expect(first.save(old,JSON.parse(old.payload))).rejects.toMatchObject({code:'submission_busy'})
    await first.release(old)
    expect((await replacement.latest(card.id))?.lease_owner).toBe(current.lease_owner)
  })

  it('returns the completed replacement result when an old executor loses its lease during preparation', async () => {
    const card = await readyCard()
    const save = SubmissionStore.prototype.save
    let replaced = false
    vi.spyOn(SubmissionStore.prototype,'save').mockImplementation(async function (row,payload) {
      if (row.phase === 'publish' && !replaced) {
        replaced = true
        await db.prepare('UPDATE workshop_submissions SET lease_until = 0 WHERE id = ?').run(row.id)
        await recoverPendingSubmissions(new SubmissionStore(db),WorkshopGitHubApp.fromEnv()!)
      }
      return save.call(this,row,payload)
    })
    expect(await submit(card.id)).toMatchObject({ok:true,prNumber:1})
    expect(github.prs).toHaveLength(1)
    expect((await loadWorkspace(db,card.id,'author')).reviewStatus).toBe('in_review')
  })

  it('waits for a lagging GitHub PR head after the planned branch write succeeds', async () => {
    const card = await readyCard()
    github.lagHeadAfterFinalPublish = true
    expect(await submit(card.id)).toMatchObject({ok:false,state:'pending',code:'pr_head_pending'})
    expect(github.prs).toHaveLength(1)
    github.laggedHead = undefined
    await db.exec('UPDATE workshop_submissions SET retry_at = 0')
    expect(await submit(card.id,'recover')).toMatchObject({ok:true,prNumber:1})
  })

  it.each(['manual','background'])('reconciles approval received before a %s recovery binds the PR', async mode => {
    const card = await readyCard()
    github.loseCreateResponse = true
    expect(await submit(card.id)).toMatchObject({ok:false,state:'pending'})
    github.approved = true
    await db.exec('UPDATE workshop_submissions SET retry_at = 0')
    if (mode === 'manual') expect(await submit(card.id,'recover')).toMatchObject({ok:true})
    else await recoverPendingSubmissions(new SubmissionStore(db),WorkshopGitHubApp.fromEnv()!)
    expect((await loadWorkspace(db,card.id,'author')).reviewStatus).toBe('approved')
  })

})
