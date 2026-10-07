import type { IncomingMessage, ServerResponse } from 'node:http'
import { nanoid } from 'nanoid'
import { getDb } from '../db.ts'
import { ALL_CARD_IMPLS } from '../../shared/cards/register-all.ts'
import { validateSession, extractToken } from '../auth.ts'
import { corsHeaders } from '../http-origin.ts'
import { workshopPrConfig } from './config.ts'
import { GitHubApiError, GitHubClient } from './github-client.ts'
import { verifyLegacySubmission } from './legacy-submission'
import { WorkshopGitHubApp } from './github-app'
import { SubmissionStore, type SubmissionPayload } from './submission-store'
import { deliverSubmission, submissionResult } from './submission-service'
import {
  enterReview,
  getHandoffReadiness,
  hasReservedCardId,
  loadWorkspace,
  pinCurrentDraftVersion,
  markBuiltInMergedCards,
  reconcilePendingMerges,
} from '../workshop-drafts.ts'
import { githubPrStatus } from '../workshop-review/github-review-provider'
import { loadReviewBinding, reconcileReviewSnapshot, type ReviewProvider } from '../workshop-review/reconcile-snapshot'

const REFRESH_COOLDOWN_MS = 60_000

const hasCompleteZhLocale = (cardJson: Record<string, unknown>): boolean => {
  const locales = cardJson.locales
  if (!locales || typeof locales !== 'object' || Array.isArray(locales)) return false
  const zh = (locales as Record<string, unknown>).zh
  if (!zh || typeof zh !== 'object' || Array.isArray(zh)) return false
  const entry = zh as Record<string, unknown>
  return typeof entry.name === 'string'
    && entry.name.trim().length > 0
    && Array.isArray(entry.desc)
    && entry.desc.some(line => typeof line === 'string' && line.trim().length > 0)
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    ...corsHeaders({ methods: 'GET,POST,DELETE,OPTIONS' }),
  })
  res.end(JSON.stringify(payload))
}

async function readJsonBody<T>(req: IncomingMessage): Promise<T | null> {
  let data = ''
  for await (const chunk of req) data += String(chunk)
  if (!data) return null
  try { return JSON.parse(data) as T } catch { return null }
}

