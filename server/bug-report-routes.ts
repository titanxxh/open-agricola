import type Database from 'better-sqlite3'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { AuthUser } from './auth.ts'
import { corsHeaders, getRequestOrigin } from './http-origin.ts'
import {
  BugReportDelivery,
  BugReportError,
  BugReportStore,
} from './bug-report/bug-report-store.ts'
import {
  GitHubIssueClient,
  verifyGitHubWebhook,
} from './bug-report/github-issue-client.ts'
import { decodeReplayFrame, type JsonValue } from './game/replay-codec.ts'
import type { SerializedGameState } from '../shared/session/serialization.ts'
import { filterSerializedStateForPlayer } from '../shared/session/serialization.ts'

const DRAFT_ROUTE = /^\/api\/v1\/game-contexts\/([^/]+)\/bug-reports$/
const REPORT_ROUTE = /^\/api\/v1\/bug-reports\/([^/]+)$/
const SUBMIT_ROUTE = /^\/api\/v1\/bug-reports\/([^/]+)\/submit$/
const EVIDENCE_ROUTE = /^\/api\/v1\/bug-reports\/([^/]+)\/evidence\/inspect$/
const CONNECTION_ROUTE = '/api/v1/issue-submission-connection'
const CONNECTION_START_ROUTE = '/api/v1/issue-submission-connection/github/start'
const CONNECTION_CALLBACK_ROUTE = '/api/v1/issue-submission-connection/github/callback'
const WEBHOOK_ROUTE = '/api/v1/github-app/webhook'
const MAX_BODY_BYTES = 32 * 1024
const MAX_WEBHOOK_BYTES = 1024 * 1024

type BugReportRuntime = {
  db: Database.Database
  store: BugReportStore
  delivery: BugReportDelivery | null
  github: GitHubIssueClient | null
}

type ReplayStepRow = {
  step_no: number
  checkpoint_step_no: number
  payload_kind: 'checkpoint' | 'delta'
  payload_gzip: Buffer
  frame_hash: string
}

const enabled = (): boolean =>
  process.env.BUG_REPORTS_ENABLED === '1'
  || process.env.BUG_REPORTS_ENABLED === 'true'

const headers = (): Record<string, string> => ({
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
  ...corsHeaders({
    methods: 'GET,POST,PATCH,DELETE,OPTIONS',
    headers: 'Content-Type, Authorization, X-GitHub-Event, X-Hub-Signature-256',
  }),
})

const send = (
  res: ServerResponse,
  status: number,
  payload: unknown,
): void => {
  res.writeHead(status, headers())
  res.end(JSON.stringify(payload))
}

const readRaw = (
  req: IncomingMessage,
  limit: number,
): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > limit) {
        reject(new BugReportError('request_too_large', 413))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })

const readJson = async (
  req: IncomingMessage,
): Promise<Record<string, unknown>> => {
  const body = await readRaw(req, MAX_BODY_BYTES)
  if (body.length === 0) return {}
  try {
    const value = JSON.parse(body.toString('utf8')) as unknown
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('invalid')
    }
    return value as Record<string, unknown>
  } catch {
    throw new BugReportError('invalid_json', 400)
  }
}

const requireUser = (
  res: ServerResponse,
  user: AuthUser | null,
): AuthUser => {
  if (!user) {
    send(res, 401, {
      ok: false,
      code: 'not_authenticated',
      message: 'Not authenticated',
    })
    throw new BugReportError('response_sent', 401)
  }
  return user
}

const decodeId = (raw: string): string => {
  try {
    const value = decodeURIComponent(raw)
    if (!value || value.length > 128) throw new Error('invalid')
    return value
  } catch {
    throw new BugReportError('invalid_identifier', 400)
  }
}

const assertKeys = (
  body: Record<string, unknown>,
  allowed: readonly string[],
): void => {
  const allowedKeys = new Set(allowed)
  if (Object.keys(body).some((key) => !allowedKeys.has(key))) {
    throw new BugReportError('client_authority_rejected', 400)
  }
}

