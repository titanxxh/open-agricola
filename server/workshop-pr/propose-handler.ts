import type { IncomingMessage, ServerResponse } from 'node:http'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { nanoid } from 'nanoid'
import { getDb } from '../db.ts'
import { ALL_CARD_IMPLS } from '../../shared/cards/register-all.ts'
import { validateSession, extractToken } from '../auth.ts'
import { corsHeaders } from '../http-origin.ts'
import { workshopPrConfig, workshopPrEnabled } from './config.ts'
import { tokenCache } from './token-cache.ts'
import { GitHubClient, GitHubApiError } from './github-client.ts'
import { generatePrFiles } from './code-gen.ts'
import {
  approveReviewedVersion,
  enterReview,
  getHandoffReadiness,
  hasReservedCardId,
  invalidateReviewedCard,
  loadWorkspace,
  markBuiltInMergedCards,
  markCardMerged,
  reconcilePendingMerges,
} from '../workshop-drafts.ts'
import {
  breaksReviewGateWithoutApproval,
  findApprovedHeadReview,
  findApprovedMergedHeadReview,
  githubPrStatus,
  type WorkshopReviewSnapshot,
} from '../workshop-review/github-review-provider.ts'

const RATE_LIMIT_MS = 10 * 60_000 // 10 minutes
const REFRESH_COOLDOWN_MS = 60_000 // 1 minute

type WorkshopCardRow = {
  id: string
  author_id: string
  card_id: string
  card_type: string
  name: string
  description: string
  card_json: string
  art_url: string | null
  review_status: string
  live: number
  draft_revision: number
  author_name?: string
}

type ReviewProvider = {
  getPullRequestSnapshot(prNumber: number): Promise<WorkshopReviewSnapshot>
}

type ReviewBinding = {
  id: string
  revision: number
  approvedCommitSha: string | null
  approvedVersionId: string | null
  reviewCommitSha: string | null
  reviewVersionId: string | null
  updatedAt: number
}

const loadReviewBinding = (
  db: ReturnType<typeof getDb>,
  cardId: string,
  prUrl: string,
): ReviewBinding | undefined => db.prepare(`
  SELECT id,
         draft_revision AS revision,
         approved_commit_sha AS approvedCommitSha,
         approved_version_id AS approvedVersionId,
         review_commit_sha AS reviewCommitSha,
         review_version_id AS reviewVersionId,
         updated_at AS updatedAt
  FROM workshop_cards
  WHERE id = ? AND github_pr_url = ?
`).get(cardId, prUrl) as ReviewBinding | undefined