export async function handleSubmitReviewRequest(
  req: IncomingMessage,
  res: ServerResponse,
  cardDbId: string,
  reviewProvider?: ReviewProvider,
): Promise<void> {
  const user = await validateSession(extractToken(req.headers.authorization))
  if (!user) { sendJson(res,401,{ok:false,code:'unauthenticated'}); return }
  const db = getDb()
  const owner = await db.prepare('SELECT author_id, github_pr_url FROM workshop_cards WHERE id = ?').get<{author_id:string;github_pr_url:string|null}>(cardDbId)
  if (!owner) { sendJson(res,404,{ok:false,code:'not_found'}); return }
  if (owner.author_id !== user.id) { sendJson(res,403,{ok:false,code:'forbidden'}); return }
  const store = new SubmissionStore(db)
  let latest = await store.latest(cardDbId)
  if (req.method === 'GET') {
    sendJson(res,200,latest ? submissionResult(latest) : owner.github_pr_url ? {ok:false,code:'legacy_submission',prUrl:owner.github_pr_url} : {ok:false,code:'no_submission'})
    return
  }
  const app = WorkshopGitHubApp.fromEnv()
  if (!workshopPrConfig.mockMode && (!workshopPrConfig.enabled || !app || !reviewProvider)) {
    sendJson(res,503,{ok:false,code:'workshop_app_unavailable'})
    return
  }
  try {
    const body = await readJsonBody<{action?: string}>(req)
    const action = body?.action ?? 'submit'
    if (!['submit','recover','restart'].includes(action)) throw new GitHubApiError('invalid action','invalid_action',400)
    if (action === 'recover' && !latest) { sendJson(res,200,{ok:false,code:'no_submission'}); return }
    if (action === 'recover' && latest && latest.state !== 'complete') {
      await store.admitRemoteAttempt(user.id)
      await store.resume(latest.id)
    }
    if (action === 'recover' && latest) {
      const result = await deliverSubmission(store,(await store.latest(cardDbId))!,app!,reviewProvider)
      sendJson(res,200,submissionResult(result))
      return
    }
    if (latest?.state === 'blocked' && action !== 'restart') {
      sendJson(res,200,submissionResult(latest)); return
    }
    if (latest?.state === 'blocked' && action === 'restart' && !(JSON.parse(latest.payload) as SubmissionPayload).pr) {
      sendJson(res,200,submissionResult(latest)); return
    }
    let operation = latest?.state === 'pending' ? latest : undefined
    if (!operation) {
      const current = await loadWorkspace(db,cardDbId,user.id)
      if (action === 'submit' && latest?.state === 'complete' && latest.revision === current.revision) {
        sendJson(res,200,submissionResult(latest)); return
      }
      if (!workshopPrConfig.mockMode) await store.admitRemoteAttempt(user.id)
      const prepared = await db.transaction(async () => {
        const workspace = await loadWorkspace(db,cardDbId,user.id)
        latest = await store.latest(cardDbId)
        if (latest?.state === 'pending') return {operation:latest}
        if (workspace.live || workspace.reviewStatus === 'approved' || workspace.reviewStatus === 'merged') {
          throw new GitHubApiError('unpublish and edit the draft before submitting again','already_reviewed',409)
        }
        const readiness = await getHandoffReadiness(db,cardDbId,user.id)
        if (!readiness.ready) throw new GitHubApiError('exact draft sandbox confirmation required','handoff_not_ready',400)
        if (!hasCompleteZhLocale(workspace.draft.cardJson)) throw new GitHubApiError('Chinese localization required','localization_not_ready',400)
        if (await hasReservedCardId(db,workspace.draft.cardId,cardDbId)) throw new GitHubApiError('card id reserved','card_id_taken',409)
        const { versionId } = await pinCurrentDraftVersion(db,{cardId:cardDbId,authorId:user.id,baseRevision:workspace.revision})
        if (workshopPrConfig.mockMode) {
          const mockResult = req.headers['x-workshop-pr-mock-result']
          if (mockResult === 'rate-limited') throw new GitHubApiError('rate limited','rate_limited',429)
          if (mockResult === 'remote-error') throw new GitHubApiError('GitHub unavailable','github_unavailable',503)
          await enterReview(db,{cardId:cardDbId,authorId:user.id,prUrl:'/mock-workshop-pr/1',expectedRevision:workspace.revision,commitSha:'mock-workshop-head'})
          return undefined
        }
        return {workspace,versionId,latest}
      })()
      if (!prepared) { sendJson(res,200,{ok:true,prUrl:'/mock-workshop-pr/1',prNumber:1}); return }
      if ('operation' in prepared) operation = prepared.operation
      else {
        const {workspace,versionId,latest} = prepared
        const author = await db.prepare('SELECT display_name FROM users WHERE id = ?').get<{display_name:string}>(user.id)
        const previous = latest ? JSON.parse(latest.payload) as SubmissionPayload : undefined
        const oldPrUrl = previous?.pr?.url ?? owner.github_pr_url
        let reuse: SubmissionPayload | undefined
        if (oldPrUrl) {
          if (!previous?.pr) {
            if (action !== 'restart') throw new GitHubApiError('legacy submission needs explicit cutover','legacy_submission',409)
          } else {
            const client = new GitHubClient({token:await app!.token('read'),upstreamOwner:previous.owner,upstreamRepo:previous.repository})
            const pr = await client.getPullRequest(previous.pr.number)
            if (pr.merged) throw new GitHubApiError('PR has merged','pr_merged',409)
            if (pr.draft || pr.base !== 'main') throw new GitHubApiError('PR paused by maintainer','pr_paused',409)
            if (pr.state === 'closed') {
              if (action !== 'restart') throw new GitHubApiError('explicit resubmission required','pr_closed',409)
            } else {
              if (action === 'restart') throw new GitHubApiError('an open PR already exists','pr_open',409)
              reuse = previous
            }
          }
        }
        const proposalId = reuse?.proposalId ?? nanoid()
        const { draft } = workspace
        const cardJson = Object.fromEntries(Object.entries(draft.cardJson).filter(([key]) => !key.startsWith('_')))
        const payload: SubmissionPayload = {
          appId:app!.options.appId,installationId:app!.options.installationId,
          owner:app!.options.repositoryOwner,repository:app!.options.repositoryName,
          proposalId,branch:reuse?.branch ?? `workshop/${cardDbId}/${proposalId}`,
          ...(reuse ? {pr:reuse.pr,previousFiles:reuse.files} : {}),
          ...(oldPrUrl ? {previousPrUrl:oldPrUrl} : {}),
          wcard:{id:cardDbId,card_id:draft.cardId,card_type:draft.cardType,author_name:author?.display_name,
            description:draft.description,effect_code:draft.effectCode ?? '',art_url:draft.artUrl,
            card_json:JSON.stringify({...cardJson,_code:draft.effectCode})},
        }
        if (oldPrUrl && !previous?.pr) {
          const client = new GitHubClient({token:await app!.token('read'),upstreamOwner:payload.owner,upstreamRepo:payload.repository})
          payload.legacyPr = await verifyLegacySubmission(db,client,payload,oldPrUrl)
        }
        operation = await store.begin({cardId:cardDbId,authorId:user.id,versionId,revision:workspace.revision,restart:action === 'restart',previous:latest,payload})
      }
    }
    if (!operation) { sendJson(res,200,{ok:true,prUrl:'/mock-workshop-pr/1',prNumber:1}); return }
    const result = await deliverSubmission(store,operation,app!,reviewProvider)
    sendJson(res,200,submissionResult(result))
  } catch (error) {
    const status = error instanceof GitHubApiError ? error.status ?? 500 : 500
    sendJson(res,status,{ok:false,code:error instanceof GitHubApiError ? error.code : 'submission_failed',...(error instanceof GitHubApiError && error.retryAfter ? {retryAfter:error.retryAfter} : {})})
  }
}