const callbackUrl = (req: IncomingMessage): string => {
  const base = (
    process.env.PUBLIC_API_BASE?.trim()
    || getRequestOrigin(req)
  ).replace(/\/$/, '')
  return `${base}${CONNECTION_CALLBACK_ROUTE}`
}

const connectionReturnTo = (
  report: ReturnType<BugReportStore['getOwned']>,
  req: IncomingMessage,
): string => {
  const base = process.env.PUBLIC_APP_ORIGIN?.trim() || getRequestOrigin(req)
  const url = new URL(base)
  url.searchParams.set('context', report.roomId)
  url.searchParams.set('step', String(report.stepNo))
  url.searchParams.set('frame', report.frameHash)
  url.searchParams.set('perspective', `p${report.playerIndex + 1}`)
  url.searchParams.set('bugReport', report.submissionId)
  return url.toString()
}

const redirectConnection = (
  res: ServerResponse,
  returnTo: string,
  status: 'connected' | 'cancelled' | 'error',
): void => {
  const url = new URL(returnTo)
  url.searchParams.set('bugReportConnection', status)
  res.writeHead(302, {
    Location: url.toString(),
    'Cache-Control': 'no-store',
  })
  res.end()
}

const errorPayload = (error: BugReportError) => ({
  ok: false,
  code: error.code,
  message: error.code,
  ...(error.retryAt === undefined ? {} : { retryAt: error.retryAt }),
})