const reconcileReviewSnapshot = (
  db: ReturnType<typeof getDb>,
  prUrl: string,
  snapshot: WorkshopReviewSnapshot,
  expectedBinding: ReviewBinding,
): number => {
  if (snapshot.headRefOid !== expectedBinding.reviewCommitSha) {
    return invalidateReviewedCard(db, {
      prUrl,
      prStatus: githubPrStatus(snapshot),
      expectedBinding,
    })
  }
  const approvedReview = findApprovedHeadReview(snapshot)
    ?? findApprovedMergedHeadReview(snapshot)
  if (approvedReview) {
    const approved = approveReviewedVersion(db, {
      prUrl,
      commitSha: snapshot.headRefOid,
      reviewId: approvedReview.id,
      expectedBinding,
    })
    // Both the approval and merge webhooks may have been missed: the snapshot
    // already reads MERGED. Graduate right here — approveReviewedVersion just
    // reset github_pr_status to 'open', so reconcilePendingMerges would never
    // see this row as pending.
    if (approved > 0 && snapshot.state === 'MERGED') {
      markCardMerged(db, { prUrl })
    }
    return approved
  }
  return breaksReviewGateWithoutApproval(snapshot)
    ? invalidateReviewedCard(db, {
        prUrl,
        prStatus: githubPrStatus(snapshot),
        expectedBinding,
      })
    : 0
}

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
  if (!workshopPrEnabled()) {
    sendJson(res, 503, { ok: false, error: 'workshop PR integration disabled' })
    return
  }

  const user = validateSession(extractToken(req.headers.authorization))
  if (!user) {
    sendJson(res, 401, { ok: false, error: 'unauthenticated' })
    return
  }

  const db = getDb()
  const wcard = db.prepare(
    `SELECT c.*, u.username AS author_name
     FROM workshop_cards c
     LEFT JOIN users u ON u.id = c.author_id
     WHERE c.id = ?`,
  ).get(cardDbId) as WorkshopCardRow | undefined

  if (!wcard) {
    sendJson(res, 404, { ok: false, error: 'card not found' })
    return
  }
  if (wcard.author_id !== user.id) {
    sendJson(res, 403, { ok: false, error: 'not your card' })
    return
  }
  // #637 timing inversion: review submission is the entry to in_review — it
  // must happen *before* approval, so unsubmitted/stale/in_review may submit
  // (in_review re-submission updates the PR branch).
  if (wcard.review_status === 'approved' || wcard.review_status === 'merged') {
    sendJson(res, 400, {
      ok: false,
      code: 'already_reviewed',
      error: `card is already ${wcard.review_status}; edit the draft to restart review`,
    })
    return
  }
  const readiness = getHandoffReadiness(db, cardDbId, user.id)
  if (!readiness.ready) {
    sendJson(res, 400, {
      ok: false,
      code: 'handoff_not_ready',
      error: 'draft must pass static validation and the exact-version sandbox gate',
      readiness,
    })
    return
  }
  if (!hasCompleteZhLocale(loadWorkspace(db, cardDbId, user.id).draft.cardJson)) {
    sendJson(res, 400, {
      ok: false,
      code: 'localization_not_ready',
      error: 'complete Chinese localization is required',
    })
    return
  }
  if (hasReservedCardId(db, wcard.card_id, cardDbId)) {
    sendJson(res, 409, {
      ok: false,
      code: 'card_id_taken',
      error: 'card id is already reserved by an approved or merged card',
    })
    return
  }
  if (workshopPrConfig.mockMode) {
    const mockResult = req.headers['x-workshop-pr-mock-result']
    if (mockResult === 'rate-limited') {
      sendJson(res, 429, {
        ok: false,
        code: 'rate_limited',
        retryAfter: 30,
      })
      return
    }
    if (mockResult === 'remote-error') {
      sendJson(res, 503, {
        ok: false,
        code: 'github_unavailable',
        error: 'deterministic GitHub failure',
      })
      return
    }
    const prUrl = '/mock-workshop-pr/1'
    enterReview(db, {
      cardId: cardDbId,
      authorId: user.id,
      prUrl,
      expectedRevision: wcard.draft_revision,
      commitSha: 'mock-workshop-head',
    })
    sendJson(res, 200, { ok: true, prUrl, prNumber: 1 })
    return
  }

  if (!reviewProvider) {
    sendJson(res, 503, { ok: false, code: 'github_review_unavailable' })
    return
  }

  const now = Date.now()
  const rate = db.prepare(
    `SELECT last_propose_at FROM github_propose_rate_limit WHERE user_id = ?`,
  ).get(user.id) as { last_propose_at: number } | undefined
  if (rate && now - rate.last_propose_at < RATE_LIMIT_MS) {
    const retryAfter = Math.ceil((RATE_LIMIT_MS - (now - rate.last_propose_at)) / 1000)
    sendJson(res, 429, { ok: false, code: 'rate_limited', retryAfter })
    return
  }

  const body = (await readJsonBody<{ handshakeId?: string }>(req)) ?? {}

  // ── Phase 1: allocate handshake, return needsAuth ──
  if (!body.handshakeId) {
    const hs = tokenCache.allocateHandshakeId(user.id)
    const authUrl = `/api/workshop/github/oauth/start?hs=${encodeURIComponent(hs)}`
    sendJson(res, 200, { ok: false, needsAuth: true, authUrl, handshakeId: hs })
    return
  }

  // ── Phase 2: consume token, do the work ──
  const creds = tokenCache.get(body.handshakeId)
  if (!creds || creds.userId !== user.id) {
    sendJson(res, 200, { ok: false, code: 'handshake_expired' })
    return
  }
  tokenCache.delete(body.handshakeId)

  const auditStartId = nanoid()
  db.prepare(
    `INSERT INTO github_propose_audit
      (id, user_id, workshop_card_id, action, created_at)
     VALUES (?, ?, ?, 'start', ?)`,
  ).run(auditStartId, user.id, cardDbId, now)

  try {
    const client = new GitHubClient({
      token: creds.token,
      upstreamOwner: workshopPrConfig.upstreamOwner,
      upstreamRepo: workshopPrConfig.upstreamRepo,
    })

    const fork = await client.ensureFork()
    const githubLogin = fork.owner

    const upstreamBaseSha = await client.getUpstreamMainSha()
    const upstreamRegisterAll = await client.getUpstreamFile('shared/cards/register-all.ts', upstreamBaseSha)
    const upstreamCatalogGenerated = await client.getUpstreamFile('shared/cards/catalog.generated.ts', upstreamBaseSha)
    const upstreamCommunityMd = await client.getUpstreamFile('docs/community_cards.md', upstreamBaseSha)

    const artData = loadArtIfAny(wcard.art_url)

    // v7 schema: TS source lives inside card_json under `_code`.
    let effectCode = ''
    try {
      const parsed = JSON.parse(wcard.card_json) as Record<string, unknown>
      if (typeof parsed._code === 'string') effectCode = parsed._code
    } catch { /* malformed card_json — keep effectCode empty */ }
    const wcardForGen = {
      id: wcard.id,
      card_id: wcard.card_id,
      card_type: wcard.card_type,
      author_name: wcard.author_name,
      description: wcard.description,
      effect_code: effectCode,
      card_json: wcard.card_json,
      art_url: wcard.art_url,
    }

    const branchName = `workshop/${wcard.card_id}`
    let pr = await client.findOpenPr({ forkOwner: githubLogin, branchName })
    const existingPrTreeEntries = pr
      ? await client.getPullRequestTreeEntries(pr.number)
      : []
    if (pr && (pr.baseRefName !== 'main' || pr.isDraft)) {
      await client.closePr(pr.number)
      pr = null
    }
    const legacySmokePath = `shared/cards/community/__tests__/${wcard.card_id}.test.ts`
    const generatedArtPrefix = `public/card-art/community/${wcard.card_id}.`
    const preservedTreeEntries = existingPrTreeEntries.filter((entry) => !(
      entry.path.startsWith(generatedArtPrefix)
      || (
        entry.path === legacySmokePath
        && entry.patch?.includes('community card smoke test')
        && entry.patch.includes("exports a valid definition")
        && entry.patch.includes('exports a CardImpl')
        && (entry.patch.match(/\b(?:it|test)(?:\.\w+)*\s*\(/g) ?? []).length === 2
      )
    ))

    // V1 commit with placeholder PR number (0) — lets us open the PR first
    const filesV1 = await generatePrFiles({
      wcard: wcardForGen,
      github_login: githubLogin,
      upstream_register_all: upstreamRegisterAll,
      upstream_catalog_generated: upstreamCatalogGenerated,
      upstream_community_md: upstreamCommunityMd,
      pr_number: 0,
      art_data: artData,
    })
    const commit1 = await client.createCommit({
      forkOwner: githubLogin,
      files: filesV1,
      message: buildCommitMessage(wcard, githubLogin, 1),
      author: {
        name: wcard.author_name ?? githubLogin,
        email: `${githubLogin}@users.noreply.github.com`,
      },
      upstreamBaseSha,
      preservedTreeEntries,
    })
    await client.upsertBranch({
      forkOwner: githubLogin,
      branchName,
      commitSha: commit1.commitSha,
    })

    // Find or open PR
    if (!pr) {
      pr = await client.openPr({
        forkOwner: githubLogin,
        branchName,
        title: buildPrTitle(wcard, githubLogin),
        body: buildPrBody(wcard, githubLogin),
      })
    } else {
      await client.commentOnPr({
        prNumber: pr.number,
        body: `Updated from workshop at ${new Date().toISOString()}`,
      })
    }

    // V2 commit with real PR number — rewrites community_cards.md with proper link
    const filesV2 = await generatePrFiles({
      wcard: wcardForGen,
      github_login: githubLogin,
      upstream_register_all: upstreamRegisterAll,
      upstream_catalog_generated: upstreamCatalogGenerated,
      upstream_community_md: upstreamCommunityMd,
      pr_number: pr.number,
      art_data: artData,
    })
    const commit2 = await client.createCommit({
      forkOwner: githubLogin,
      files: filesV2,
      message: buildCommitMessage(wcard, githubLogin, 2),
      author: {
        name: wcard.author_name ?? githubLogin,
        email: `${githubLogin}@users.noreply.github.com`,
      },
      upstreamBaseSha,
      preservedTreeEntries,
    })
    await client.upsertBranch({
      forkOwner: githubLogin,
      branchName,
      commitSha: commit2.commitSha,
    })

    enterReview(db, {
      cardId: cardDbId,
      authorId: user.id,
      prUrl: pr.url,
      expectedRevision: wcard.draft_revision,
      commitSha: commit2.commitSha,
    })
    const expectedBinding = loadReviewBinding(db, cardDbId, pr.url)!
    let reconciliationPending = false
    try {
      const snapshot = await reviewProvider.getPullRequestSnapshot(pr.number)
      reconcileReviewSnapshot(db, pr.url, snapshot, expectedBinding)
    } catch {
      reconciliationPending = true
      db.prepare(`
        UPDATE workshop_cards
        SET github_pr_last_synced_at = NULL
        WHERE id = ? AND github_pr_url = ? AND updated_at = ?
      `).run(expectedBinding.id, pr.url, expectedBinding.updatedAt)
    }
    db.prepare(
      `INSERT OR REPLACE INTO github_propose_rate_limit
        (user_id, last_propose_at)
       VALUES (?, ?)`,
    ).run(user.id, now)
    db.prepare(
      `INSERT INTO github_propose_audit
        (id, user_id, workshop_card_id, action, pr_url, created_at)
       VALUES (?, ?, ?, 'success', ?, ?)`,
    ).run(nanoid(), user.id, cardDbId, pr.url, now)

    sendJson(res, 200, {
      ok: true,
      prUrl: pr.url,
      prNumber: pr.number,
      ...(reconciliationPending ? { reconciliationPending: true } : {}),
    })
  } catch (err) {
    const code = err instanceof GitHubApiError ? err.code : 'unknown'
    const message = err instanceof Error ? err.message : String(err)
    db.prepare(
      `INSERT INTO github_propose_audit
        (id, user_id, workshop_card_id, action, error_code, error_message, created_at)
       VALUES (?, ?, ?, 'fail', ?, ?, ?)`,
    ).run(nanoid(), user.id, cardDbId, code, message, Date.now())
    sendJson(res, 200, { ok: false, code, message })
  }
}