export async function handleRefreshPrStatus(
  req: IncomingMessage,
  res: ServerResponse,
  cardDbId: string,
  reviewProvider?: ReviewProvider,
): Promise<void> {
  const user = (await validateSession(extractToken(req.headers.authorization)))
  if (!user) {
    sendJson(res, 401, { ok: false, error: 'unauthenticated' })
    return
  }

  const db = getDb()
  const wcard = (await db.prepare(
    `SELECT github_pr_url, github_pr_last_synced_at, author_id
     FROM workshop_cards WHERE id = ?`,
  ).get(cardDbId)) as
    | { github_pr_url: string | null; github_pr_last_synced_at: number | null; author_id: string }
    | undefined
  if (!wcard) {
    sendJson(res, 404, { ok: false, error: 'card not found' })
    return
  }
  if (wcard.author_id !== user.id) {
    sendJson(res, 403, { ok: false, error: 'forbidden' })
    return
  }
  if (!wcard.github_pr_url) {
    sendJson(res, 404, { ok: false, error: 'no PR' })
    return
  }
  if (!reviewProvider) {
    sendJson(res, 503, { ok: false, code: 'github_review_unavailable' })
    return
  }

  const now = Date.now()
  if (
    wcard.github_pr_last_synced_at &&
    now - wcard.github_pr_last_synced_at < REFRESH_COOLDOWN_MS
  ) {
    const retryAfter = Math.ceil(
      (REFRESH_COOLDOWN_MS - (now - wcard.github_pr_last_synced_at)) / 1000,
    )
    sendJson(res, 429, { ok: false, code: 'cooldown', retryAfter })
    return
  }

  const match = /\/pull\/(\d+)/.exec(wcard.github_pr_url)
  if (!match) {
    sendJson(res, 500, { ok: false, error: 'malformed PR URL' })
    return
  }
  const prNum = Number(match[1])
  const expectedBinding = (await loadReviewBinding(db, cardDbId, wcard.github_pr_url))!

  try {
    const snapshot = await reviewProvider.getPullRequestSnapshot(prNum)
    const status = githubPrStatus(snapshot)
    const reconciled = (await reconcileReviewSnapshot(
      db,
      wcard.github_pr_url,
      snapshot,
      expectedBinding,
    ))
    if (reconciled === 0) (await db.prepare(
      `UPDATE workshop_cards
       SET github_pr_status = ?, github_pr_last_synced_at = ?
       WHERE id = ? AND github_pr_url = ? AND updated_at = ?`,
    ).run(status, now, cardDbId, wcard.github_pr_url, expectedBinding.updatedAt))
    // A missed merge webhook is repaired here: once the PR reads as merged
    // and the approval binding exists, the pending graduation completes —
    // including the built-in takeover if the running release has the card.
    // The graduation may have happened inside reconcileReviewSnapshot (both
    // webhooks missed), so the takeover reconcile runs unconditionally.
    if (status === 'merged') {
      ;(await reconcilePendingMerges(db))
      ;(await markBuiltInMergedCards(db, Object.keys(ALL_CARD_IMPLS)))
    }

    sendJson(res, 200, { ok: true, status })
  } catch (err) {
    sendJson(res, 502, {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
