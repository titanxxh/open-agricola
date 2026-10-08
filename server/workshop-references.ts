import { WorkshopGitHubApp } from './workshop-pr/github-app'
import { GitHubApiError } from './workshop-pr/github-transport'
import type { PostgresDatabase } from './database/postgres'
import { consumeRateLimit } from './database/rate-limit'

const repository = 'titanxxh/open-agricola'
const commitPattern = /^[a-f0-9]{40}$/
let app: WorkshopGitHubApp | null | undefined
type TreeEntry = { path: string; type: 'blob'; sha: string; size?: number }
const trees = new Map<string, { tree: TreeEntry[]; truncated: false }>()
let inFlight = 0

export class WorkshopReferenceError extends Error {
  readonly status: number
  readonly retryAfter?: number
  constructor(status: number, message: string, retryAfter?: number) { super(message); this.status = status; this.retryAfter = retryAfter }
}

async function recordCooldown(db: PostgresDatabase, until: number): Promise<WorkshopReferenceError> {
  const row = await db.prepare(`INSERT INTO workshop_reference_cooldowns (repository, blocked_until) VALUES (?, ?)
    ON CONFLICT (repository) DO UPDATE SET blocked_until = GREATEST(workshop_reference_cooldowns.blocked_until, excluded.blocked_until)
    RETURNING blocked_until`).get<{ blocked_until: number }>(repository, until)
  return cooldownError(row!.blocked_until)
}

function cooldownError(until: number): WorkshopReferenceError {
  return new WorkshopReferenceError(429, 'GitHub reference rate-limit cooldown is active.', Math.max(1, Math.ceil((until - Date.now()) / 1000)))
}

async function projectToken(signal: AbortSignal): Promise<string> {
  const dedicated = process.env.WORKSHOP_REFERENCE_GITHUB_TOKEN?.trim()
  if (dedicated) return dedicated
  app ??= WorkshopGitHubApp.fromEnv()
  if (!app || `${app.options.repositoryOwner}/${app.options.repositoryName}` !== repository) {
    throw new WorkshopReferenceError(503, 'Project GitHub reference credentials are unavailable.')
  }
  return app.token('read', signal)
}