export async function handleRefreshPrStatus(
  req: IncomingMessage,
  res: ServerResponse,
  cardDbId: string,
  reviewProvider?: ReviewProvider,
): Promise<void> {
  const user = validateSession(extractToken(req.headers.authorization))
  if (!user) {
    sendJson(res, 401, { ok: false, error: 'unauthenticated' })
    return
  }

  const db = getDb()
  const wcard = db.prepare(
    `SELECT github_pr_url, github_pr_last_synced_at, author_id
     FROM workshop_cards WHERE id = ?`,
  ).get(cardDbId) as
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
  const expectedBinding = loadReviewBinding(db, cardDbId, wcard.github_pr_url)!

  try {
    const snapshot = await reviewProvider.getPullRequestSnapshot(prNum)
    const status = githubPrStatus(snapshot)
    const reconciled = reconcileReviewSnapshot(
      db,
      wcard.github_pr_url,
      snapshot,
      expectedBinding,
    )
    if (reconciled === 0) db.prepare(
      `UPDATE workshop_cards
       SET github_pr_status = ?, github_pr_last_synced_at = ?
       WHERE id = ? AND github_pr_url = ? AND updated_at = ?`,
    ).run(status, now, cardDbId, wcard.github_pr_url, expectedBinding.updatedAt)
    // A missed merge webhook is repaired here: once the PR reads as merged
    // and the approval binding exists, the pending graduation completes —
    // including the built-in takeover if the running release has the card.
    // The graduation may have happened inside reconcileReviewSnapshot (both
    // webhooks missed), so the takeover reconcile runs unconditionally.
    if (status === 'merged') {
      reconcilePendingMerges(db)
      markBuiltInMergedCards(db, Object.keys(ALL_CARD_IMPLS))
    }

    sendJson(res, 200, { ok: true, status })
  } catch (err) {
    sendJson(res, 502, {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

function loadArtIfAny(artUrl: string | null): { ext: string; buffer: Buffer } | null {
  if (!artUrl) return null
  // art_url expected format: /card-art/{uuid}.{ext} → read from CARD_ART_DIR
  const match = /\/card-art\/([^/]+\.([a-z0-9]+))$/i.exec(artUrl)
  if (!match) return null
  const filename = match[1]!
  const ext = match[2]!.toLowerCase()
  const dir = process.env.CARD_ART_DIR ?? join(process.cwd(), 'data', 'card-art')
  const path = join(dir, filename)
  if (!existsSync(path)) return null
  return { ext, buffer: readFileSync(path) }
}

function buildCommitMessage(
  wcard: WorkshopCardRow,
  githubLogin: string,
  commitNum: number,
): string {
  const name = safeParseName(wcard.card_json) ?? wcard.card_id
  return `feat(community): ${wcard.card_id} (${name}) via workshop${commitNum > 1 ? ` (v${commitNum})` : ''}

Author: @${githubLogin} (workshop: ${wcard.author_name ?? '?'})
Card: ${wcard.card_type} · deck community
Source: workshop card ${wcard.id}

Generated by Open Agricola workshop.
`
}

function buildPrTitle(wcard: WorkshopCardRow, githubLogin: string): string {
  const name = safeParseName(wcard.card_json) ?? wcard.card_id
  return `[community] ${wcard.card_id} (${name}) by @${githubLogin}`
}

function buildPrBody(wcard: WorkshopCardRow, githubLogin: string): string {
  const name = safeParseName(wcard.card_json) ?? wcard.card_id
  return `## Community Card Submission

**Card ID**: \`${wcard.card_id}\`
**Name**: ${name}
**Type**: ${wcard.card_type}
**Author**: @${githubLogin} (workshop: ${wcard.author_name ?? '?'})

### Description

${wcard.description || '_(no description)_'}

### Files changed

- \`shared/cards/community/${wcard.card_id}.ts\` — card definition + implementation
- \`shared/cards/register-all.ts\` — registry patch (alphabetical insert)
- \`shared/cards/catalog.generated.ts\` — generated catalog patch
- \`docs/community_cards.md\` — community card log
${wcard.art_url ? `- \`public/card-art/community/${wcard.card_id}.{ext}\` — art (LLM-generated)\n` : ''}

### Reviewer checklist

- [ ] Balance check vs official cards
- [ ] Card text clarity
- [ ] Effect code review (sandbox-validated, AST-checked)
- [ ] Any \`costs\` result includes explicit \`costAttribution\`
- [ ] Simple immediate effects have a direct behavior test; payment, choice/pending, delayed, cross-player, or multi-step effects have a dedicated GameSession test
- [ ] No definition-only generated smoke test
${wcard.art_url ? '- [ ] Art license (LLM-generated, author confirmed)\n' : ''}- [ ] Tests pass

---

<sub>Auto-generated by Open Agricola workshop. To update this PR, re-propose from the workshop UI.</sub>
`
}

function safeParseName(cardJson: string): string | null {
  try {
    const parsed = JSON.parse(cardJson) as { name?: string }
    return parsed.name ?? null
  } catch {
    return null
  }
}