const inspectEvidence = (
  runtime: BugReportRuntime,
  submissionId: string,
  maintainer: AuthUser,
  input: Record<string, unknown>,
): unknown => {
  assertKeys(input, ['perspective', 'reason'])
  const report = runtime.store.reportForEvidence(submissionId)
  if (!report) throw new BugReportError('bug_report_not_found', 404)
  if (report.status !== 'submitted') {
    throw new BugReportError('evidence_requires_submitted_report', 409)
  }
  if (
    report.evidence_expires_at !== null
    && report.evidence_expires_at <= Date.now()
  ) {
    throw new BugReportError('replay_segment_unavailable', 503)
  }
  const perspective = input.perspective === 'open' ? 'open' : 'reporter'
  const reason = typeof input.reason === 'string' ? input.reason.trim() : ''
  if (perspective === 'open' && !reason) {
    throw new BugReportError('evidence_reason_required', 400)
  }
  const anchor = runtime.db.prepare(`
    SELECT checkpoint_step_no
    FROM game_replay_steps
    WHERE room_id = ? AND step_no = ? AND frame_hash = ?
  `).get(
    report.room_id,
    report.step_no,
    report.frame_hash,
  ) as { checkpoint_step_no: number } | undefined
  if (!anchor) throw new BugReportError('anchor_mismatch', 409)
  const rows = runtime.db.prepare(`
    SELECT step_no, checkpoint_step_no, payload_kind, payload_gzip, frame_hash
    FROM game_replay_steps
    WHERE room_id = ?
      AND checkpoint_step_no = ?
      AND step_no <= ?
    ORDER BY step_no
  `).all(
    report.room_id,
    anchor.checkpoint_step_no,
    report.step_no,
  ) as ReplayStepRow[]
  let frame: JsonValue | null = null
  try {
    for (const row of rows) {
      frame = decodeReplayFrame(frame, {
        payloadKind: row.payload_kind,
        payloadGzip: row.payload_gzip,
        checkpointStepNo: row.checkpoint_step_no,
        frameHash: row.frame_hash,
      })
    }
  } catch {
    throw new BugReportError('replay_segment_unavailable', 503)
  }
  const serialized = frame as unknown as SerializedGameState | null
  if (!serialized || rows.at(-1)?.step_no !== report.step_no) {
    throw new BugReportError('replay_segment_unavailable', 503)
  }
  const visible = perspective === 'open'
    ? serialized
    : filterSerializedStateForPlayer(
        serialized,
        serialized.players[report.player_index]?.id ?? null,
      )
  runtime.db.prepare(`
    INSERT INTO bug_report_evidence_audit (
      submission_id, maintainer_user_id, room_id, step_no, frame_hash,
      perspective, reason, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    submissionId,
    maintainer.id,
    report.room_id,
    report.step_no,
    report.frame_hash,
    perspective,
    reason || 'reporter perspective inspection',
    Date.now(),
  )
  return {
    ok: true,
    submissionId,
    roomId: report.room_id,
    stepNo: report.step_no,
    frameHash: report.frame_hash,
    perspective,
    frame: visible,
  }
}

export async function handleBugReportRoute(
  req: IncomingMessage,
  res: ServerResponse,
  runtime: BugReportRuntime | null,
  user: AuthUser | null,
  isMaintainer: boolean,
): Promise<boolean> {
  if (!req.url) return false
  const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`)
  const pathname = url.pathname
  const isBugReportPath = pathname.includes('/bug-reports')
    || pathname.startsWith('/api/v1/issue-submission-connection')
    || pathname === WEBHOOK_ROUTE
  if (!isBugReportPath) return false

  try {
    if (pathname === WEBHOOK_ROUTE && req.method === 'POST') {
      if (!runtime) throw new BugReportError('bug_report_unavailable', 503)
      const body = await readRaw(req, MAX_WEBHOOK_BYTES)
      const secret = process.env.BUG_REPORT_GITHUB_WEBHOOK_SECRET ?? ''
      const signature = typeof req.headers['x-hub-signature-256'] === 'string'
        ? req.headers['x-hub-signature-256']
        : undefined
      if (!verifyGitHubWebhook(secret, body, signature)) {
        throw new BugReportError('invalid_webhook_signature', 401)
      }
      let payload: {
        action?: string
        sender?: { id?: number | string }
      }
      try {
        const value = JSON.parse(body.toString('utf8')) as unknown
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
          throw new Error('invalid')
        }
        payload = value as typeof payload
      } catch {
        throw new BugReportError('invalid_webhook_payload', 400)
      }
      if (
        req.headers['x-github-event'] === 'github_app_authorization'
        && payload.action === 'revoked'
        && payload.sender?.id !== undefined
      ) {
        runtime.store.disconnectGithubUser(String(payload.sender.id))
      }
      send(res, 202, { ok: true })
      return true
    }

    if (pathname === CONNECTION_CALLBACK_ROUTE && req.method === 'GET') {
      if (!runtime?.github) throw new BugReportError('bug_report_unavailable', 503)
      const state = url.searchParams.get('state') ?? ''
      const consumed = runtime.store.consumeConnectionState(state)
      if (!consumed) throw new BugReportError('oauth_state_invalid', 400)
      if (url.searchParams.get('error')) {
        redirectConnection(res, consumed.returnTo, 'cancelled')
        return true
      }
      const code = url.searchParams.get('code')
      if (!code) {
        redirectConnection(res, consumed.returnTo, 'error')
        return true
      }
      try {
        const tokens = await runtime.github.exchangeCode(
          code,
          consumed.verifier,
          callbackUrl(req),
        )
        const githubUserId = await runtime.github.githubUserId(tokens.accessToken)
        runtime.store.saveConnection(consumed.userId, githubUserId, tokens)
        redirectConnection(res, consumed.returnTo, 'connected')
      } catch {
        redirectConnection(res, consumed.returnTo, 'error')
      }
      return true
    }

    if (pathname === CONNECTION_ROUTE && req.method === 'GET') {
      const current = requireUser(res, user)
      if (!runtime) {
        send(res, 200, { ok: true, enabled: false, connected: false })
        return true
      }
      send(res, 200, {
        ok: true,
        enabled: enabled() && runtime.github !== null,
        ...runtime.store.connectionStatus(current.id),
      })
      return true
    }

    if (pathname === CONNECTION_ROUTE && req.method === 'DELETE') {
      const current = requireUser(res, user)
      if (!runtime) throw new BugReportError('bug_report_unavailable', 503)
      runtime.store.disconnect(current.id)
      send(res, 200, { ok: true })
      return true
    }

    if (pathname === CONNECTION_START_ROUTE && req.method === 'GET') {
      const current = requireUser(res, user)
      if (!runtime?.github) throw new BugReportError('bug_report_unavailable', 503)
      const submissionId = url.searchParams.get('submissionId') ?? ''
      const report = runtime.store.getOwned(submissionId, current.id)
      const state = runtime.store.createConnectionState(
        current.id,
        connectionReturnTo(report, req),
      )
      res.writeHead(302, {
        Location: runtime.github.authorizationUrl({
          state: state.state,
          codeChallenge: state.codeChallenge,
          redirectUri: callbackUrl(req),
        }),
        'Cache-Control': 'no-store',
      })
      res.end()
      return true
    }

    if (!runtime) throw new BugReportError('bug_report_unavailable', 503)
    const current = requireUser(res, user)
    const draftMatch = DRAFT_ROUTE.exec(pathname)
    if (draftMatch && req.method === 'POST') {
      if (!enabled() || !runtime.github) {
        throw new BugReportError('bug_reports_disabled', 503)
      }
      const body = await readJson(req)
      assertKeys(body, ['phenomenon', 'stepNo', 'frameHash'])
      const report = runtime.store.createDraft({
        userId: current.id,
        roomId: decodeId(draftMatch[1]!),
        phenomenon: body.phenomenon,
        ...(body.stepNo === undefined ? {} : { stepNo: body.stepNo }),
        ...(body.frameHash === undefined ? {} : { frameHash: body.frameHash }),
      })
      send(res, 201, { ok: true, report })
      return true
    }

    const reportMatch = REPORT_ROUTE.exec(pathname)
    if (reportMatch && req.method === 'GET') {
      const report = runtime.store.getOwned(
        decodeId(reportMatch[1]!),
        current.id,
      )
      send(res, 200, { ok: true, report })
      return true
    }
    if (reportMatch && req.method === 'PATCH') {
      const body = await readJson(req)
      assertKeys(body, ['phenomenon', 'authorIdentity', 'confirmHosted'])
      const report = runtime.store.updateDraft(
        decodeId(reportMatch[1]!),
        current.id,
        body,
      )
      send(res, 200, { ok: true, report })
      return true
    }
    if (reportMatch && req.method === 'DELETE') {
      runtime.store.deleteDraft(decodeId(reportMatch[1]!), current.id)
      send(res, 200, { ok: true })
      return true
    }

    const submitMatch = SUBMIT_ROUTE.exec(pathname)
    if (submitMatch && req.method === 'POST') {
      const body = await readJson(req)
      assertKeys(body, [])
      const submissionId = decodeId(submitMatch[1]!)
      runtime.store.queue(submissionId, current.id)
      await runtime.delivery?.deliver(submissionId)
      const report = runtime.store.getOwned(submissionId, current.id)
      send(res, report.status === 'submitted' ? 200 : 202, {
        ok: true,
        report,
      })
      return true
    }

    const evidenceMatch = EVIDENCE_ROUTE.exec(pathname)
    if (evidenceMatch && req.method === 'POST') {
      if (!isMaintainer) throw new BugReportError('admin_required', 403)
      const body = await readJson(req)
      send(
        res,
        200,
        inspectEvidence(runtime, decodeId(evidenceMatch[1]!), current, body),
      )
      return true
    }

    send(res, 405, {
      ok: false,
      code: 'method_not_allowed',
      message: 'Method not allowed',
    })
    return true
  } catch (error) {
    if (error instanceof BugReportError && error.code === 'response_sent') {
      return true
    }
    if (error instanceof BugReportError) {
      send(res, error.status, errorPayload(error))
      return true
    }
    send(res, 500, {
      ok: false,
      code: 'bug_report_internal_error',
      message: 'Bug report request failed',
    })
    return true
  }
}