async function boundedJson(response: Response, limit: number, signal: AbortSignal): Promise<unknown> {
  if (!response.body) throw new Error('Missing body')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  const abort = () => { void reader.cancel().catch(() => {}) }
  signal.addEventListener('abort', abort, { once: true })
  try {
    while (true) {
      signal.throwIfAborted()
      const chunk = await reader.read()
      signal.throwIfAborted()
      if (chunk.done) return JSON.parse(Buffer.concat(chunks).toString('utf8'))
      size += chunk.value.byteLength
      if (size > limit) throw new Error('Oversized response')
      chunks.push(chunk.value)
    }
  } finally {
    signal.removeEventListener('abort', abort)
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}

/** Only public metadata for this repository. No caller headers, URLs or model configuration. */
export async function readWorkshopReference(db: PostgresDatabase, userId: string, target: string, callerSignal: AbortSignal): Promise<unknown> {
  const commit = target.startsWith('tree/') ? target.slice(5) : null
  if (target !== 'main' && (!commit || !commitPattern.test(commit))) throw new WorkshopReferenceError(400, 'Invalid reference target.')
  callerSignal.throwIfAborted()
  if (commit && !await db.prepare('SELECT commit_sha FROM workshop_reference_commits WHERE commit_sha = ? AND expires_at > ?').get(commit, Date.now())) {
    throw new WorkshopReferenceError(400, 'This reference commit has not been confirmed recently. Start a new generation attempt.')
  }
  callerSignal.throwIfAborted()
  if (commit && trees.has(commit)) return trees.get(commit)
  if (inFlight >= 3) throw new WorkshopReferenceError(429, 'Reference metadata is busy; retry shortly.', 1)
  inFlight += 1
  const signal = AbortSignal.any([callerSignal, AbortSignal.timeout(15_000)])
  try {
    const cooldown = await db.prepare('SELECT blocked_until FROM workshop_reference_cooldowns WHERE repository = ?').get<{ blocked_until: number }>(repository)
    if (cooldown && cooldown.blocked_until > Date.now()) throw cooldownError(cooldown.blocked_until)
    // Rejected user requests never spend the project's shared allowance.
    for (const [scope, subject, maximum, windowMs] of [
      ['user-minute', userId, 20, 60_000], ['user-hour', userId, 120, 3_600_000],
      ['global-minute', repository, 100, 60_000], ['global-hour', repository, 1000, 3_600_000],
    ] as const) {
      signal.throwIfAborted()
      const budget = await consumeRateLimit(db, `workshop-reference:${scope}`, subject, maximum, windowMs)
      if (!budget.allowed) throw new WorkshopReferenceError(429, 'Reference metadata request limit reached.', Math.max(1, Math.ceil((budget.resetAt - Date.now()) / 1000)))
    }
    signal.throwIfAborted()
    const token = await projectToken(signal)
    signal.throwIfAborted()
    const resource = commit ? `git/trees/${commit}?recursive=1` : 'git/ref/heads/main'
    const response = await fetch(`https://api.github.com/repos/${repository}/${resource}`, {
      method: 'GET', redirect: 'error', cache: 'no-store', signal,
      headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' },
    })
    if (!response.ok) {
      await response.body?.cancel()
      if (response.status === 429 || response.status === 403 && (response.headers.has('retry-after') || response.headers.get('x-ratelimit-remaining') === '0')) {
        const hint = response.headers.get('retry-after')
        const delay = hint && /^\d+$/.test(hint) ? Number(hint) * 1000 : hint ? Date.parse(hint) - Date.now() : 0
        const reset = Number(response.headers.get('x-ratelimit-reset')) * 1000
        throw await recordCooldown(db, Math.max(Date.now() + 60_000, Date.now() + (Number.isFinite(delay) ? delay : 0), Number.isFinite(reset) ? reset : 0))
      }
      if (response.status === 401) app?.invalidate()
      throw new WorkshopReferenceError(503, 'GitHub reference metadata is unavailable.')
    }
    const data = await boundedJson(response, commit ? 7 * 1024 * 1024 : 128 * 1024, signal) as { object?: { sha?: unknown }; tree?: unknown; truncated?: unknown }
    if (commit) {
      if (data?.truncated !== false || !Array.isArray(data.tree)) throw new Error('Incomplete tree')
      const tree: TreeEntry[] = []
      for (const entry of data.tree) {
        if (!entry || !['blob', 'tree', 'commit'].includes(entry.type) || typeof entry.path !== 'string' || typeof entry.sha !== 'string' || !commitPattern.test(entry.sha)) throw new Error('Invalid entry')
        if (entry.type !== 'blob') continue
        if (entry.size !== undefined && (!Number.isSafeInteger(entry.size) || entry.size < 0)) throw new Error('Invalid size')
        tree.push({ path: entry.path, type: 'blob', sha: entry.sha, ...(entry.size !== undefined ? { size: entry.size } : {}) })
      }
      const result = { tree, truncated: false as const }
      if (trees.size >= 4) trees.clear()
      trees.set(commit, result)
      return result
    }
    const sha = data?.object?.sha
    if (typeof sha !== 'string' || !commitPattern.test(sha)) throw new Error('Invalid commit')
    await db.prepare(`INSERT INTO workshop_reference_commits (commit_sha, expires_at) VALUES (?, ?)
      ON CONFLICT (commit_sha) DO UPDATE SET expires_at = GREATEST(workshop_reference_commits.expires_at, excluded.expires_at)`).run(sha, Date.now() + 3_600_000)
    await db.prepare('DELETE FROM workshop_reference_commits WHERE expires_at <= ?').run(Date.now())
    signal.throwIfAborted()
    return { object: { sha } }
  } catch (error) {
    if (error instanceof WorkshopReferenceError) throw error
    if (error instanceof GitHubApiError && error.status === 429) {
      const delay = Number.isFinite(error.retryAfter) ? error.retryAfter! : 60
      throw await recordCooldown(db, Date.now() + Math.max(60, delay) * 1000)
    }
    // Never expose upstream bodies, credential-bearing errors or request headers.
    throw new WorkshopReferenceError(503, 'GitHub reference metadata is unavailable.')
  } finally { inFlight -= 1 }
}
