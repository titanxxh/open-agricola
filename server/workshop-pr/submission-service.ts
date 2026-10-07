import { createHash } from 'node:crypto'
import { getResources } from '../storage/runtime'
import { enterReview, loadWorkspace } from '../workshop-drafts'
import { GitHubApiError, GitHubClient } from './github-client'
import { generatePrFiles, patchCommunityCardsMarkdown, type PrFile } from './code-gen'
import { WorkshopGitHubApp } from './github-app'
import { SubmissionStore, type SubmissionPayload, type SubmissionRow } from './submission-store'

const publicText = (value: string) => value.replace(/[\r\n]/g, ' ').replaceAll('@', '@\u200b')
const sourcePaths = ['shared/cards/register-all.ts', 'shared/cards/catalog.generated.ts', 'docs/community_cards.md'] as const

export const submissionResult = (row: SubmissionRow) => {
  const data = JSON.parse(row.payload) as SubmissionPayload
  return row.state === 'complete' && data.pr
    ? { ok: true as const, submissionId: row.id, prNumber: data.pr.number, prUrl: data.pr.url, ...(row.error_code ? { code: row.error_code } : {}) }
    : { ok: false as const, submissionId: row.id, state: row.state, code: row.error_code ?? 'submission_pending', ...(data.pr ? { prUrl: data.pr.url } : {}), needsAttention: row.state === 'blocked' || row.attempts >= 4, retryAfter: Math.max(0,Math.ceil((row.retry_at-Date.now())/1000)) }
}

async function art(artUrl: string | null | undefined) {
  if (!artUrl) return null
  const match = /^\/card-art\/[A-Za-z0-9._-]+\.(png|jpg|jpeg|webp)$/i.exec(artUrl)
  if (!match) throw new GitHubApiError('unsupported card artwork', 'invalid_art', 400)
  const object = await getResources().read(artUrl.slice(1))
  if (!object) throw new GitHubApiError('card artwork unavailable', 'art_unavailable', 503)
  return { ext: match[1]!.toLowerCase(), buffer: object.body }
}

function proposalBody(data: SubmissionPayload): string {
  return `## Community Card Submission

**Card ID**: ${data.wcard.card_id}
**Designer**: ${publicText(data.wcard.author_name ?? 'Workshop author')}

${data.previousPrUrl ? `Previous proposal: ${data.previousPrUrl}\n\n` : ''}${(data.wcard.description ?? '').replaceAll('@', '@\u200b')}

Submitted by the Workshop App on behalf of the card designer.

### Review

- [ ] Card behavior and balance reviewed
- [ ] Necessary direct behavior or GameSession tests included
- [ ] Chinese localization complete
- [ ] CI passes

<!-- workshop-proposal:${data.proposalId} -->
`
}

const isTestPath = (path: string) => !path.split('/').includes('..')
  && /^(?:server|shared)\/(?:[A-Za-z0-9_.-]+\/)*__tests__\/[A-Za-z0-9_./-]+\.test\.ts$/.test(path)

function validatePr(data: SubmissionPayload, pr: Awaited<ReturnType<GitHubClient['getPullRequest']>>) {
  if (pr.headRepository !== `${data.owner}/${data.repository}` || pr.branch !== data.branch
    || !pr.body.includes(`<!-- workshop-proposal:${data.proposalId} -->`)) {
    throw new GitHubApiError('PR identity changed','pr_identity_invalid',409)
  }
  if (pr.merged) throw new GitHubApiError('PR has merged','pr_merged',409)
  if (pr.state !== 'open') throw new GitHubApiError('PR was closed','pr_closed',409)
  if (pr.draft || pr.base !== 'main') throw new GitHubApiError('PR paused by maintainer','pr_paused',409)
}

/** Bounded restart reconciliation. No new operation is allocated here. */
export async function recoverPendingSubmissions(store: SubmissionStore, app: WorkshopGitHubApp): Promise<void> {
  for (const row of await store.due()) await deliverSubmission(store,row,app)
}

/** Resumes one fixed-version delivery. Each remotely visible step has a committed checkpoint first. */
export async function deliverSubmission(store: SubmissionStore, source: SubmissionRow, app: WorkshopGitHubApp): Promise<SubmissionRow> {
  const row = await store.claim(source.id)
  if (!row) return (await store.latest(source.card_id))!
  const data = JSON.parse(row.payload) as SubmissionPayload
  try {
    row.error_code = null
    row.retry_at = 0
    if (app.options.repositoryOwner !== data.owner || app.options.repositoryName !== data.repository || app.options.appId !== data.appId || app.options.installationId !== data.installationId) {
      throw new GitHubApiError('repository configuration changed','repository_changed',409)
    }
    const client = new GitHubClient({ token: await app.token('write'), upstreamOwner: data.owner, upstreamRepo: data.repository })
    if (row.phase === 'prepare') {
      let preserved: Awaited<ReturnType<GitHubClient['getPullRequestTreeEntries']>> = []
      if (data.pr) {
        const pr = await client.getPullRequest(data.pr.number)
        validatePr(data,pr)
        data.expectedHead = pr.headSha
        for (const file of data.previousFiles ?? []) {
          const bytes = Buffer.from(file.content,file.encoding === 'base64' ? 'base64' : 'utf8')
          const expected = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')
          if (await client.getFileSha(file.path,pr.headSha) !== expected) {
            throw new GitHubApiError('generated file was edited by a reviewer','generated_file_changed',409)
          }
        }
        if (!data.previousFiles?.length) throw new GitHubApiError('generated file baseline missing','legacy_submission',409)
        preserved = await client.getPullRequestTreeEntries(data.pr.number)
        const generated = new Set(data.previousFiles.map(file => file.path))
        for (const entry of preserved) {
          if (!generated.has(entry.path) && !isTestPath(entry.path)
            || entry.previousPath && !generated.has(entry.previousPath) && !isTestPath(entry.previousPath)) {
            throw new GitHubApiError('PR contains changes requiring maintainer integration','pr_scope_changed',409)
          }
        }
        // The files endpoint is not a transaction with the head lookup.
        if ((await client.getPullRequest(data.pr.number)).headSha !== pr.headSha) throw new GitHubApiError('PR changed during preparation','branch_conflict',409)
      } else {
        data.expectedHead = null
        if (data.legacyPr) {
          const old = await client.getPullRequest(data.legacyPr.number)
          if (old.headSha !== data.legacyPr.headSha) throw new GitHubApiError('legacy PR changed','branch_conflict',409)
          if (old.merged) throw new GitHubApiError('legacy PR merged','pr_merged',409)
          if (old.draft || old.base !== 'main') throw new GitHubApiError('legacy PR paused','pr_paused',409)
          preserved = (await client.getPullRequestTreeEntries(old.number)).filter(entry => !data.legacyPr!.generatedPaths.includes(entry.path))
          if (preserved.some(entry => !isTestPath(entry.path) || entry.previousPath && !isTestPath(entry.previousPath))) {
            throw new GitHubApiError('legacy PR contains unsupported edits','pr_scope_changed',409)
          }
          if ((await client.getPullRequest(old.number)).headSha !== old.headSha) throw new GitHubApiError('legacy PR changed','branch_conflict',409)
        }
      }
      data.mainSha = await client.getUpstreamMainSha()
      const sources = await Promise.all(sourcePaths.map(path => client.getUpstreamFile(path,data.mainSha)))
      data.files = await generatePrFiles({
        wcard: data.wcard, github_login: '', designer_name: data.wcard.author_name ?? 'Workshop author',
        upstream_register_all: sources[0]!, upstream_catalog_generated: sources[1]!, upstream_community_md: sources[2]!,
        pr_number: data.pr?.number ?? 0, art_data: await art(data.wcard.art_url),
      })
      const allowed = new Set([...sourcePaths,`shared/cards/community/${data.wcard.card_id}.ts`,...['png','jpg','jpeg','webp'].map(ext => `public/card-art/community/${data.wcard.card_id}.${ext}`)])
      if (data.files.some(file => !allowed.has(file.path))) throw new GitHubApiError('generated file outside submission scope','invalid_path',400)
      const obsolete = (data.previousFiles ?? []).filter(file => !data.files!.some(next => next.path === file.path))
      if (obsolete.length) throw new GitHubApiError('generated paths changed; maintainer integration required','generated_paths_changed',409)
      await store.save(row,data)
      const commit = await client.createCommit({
        files: data.files, message: `feat: submit ${data.wcard.card_id} from Workshop`, upstreamBaseSha: data.mainSha,preservedTreeEntries:preserved,
      })
      data.commitSha = commit.commitSha
      row.phase = 'publish'
      await store.save(row,data)
    }
    if (row.phase === 'publish') {
      await store.save(row,data)
      if (data.pr) validatePr(data,await client.getPullRequest(data.pr.number))
      const head = await client.getBranchHead(data.branch)
      await store.save(row,data)
      if (head !== data.commitSha) {
        if (head !== (data.expectedHead ?? null)) throw new GitHubApiError('submission branch changed','branch_conflict',409)
        await client.publishBranch({branchName:data.branch,expectedHead:data.expectedHead ?? null,commitSha:data.commitSha!})
      }
      row.phase = data.pr ? 'bind' : 'open'
      if (data.pr) data.finalCommitSha = data.commitSha
      await store.save(row,data)
    }
    if (row.phase === 'open') {
      const matches = await client.findPullRequests(data.branch)
      if (matches.length > 1) throw new GitHubApiError('multiple PRs need reconciliation','ambiguous_pr',503)
      const match = matches[0]
      if (match) {
        if (match.headRepository !== `${data.owner}/${data.repository}` || match.branch !== data.branch
          || !match.body.includes(`<!-- workshop-proposal:${data.proposalId} -->`) || match.headSha !== data.commitSha) {
          throw new GitHubApiError('PR identity does not match submission','pr_identity_invalid',409)
        }
        data.pr = {number:match.number,url:match.url}
        validatePr(data,match)
      } else {
        if (data.createAttempted) throw new GitHubApiError('PR creation result needs reconciliation', 'creation_unknown', 503)
        await store.save(row,data)
        data.createAttempted = true
        await store.save(row,data)
        data.pr = await client.openPr({branchName:data.branch,title:`[community] ${data.wcard.card_id}`,body:proposalBody(data)})
      }
      row.phase = 'finalize'
      await store.save(row,data)
    }
    if (row.phase === 'finalize') {
      if (!data.finalCommitSha) {
        const original = await client.getUpstreamFile('docs/community_cards.md',data.mainSha)
        const index: PrFile = { path: 'docs/community_cards.md', encoding:'utf-8', content:patchCommunityCardsMarkdown(original,{
          card_id:data.wcard.card_id, card_name:JSON.parse(data.wcard.card_json ?? '{}').name ?? data.wcard.card_id,
          card_type:data.wcard.card_type, github_login:'', designer_name:data.wcard.author_name ?? 'Workshop author', pr_number:data.pr!.number,
        }) }
        data.files = data.files!.map(file => file.path === index.path ? index : file)
        data.finalCommitSha = (await client.createCommit({files:[index],message:`docs: link ${data.wcard.card_id} review`,upstreamBaseSha:data.commitSha!})).commitSha
        await store.save(row,data)
      }
      await store.save(row,data)
      validatePr(data,await client.getPullRequest(data.pr!.number))
      const head = await client.getBranchHead(data.branch)
      if (head !== data.finalCommitSha) {
        if (head !== data.commitSha) throw new GitHubApiError('submission branch changed','branch_conflict',409)
        await client.publishBranch({branchName:data.branch,expectedHead:data.commitSha!,commitSha:data.finalCommitSha})
      }
      row.phase = 'bind'
      await store.save(row,data)
    }
    if (row.phase === 'bind') {
      const pr = await client.getPullRequest(data.pr!.number)
      validatePr(data,pr)
      if (pr.headSha !== data.finalCommitSha) {
        const branchHead = await client.getBranchHead(data.branch)
        if (branchHead === data.finalCommitSha && [data.commitSha,data.expectedHead].includes(pr.headSha)) {
          throw new GitHubApiError('GitHub PR head has not caught up with its branch','pr_head_pending',503)
        }
        throw new GitHubApiError('PR changed before binding','branch_conflict',409)
      }
      await store.db.transaction(async () => {
        await store.save(row,data)
        const workspace = await loadWorkspace(store.db,row.card_id,row.author_id)
        if (workspace.revision === row.revision) {
          await enterReview(store.db,{cardId:row.card_id,authorId:row.author_id,prUrl:data.pr!.url,expectedRevision:row.revision,commitSha:data.finalCommitSha!})
        } else row.error_code = 'draft_changed'
        row.phase = 'done'
        row.state = 'complete'
        await store.save(row,data)
      })()
    }
  } catch (error) {
    if (row.phase === 'done') { row.phase = 'bind'; row.state = 'pending' }
    const known = error instanceof GitHubApiError
    row.error_code = known ? error.code : 'github_unavailable'
    if (known && error.status && error.status < 500 && error.status !== 429) row.state = 'blocked'
    else row.retry_at = Date.now() + Math.max((known ? error.retryAfter ?? 0 : 0)*1000,30_000 * 2 ** Math.min(row.attempts - 1,5))
    if (known && error.status === 401) app.invalidate()
    if (known && row.phase === 'open' && error.code === 'pr_create_failed' && [401,403,404,422].includes(error.status ?? 0)) data.createAttempted = false
    try { await store.save(row,data) } catch { /* A newer execution owns the record; never replace it. */ }
  } finally {
    await store.release(row)
  }
  return (await store.latest(source.card_id))!
}
