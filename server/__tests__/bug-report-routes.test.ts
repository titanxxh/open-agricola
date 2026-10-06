import * as database from '../db'
import { createTestDatabase } from './_helpers/postgres'
import type { PostgresDatabase } from '../database/postgres'
import { createHmac } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthUser } from '../auth.ts'
import {
  BugReportDelivery,
  BugReportStore,
  TokenCipher,
  type IssueDeliveryAdapter,
} from '../bug-report/bug-report-store.ts'
import { handleBugReportRoute } from '../bug-report-routes.ts'
import { encodeReplayFrame } from '../game/replay-codec.ts'
import { resetRateLimitsForTests } from '../rate-limit.ts'

const FRAME_HASH = 'a'.repeat(64)
const USER: AuthUser = { id: 'u1', username: 'u1', displayName: 'User 1' }
const OTHER: AuthUser = { id: 'u2', username: 'u2', displayName: 'User 2' }

type MockResponse = ServerResponse & {
  statusCode: number
  body: string
  headers: Record<string, string>
}

let db: PostgresDatabase
let store: BugReportStore
let createIssue: ReturnType<typeof vi.fn>
let revokeUserGrant: ReturnType<typeof vi.fn>
let exchangeCode: ReturnType<typeof vi.fn>
let githubUserId: ReturnType<typeof vi.fn>
let runtime: Parameters<typeof handleBugReportRoute>[2]

const request = (
  method: string,
  url: string,
  body: unknown = null,
  headers: Record<string, string> = {},
): IncomingMessage => {
  const raw = body === null
    ? Buffer.alloc(0)
    : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))
  let sent = false
  const req = {
    method,
    url,
    headers: { host: 'api.example', ...headers },
    on(event: string, callback: (chunk?: Buffer) => void) {
      if (event === 'data' && raw.length > 0 && !sent) {
        sent = true
        callback(raw)
      }
      if (event === 'end') callback()
      return req
    },
    destroy() {},
  } as unknown as IncomingMessage
  return req
}

const response = (): MockResponse => {
  let statusCode = 200
  let body = ''
  const responseHeaders: Record<string, string> = {}
  return {
    get statusCode() { return statusCode },
    set statusCode(value) { statusCode = value },
    get body() { return body },
    get headers() { return responseHeaders },
    writeHead(code: number, headers?: Record<string, string>) {
      statusCode = code
      Object.assign(responseHeaders, headers ?? {})
      return this
    },
    end(value?: string) {
      body = value ?? ''
      return this
    },
  } as unknown as MockResponse
}

const invoke = async (
  method: string,
  url: string,
  body: unknown = null,
  user: AuthUser | null = USER,
  headers: Record<string, string> = {},
  isMaintainer = false,
): Promise<MockResponse> => {
  const res = response()
  await handleBugReportRoute(
    request(method, url, body, headers),
    res,
    runtime,
    user,
    isMaintainer,
  )
  return res
}

const json = (res: MockResponse) => JSON.parse(res.body) as Record<string, unknown>

beforeEach(async () => {
  vi.stubEnv('BUG_REPORTS_ENABLED', 'true')
  vi.stubEnv('PUBLIC_APP_ORIGIN', 'https://game.example/')
  vi.stubEnv('PUBLIC_API_BASE', 'https://api.example')
  vi.stubEnv('BUG_REPORT_GITHUB_WEBHOOK_SECRET', 'webhook-secret')
  db = await createTestDatabase()
  vi.spyOn(database, 'getDb').mockReturnValue(db)
  await resetRateLimitsForTests()


  const now = 1_700_000_000_000
  for (const user of [USER, OTHER]) {
    ;(await db.prepare(`
      INSERT INTO users (id, username, display_name, password_hash, created_at)
      VALUES (?, ?, ?, 'hash', ?)
    `).run(user.id, user.username, user.displayName, now))
  }
  ;(await db.prepare(`
    INSERT INTO rooms (
      id, created_by, state_json, status, version, created_at, updated_at
    )
    VALUES ('active-room', 'u1', '{}', 'playing', 8, ?, ?)
  `).run(now, now))
  ;(await db.prepare(`
    INSERT INTO room_players (room_id, user_id, player_index, joined_at)
    VALUES ('active-room', 'u1', 0, ?)
  `).run(now))
  ;(await db.prepare(`
    INSERT INTO game_contexts (
      room_id, lifecycle, phase, created_at, updated_at
    )
    VALUES ('active-room', 'active', 'playing', ?, ?)
  `).run(now, now))
  ;(await db.prepare(`
    INSERT INTO game_replays (
      room_id, schema_version, viewer_build_id, game_build_id, status,
      latest_step_no, created_at
    )
    VALUES ('active-room', 1, 'viewer', 'game', 'recording', 5, ?)
  `).run(now))
  ;(await db.prepare(`
    INSERT INTO game_replay_steps (
      room_id, step_no, room_version, checkpoint_step_no, player_index,
      command_type, intent_json, payload_kind, payload_gzip, frame_hash,
      created_at
    )
    VALUES ('active-room', 5, 8, 5, 0, 'test', '{}', 'checkpoint', ?, ?, ?)
  `).run(Buffer.from('frame'), FRAME_HASH, now))
  store = new BugReportStore(
    db,
    new TokenCipher('k1', new Map([['k1', Buffer.alloc(32, 7)]])),
    () => now,
  )
  createIssue = vi.fn(async () => ({
    ok: true as const,
    number: 7,
    url: 'https://github.com/titanxxh/open-agricola-issues/issues/7',
  }))
  revokeUserGrant = vi.fn(async () => ({ ok: true as const }))
  exchangeCode = vi.fn(async () => ({
    accessToken: 'github-user-token',
    accessTokenExpiresAt: now + 60 * 60 * 1000,
  }))
  githubUserId = vi.fn(async () => '99')
  const adapter: IssueDeliveryAdapter = {
    createIssue,
    findIssueByMarker: vi.fn(async () => ({ ok: true as const, found: false as const })),
    refreshUserToken: vi.fn(),
    revokeUserGrant,
    anonymizeIssue: vi.fn(async () => ({ ok: true as const })),
  }
  runtime = {
    db,
    store,
    delivery: new BugReportDelivery(store, adapter, 'https://game.example', () => now),
    github: {
      authorizationUrl: ({ state }: { state: string }) =>
        `https://github.test/authorize?state=${encodeURIComponent(state)}`,
      exchangeCode,
      githubUserId,
      revokeUserGrant,
    },
  } as never
})

afterEach(async () => {
  ;(await db.close())
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('bug report routes', () => {
  it('advertises and creates reports only with complete delivery configuration', async () => {
    expect(json(await invoke(
      'GET',
      '/api/v1/issue-submission-connection',
    ))).toMatchObject({ enabled: true })
    const created = await invoke(
      'POST',
      '/api/v1/game-contexts/active-room/bug-reports',
      { phenomenon: 'The game froze' },
    )
    const submissionId = (json(created).report as { submissionId: string })
      .submissionId

    vi.stubEnv('BUG_REPORT_GITHUB_WEBHOOK_SECRET', '')

    expect(json(await invoke(
      'GET',
      '/api/v1/issue-submission-connection',
    ))).toMatchObject({ enabled: false })
    expect((await invoke(
      'POST',
      '/api/v1/game-contexts/active-room/bug-reports',
      { phenomenon: 'The game froze' },
    )).statusCode).toBe(503)

    vi.stubEnv('BUG_REPORT_GITHUB_WEBHOOK_SECRET', 'webhook-secret')
    for (const origin of ['', 'not-a-url']) {
      vi.stubEnv('PUBLIC_APP_ORIGIN', origin)
      expect(json(await invoke(
        'GET',
        '/api/v1/issue-submission-connection',
      ))).toMatchObject({ enabled: false })
      expect((await invoke(
        'POST',
        '/api/v1/issue-submission-connection/github/start',
        { submissionId },
      )).statusCode).toBe(503)
      expect((await invoke(
        'POST',
        `/api/v1/bug-reports/${submissionId}/submit`,
        {},
      )).statusCode).toBe(503)
    }
  })

  it('disables reporting for a room without a replay anchor', async () => {
    expect(json(await invoke(
      'GET',
      '/api/v1/issue-submission-connection?roomId=active-room',
    ))).toMatchObject({ enabled: true })

    ;(await db.prepare(`
      DELETE FROM game_replay_steps WHERE room_id = 'active-room'
    `).run())

    expect(json(await invoke(
      'GET',
      '/api/v1/issue-submission-connection?roomId=active-room',
    ))).toMatchObject({ enabled: false })
    const created = await invoke(
      'POST',
      '/api/v1/game-contexts/active-room/bug-reports',
      { phenomenon: 'The game froze' },
    )
    expect(created.statusCode).toBe(503)
    expect(json(created)).toMatchObject({
      code: 'bug_report_anchor_unavailable',
    })
  })

  it('rejects client authority fields and fixes the active anchor on the server', async () => {
    const forged = await invoke(
      'POST',
      '/api/v1/game-contexts/active-room/bug-reports',
      { phenomenon: 'The game froze', repository: 'attacker/repo' },
    )
    expect(forged.statusCode).toBe(400)
    expect(json(forged)).toMatchObject({ code: 'client_authority_rejected' })

    const created = await invoke(
      'POST',
      '/api/v1/game-contexts/active-room/bug-reports',
      { phenomenon: 'The game froze' },
    )
    expect(created.statusCode).toBe(201)
    const report = json(created).report as {
      submissionId: string
      playerIndex: number
      roomVersion: number
      stepNo: number
      frameHash: string
    }
    expect(report).toMatchObject({
      playerIndex: 0,
      roomVersion: 8,
      stepNo: 5,
      frameHash: FRAME_HASH,
    })

    const patch = await invoke(
      'PATCH',
      `/api/v1/bug-reports/${report.submissionId}`,
      {
        authorIdentity: 'hosted',
        confirmHosted: true,
        owner: 'attacker',
      },
    )
    expect(patch.statusCode).toBe(400)
    expect(json(patch)).toMatchObject({ code: 'client_authority_rejected' })

    const foreign = await invoke(
      'GET',
      `/api/v1/bug-reports/${report.submissionId}`,
      null,
      OTHER,
    )
    expect(foreign.statusCode).toBe(403)
    expect(json(foreign)).toMatchObject({ code: 'bug_report_forbidden' })
  })

  it('rate-limits all bug-report mutations per account', async () => {
    const created = await invoke(
      'POST',
      '/api/v1/game-contexts/active-room/bug-reports',
      { phenomenon: 'The game froze' },
    )
    const submissionId = (json(created).report as { submissionId: string })
      .submissionId
    for (let index = 0; index < 59; index += 1) {
      expect((await invoke(
        'PATCH',
        `/api/v1/bug-reports/${submissionId}`,
        { phenomenon: `Problem ${index}` },
      )).statusCode).toBe(200)
    }

    const limited = await invoke(
      'PATCH',
      `/api/v1/bug-reports/${submissionId}`,
      { phenomenon: 'One mutation too many' },
    )

    expect(limited.statusCode).toBe(429)
    expect(json(limited)).toMatchObject({ code: 'bug_report_rate_limited' })
  })

  it('finishes an existing draft with the flag off and remains idempotent', async () => {
    const created = await invoke(
      'POST',
      '/api/v1/game-contexts/active-room/bug-reports',
      { phenomenon: 'The game froze' },
    )
    const submissionId = (json(created).report as { submissionId: string }).submissionId
    expect((await invoke(
      'PATCH',
      `/api/v1/bug-reports/${submissionId}`,
      { authorIdentity: 'hosted', confirmHosted: true },
    )).statusCode).toBe(200)
    vi.stubEnv('BUG_REPORTS_ENABLED', 'false')

    expect((await invoke(
      'POST',
      '/api/v1/game-contexts/active-room/bug-reports',
      { phenomenon: 'Another problem' },
    )).statusCode).toBe(503)
    expect((await invoke('GET', `/api/v1/bug-reports/${submissionId}`)).statusCode).toBe(200)
    expect((await invoke(
      'POST',
      `/api/v1/bug-reports/${submissionId}/submit`,
      { authorIdentity: 'github_user' },
    )).statusCode).toBe(400)

    const submitted = await invoke(
      'POST',
      `/api/v1/bug-reports/${submissionId}/submit`,
      {},
    )
    expect(submitted.statusCode).toBe(200)
    expect(json(submitted).report).toMatchObject({
      status: 'submitted',
      issueNumber: 7,
    })
    expect((await invoke(
      'POST',
      `/api/v1/bug-reports/${submissionId}/submit`,
      {},
    )).statusCode).toBe(200)
    expect(createIssue).toHaveBeenCalledTimes(1)
  })

  it('surfaces a matching open Issue and requires an explicit new-Issue choice', async () => {
    const first = await invoke(
      'POST',
      '/api/v1/game-contexts/active-room/bug-reports',
      { phenomenon: 'The game froze' },
    )
    const firstId = (json(first).report as { submissionId: string }).submissionId
    await invoke(
      'PATCH',
      `/api/v1/bug-reports/${firstId}`,
      { authorIdentity: 'hosted', confirmHosted: true },
    )
    await invoke('POST', `/api/v1/bug-reports/${firstId}/submit`, {})

    const second = await invoke(
      'POST',
      '/api/v1/game-contexts/active-room/bug-reports',
      { phenomenon: 'The same position is broken' },
    )
    expect(json(second).existingIssues).toEqual([{
      number: 7,
      url: 'https://github.com/titanxxh/open-agricola-issues/issues/7',
    }])
    const secondId = (json(second).report as { submissionId: string }).submissionId
    await invoke(
      'PATCH',
      `/api/v1/bug-reports/${secondId}`,
      { authorIdentity: 'hosted', confirmHosted: true },
    )

    const blocked = await invoke(
      'POST',
      `/api/v1/bug-reports/${secondId}/submit`,
      {},
    )
    expect(blocked.statusCode).toBe(409)
    expect(json(blocked)).toMatchObject({
      code: 'existing_issue_confirmation_required',
    })

    await invoke(
      'PATCH',
      `/api/v1/bug-reports/${secondId}`,
      { confirmExisting: true },
    )
    expect((await invoke(
      'POST',
      `/api/v1/bug-reports/${secondId}/submit`,
      {},
    )).statusCode).toBe(200)
    expect(createIssue).toHaveBeenCalledTimes(2)
  })

  it('removes the local connection even when GitHub revocation fails', async () => {
    ;(await store.saveConnection('u1', '99', {
      accessToken: 'token',
      accessTokenExpiresAt: 1_700_003_600_000,
    }))
    revokeUserGrant.mockResolvedValueOnce({
      ok: false,
      kind: 'uncertain',
      code: 'github_revocation_uncertain',
    })

    const failed = await invoke(
      'DELETE',
      '/api/v1/issue-submission-connection',
    )
    expect(failed.statusCode).toBe(503)
    expect((await store.connectionStatus('u1')).connected).toBe(false)

    const removed = await invoke(
      'DELETE',
      '/api/v1/issue-submission-connection',
    )
    expect(removed.statusCode).toBe(200)
    expect(revokeUserGrant).toHaveBeenCalledTimes(1)
    expect(revokeUserGrant).toHaveBeenCalledWith('token')
    expect((await store.connectionStatus('u1'))).toEqual({ connected: false })
  })

  it('queues revocation and disconnects locally when delivery is unavailable', async () => {
    ;(await store.saveConnection('u1', '99', {
      accessToken: 'token',
      accessTokenExpiresAt: 1_700_003_600_000,
    }))
    runtime = { ...runtime!, delivery: null, github: null }

    const removed = await invoke(
      'DELETE',
      '/api/v1/issue-submission-connection',
    )

    expect(removed.statusCode).toBe(200)
    expect((await store.connectionStatus('u1'))).toEqual({ connected: false })
    expect((await store.nextGrantRevocation())).toMatchObject({ accessToken: 'token' })
    expect(revokeUserGrant).not.toHaveBeenCalled()
  })

  it('finishes GitHub OAuth only from the initiating app session', async () => {
    const created = await invoke(
      'POST',
      '/api/v1/game-contexts/active-room/bug-reports',
      { phenomenon: 'The game froze' },
    )
    const submissionId = (json(created).report as { submissionId: string }).submissionId
    const start = await invoke(
      'POST',
      '/api/v1/issue-submission-connection/github/start',
      { submissionId },
    )
    expect(start.statusCode).toBe(200)
    const authorizationUrl = (json(start) as { authorizationUrl: string })
      .authorizationUrl
    const state = new URL(authorizationUrl).searchParams.get('state')
    expect(state).toBeTruthy()

    const callback = await invoke(
      'GET',
      `/api/v1/issue-submission-connection/github/callback?state=${state}&code=oauth-code`,
      null,
      null,
    )
    expect(callback.statusCode).toBe(302)
    const returnTo = new URL(callback.headers.Location)
    expect(returnTo.origin).toBe('https://game.example')
    expect(returnTo.searchParams.get('bugReport')).toBe(submissionId)
    expect(returnTo.searchParams.get('bugReportConnection')).toBe('pending')
    const handoff = new URLSearchParams(returnTo.hash.slice(1))
    expect(handoff.get('bugReportOAuthState')).toBe(state)
    expect(handoff.get('bugReportOAuthCode')).toBe('oauth-code')
    expect(exchangeCode).not.toHaveBeenCalled()

    const stolen = await invoke(
      'POST',
      '/api/v1/issue-submission-connection/github/complete',
      { state, code: 'oauth-code' },
      OTHER,
    )
    expect(stolen.statusCode).toBe(400)
    expect(json(stolen)).toMatchObject({ code: 'oauth_state_invalid' })
    expect(exchangeCode).not.toHaveBeenCalled()

    const completed = await invoke(
      'POST',
      '/api/v1/issue-submission-connection/github/complete',
      { state, code: 'oauth-code' },
    )
    expect(completed.statusCode).toBe(200)
    expect(json(completed)).toMatchObject({
      connected: true,
      githubUserId: '99',
    })
    expect(exchangeCode).toHaveBeenCalledWith(
      'oauth-code',
      expect.any(String),
      'https://api.example/api/v1/issue-submission-connection/github/callback',
    )
    expect((await store.connectionStatus('u1'))).toMatchObject({
      connected: true,
      githubUserId: '99',
    })

    const replayed = await invoke(
      'POST',
      '/api/v1/issue-submission-connection/github/complete',
      { state, code: 'oauth-code' },
    )
    expect(replayed.statusCode).toBe(400)
    expect(json(replayed)).toMatchObject({ code: 'oauth_state_invalid' })
  })

  it('revokes a replacement grant instead of overwriting another GitHub identity', async () => {
    ;(await store.saveConnection(USER.id, '99', {
      accessToken: 'existing-token',
      accessTokenExpiresAt: 1_700_003_600_000,
    }))
    const created = await invoke(
      'POST',
      '/api/v1/game-contexts/active-room/bug-reports',
      { phenomenon: 'The game froze' },
    )
    const submissionId = (json(created).report as { submissionId: string })
      .submissionId
    const start = await invoke(
      'POST',
      '/api/v1/issue-submission-connection/github/start',
      { submissionId },
    )
    const state = new URL(
      (json(start) as { authorizationUrl: string }).authorizationUrl,
    ).searchParams.get('state')
    exchangeCode.mockResolvedValueOnce({
      accessToken: 'replacement-token',
      accessTokenExpiresAt: 1_700_003_600_000,
    })
    githubUserId.mockResolvedValueOnce('100')

    const completed = await invoke(
      'POST',
      '/api/v1/issue-submission-connection/github/complete',
      { state, code: 'oauth-code' },
    )

    expect(completed.statusCode).toBe(502)
    expect(json(completed)).toMatchObject({ code: 'github_connection_failed' })
    expect(revokeUserGrant).toHaveBeenCalledWith('replacement-token')
    expect((await store.connectionTokens(USER.id))).toMatchObject({
      githubUserId: '99',
      accessToken: 'existing-token',
    })
  })

  it('preserves a draft when GitHub connection authorization is cancelled', async () => {
    const created = await invoke(
      'POST',
      '/api/v1/game-contexts/active-room/bug-reports',
      { phenomenon: 'The game froze' },
    )
    const submissionId = (json(created).report as { submissionId: string }).submissionId
    const start = await invoke(
      'POST',
      '/api/v1/issue-submission-connection/github/start',
      { submissionId },
    )
    const state = new URL(
      (json(start) as { authorizationUrl: string }).authorizationUrl,
    ).searchParams.get('state')

    const cancelled = await invoke(
      'GET',
      `/api/v1/issue-submission-connection/github/callback?state=${state}&error=access_denied`,
      null,
      null,
    )

    expect(cancelled.statusCode).toBe(302)
    expect(new URL(cancelled.headers.Location).searchParams.get(
      'bugReportConnection',
    )).toBe('cancelled')
    expect((await store.getOwned(submissionId, 'u1')).status).toBe('draft')
  })

  it('revokes a GitHub grant when account deletion wins OAuth completion', async () => {
    const created = await invoke(
      'POST',
      '/api/v1/game-contexts/active-room/bug-reports',
      { phenomenon: 'The game froze' },
    )
    const submissionId = (json(created).report as { submissionId: string }).submissionId
    const start = await invoke(
      'POST',
      '/api/v1/issue-submission-connection/github/start',
      { submissionId },
    )
    const state = new URL(
      (json(start) as { authorizationUrl: string }).authorizationUrl,
    ).searchParams.get('state')
    exchangeCode.mockImplementationOnce(async () => {
      const now = Date.now()
      ;(await db.prepare(`
        INSERT INTO account_deletion_requests (
          user_id, requested_at, next_attempt_at, last_error_code
        ) VALUES (?, ?, ?, NULL)
      `).run(USER.id, now, now))
      return {
        accessToken: 'late-token',
        accessTokenExpiresAt: now + 3_600_000,
      }
    })
    revokeUserGrant.mockResolvedValueOnce({
      ok: false,
      kind: 'uncertain',
      code: 'github_revocation_uncertain',
    })

    const completed = await invoke(
      'POST',
      '/api/v1/issue-submission-connection/github/complete',
      { state, code: 'oauth-code' },
    )

    expect(completed.statusCode).toBe(502)
    expect(json(completed)).toMatchObject({ code: 'github_connection_failed' })
    expect(revokeUserGrant).toHaveBeenCalledWith('late-token')
    expect((await store.connectionStatus(USER.id))).toEqual({ connected: false })
    expect((await db.prepare(`
      SELECT COUNT(*) AS count FROM github_grant_revocations
    `).get())).toEqual({ count: 1 })

    ;(await db.prepare(`
      UPDATE github_grant_revocations SET next_attempt_at = 0
    `).run())
    revokeUserGrant.mockResolvedValueOnce({ ok: true })
    await runtime?.delivery?.retryGrantRevocation()

    expect((await db.prepare(`
      SELECT COUNT(*) AS count FROM github_grant_revocations
    `).get())).toEqual({ count: 0 })
  })

  it('validates signed webhooks and revokes the matching connection', async () => {
    ;(await store.saveConnection('u1', '99', {
      accessToken: 'token',
      accessTokenExpiresAt: 1_700_003_600_000,
    }))
    const payload = JSON.stringify({
      action: 'revoked',
      sender: { id: 99 },
    })
    expect((await invoke(
      'POST',
      '/api/v1/github-app/webhook',
      payload,
      null,
      {
        'x-github-event': 'github_app_authorization',
        'x-hub-signature-256': 'sha256=00',
      },
    )).statusCode).toBe(401)
    expect((await store.connectionStatus('u1')).connected).toBe(true)

    const signature = `sha256=${createHmac('sha256', 'webhook-secret')
      .update(payload)
      .digest('hex')}`
    const revoked = await invoke(
      'POST',
      '/api/v1/github-app/webhook',
      payload,
      null,
      {
        'x-github-event': 'github_app_authorization',
        'x-hub-signature-256': signature,
      },
    )
    expect(revoked.statusCode).toBe(202)
    expect((await store.connectionStatus('u1'))).toEqual({ connected: false })

    const invalidPayload = '{'
    const invalidPayloadSignature = `sha256=${createHmac('sha256', 'webhook-secret')
      .update(invalidPayload)
      .digest('hex')}`
    const malformed = await invoke(
      'POST',
      '/api/v1/github-app/webhook',
      invalidPayload,
      null,
      {
        'x-github-event': 'github_app_authorization',
        'x-hub-signature-256': invalidPayloadSignature,
      },
    )
    expect(malformed.statusCode).toBe(400)
    expect(json(malformed)).toMatchObject({ code: 'invalid_webhook_payload' })
  })

  it('tracks open and closed Issues only for the fixed issues repository', async () => {
    const created = await invoke(
      'POST',
      '/api/v1/game-contexts/active-room/bug-reports',
      { phenomenon: 'The game froze' },
    )
    const submissionId = (json(created).report as { submissionId: string })
      .submissionId
    ;(await db.prepare(`
      UPDATE bug_reports
      SET github_issue_number = 7, github_issue_state = 'open'
      WHERE submission_id = ?
    `).run(submissionId))
    const webhook = async (action: string, repository: string) => {
      const payload = JSON.stringify({
        action,
        issue: { number: 7 },
        repository: { full_name: repository },
      })
      return (await invoke(
        'POST',
        '/api/v1/github-app/webhook',
        payload,
        null,
        {
          'x-github-event': 'issues',
          'x-hub-signature-256': `sha256=${createHmac(
            'sha256',
            'webhook-secret',
          ).update(payload).digest('hex')}`,
        },
      ))
    }

    await webhook('closed', 'attacker/repository')
    expect(((await db.prepare(`
      SELECT github_issue_state AS state
      FROM bug_reports WHERE submission_id = ?
    `).get(submissionId)) as { state: string }).state).toBe('open')

    await webhook('closed', 'titanxxh/open-agricola-issues')
    expect(((await db.prepare(`
      SELECT github_issue_state AS state
      FROM bug_reports WHERE submission_id = ?
    `).get(submissionId)) as { state: string }).state).toBe('closed')

    await webhook('reopened', 'titanxxh/open-agricola-issues')
    expect(((await db.prepare(`
      SELECT github_issue_state AS state
      FROM bug_reports WHERE submission_id = ?
    `).get(submissionId)) as { state: string }).state).toBe('open')

    await webhook('deleted', 'titanxxh/open-agricola-issues')
    expect(((await db.prepare(`
      SELECT github_issue_state AS state
      FROM bug_reports WHERE submission_id = ?
    `).get(submissionId)) as { state: string }).state).toBe('deleted')

    await webhook('reopened', 'titanxxh/open-agricola-issues')
    expect(((await db.prepare(`
      SELECT github_issue_state AS state
      FROM bug_reports WHERE submission_id = ?
    `).get(submissionId)) as { state: string }).state).toBe('deleted')
    expect((await store.reporterDeletionPlan('u1')).issueNumbers).toEqual([])
  })

  it('applies participant tombstones and retains the evidence auditor identity', async () => {
    const created = await invoke(
      'POST',
      '/api/v1/game-contexts/active-room/bug-reports',
      { phenomenon: 'The game froze' },
    )
    const submissionId = (json(created).report as { submissionId: string }).submissionId
    await invoke(
      'PATCH',
      `/api/v1/bug-reports/${submissionId}`,
      { authorIdentity: 'hosted', confirmHosted: true },
    )
    await invoke('POST', `/api/v1/bug-reports/${submissionId}/submit`, {})
    const frame = {
      round: 1,
      players: [{
        id: 'p1',
        name: 'Original Name',
        minorHand: ['A'],
        occupationHand: ['B'],
        cardStates: {
          B003_Moonshine: { privateData: { occ: 'OWN_SECRET_OCC' }, extraData: { internal: 'BUG_INTERNAL_SENTINEL' } },
        },
        stats: {
          draftHistory: [{ cardId: 'A', draftTurn: 1 }],
        },
      }, {
        id: 'p2',
        name: 'Other Name',
        minorHand: ['C'],
        occupationHand: ['D'],
        cardStates: {
          B003_Moonshine: { privateData: { occ: 'SECRET_OCC' }, extraData: { internal: 'BUG_INTERNAL_SENTINEL' } },
          B068_Beanfield: {
            extraData: {
              cardFieldStacks: [{ crop: 'vegetable', remaining: 2 }],
            },
          },
        },
        cardStatePresentation: { B068_Beanfield: { cropLayers: [{ stack: { kind: 'vegetable', remaining: 2 }, slotIndex: 0, top: true }] } },
        stats: {
          draftHistory: [{ cardId: 'C', draftTurn: 1 }],
        },
      }],
      log: [{
        key: 'log.test',
        playerId: 'p1',
        params: { player: 'Original Name' },
      }],
      scores: [{
        playerId: 'p1',
        playerName: 'Original Name',
        total: 42,
      }],
      events: [],
      publicEventArchive: [],
      roundActionOrder: [],
      futureMeeples: [],
      ordinaryCardDecks: { occupation: [], minor: [] },
      ordinaryCardDrawChoices: {},
      engineStack: { frames: [] },
    }
    const encoded = encodeReplayFrame({
      frame,
      previousFrame: null,
      stepNo: 5,
      previousCheckpointStepNo: 5,
    })
    ;(await db.prepare(`
      INSERT INTO room_players (room_id, user_id, player_index, joined_at)
      VALUES ('active-room', ?, 1, ?)
    `).run(OTHER.id, Date.now()))
    ;(await db.prepare(`
      UPDATE game_replay_steps
      SET payload_kind = ?, payload_gzip = ?, frame_hash = ?
      WHERE room_id = 'active-room' AND step_no = 5
    `).run(encoded.payloadKind, encoded.payloadGzip, encoded.frameHash))
    const customCards = [{
      cardType: 'minor',
      cardJson: {
        id: 'CUSTOM_1',
        name: 'Custom',
        deck: 'X',
        number: 1,
      },
      artUrl: `/replay-assets/${'f'.repeat(64)}`,
    }]
    ;(await db.prepare(`
      UPDATE game_replays
      SET custom_cards_json = ?
      WHERE room_id = 'active-room'
    `).run(JSON.stringify(customCards)))
    ;(await db.prepare(`
      UPDATE bug_reports
      SET frame_hash = ?, evidence_expires_at = ?
      WHERE submission_id = ?
    `).run(encoded.frameHash, Date.now() + 60_000, submissionId))
    ;(await db.prepare("DELETE FROM rooms WHERE id = 'active-room'").run())
    ;(await db.prepare(`
      UPDATE game_context_participants
      SET user_id = NULL
      WHERE room_id = 'active-room' AND player_index = 0
    `).run())

    const reporterInspected = await invoke(
      'POST',
      `/api/v1/bug-reports/${submissionId}/evidence/inspect`,
      { perspective: 'reporter' },
      USER,
      {},
      true,
    )
    expect(reporterInspected.statusCode).toBe(200)
    const reporterFrame = json(reporterInspected).frame as {
      players: Array<{ cardStates: Record<string, { extraData?: unknown; privateData?: unknown }> }>
    }
    expect(reporterFrame.players[0]!.cardStates.B003_Moonshine?.privateData)
      .toEqual({ occ: 'OWN_SECRET_OCC' })
    expect(reporterFrame.players[1]!.cardStates.B003_Moonshine?.privateData)
      .toBeUndefined()
    expect(reporterFrame.players[1]!.cardStates.B068_Beanfield).toBeUndefined()
    expect(JSON.stringify(reporterFrame).includes('BUG_INTERNAL_SENTINEL')).toBe(false)
    expect(json(reporterInspected).frame).toMatchObject({ players: [ {}, { cardStatePresentation: {
      B068_Beanfield: { cropLayers: [{ stack: { kind: 'vegetable', remaining: 2 }, slotIndex: 0, top: true }] },
    } } ] })

    const participantRead = await invoke(
      'GET',
      `/api/v1/game-contexts/active-room/evidence/5?frame=${encoded.frameHash}`,
      null,
      OTHER,
    )
    expect(participantRead.statusCode).toBe(200)
    expect(json(participantRead)).toMatchObject({
      kind: 'reportedEvidence',
      roomId: 'active-room',
      stepNo: 5,
      frameHash: encoded.frameHash,
      perspective: 'p2',
      customCards,
    })
    const participantFrame = json(participantRead).frame as {
      players: Array<{
        cardStates: Record<string, { extraData?: unknown; privateData?: unknown }>
        stats: { draftHistory: Array<{ cardId: string }> }
      }>
    }
    expect(participantFrame.players[0]!.cardStates.B003_Moonshine?.privateData)
      .toBeUndefined()
    expect(participantFrame.players[1]!.cardStates.B003_Moonshine?.privateData)
      .toEqual({ occ: 'SECRET_OCC' })
    expect(participantFrame.players[0]!.stats.draftHistory[0]!.cardId).toBe('?')
    expect(participantFrame.players[1]!.stats.draftHistory[0]!.cardId).toBe('C')

    const inspected = await invoke(
      'POST',
      `/api/v1/bug-reports/${submissionId}/evidence/inspect`,
      { perspective: 'open', reason: 'Investigating reported state' },
      USER,
      {},
      true,
    )

    expect(inspected.statusCode).toBe(200)
    expect(json(inspected).frame).toMatchObject({
      players: [
        { name: 'Deleted player (seat 1)' },
        { name: 'Other Name' },
      ],
      log: [{ params: { player: 'Deleted player (seat 1)' } }],
      scores: [{ playerName: 'Deleted player (seat 1)' }],
    })
    expect((json(inspected).frame as {
      players: Array<{ cardStates: Record<string, { extraData?: unknown; privateData?: unknown }> }>
    }).players[1]!.cardStates.B003_Moonshine?.privateData)
      .toEqual({ occ: 'SECRET_OCC' })
    ;(await db.prepare(`
      DELETE FROM game_context_participants WHERE room_id = 'active-room'
    `).run())
    const legacyInspected = await invoke(
      'POST',
      `/api/v1/bug-reports/${submissionId}/evidence/inspect`,
      { perspective: 'open', reason: 'Inspecting legacy retained evidence' },
      USER,
      {},
      true,
    )
    expect(json(legacyInspected).frame).toMatchObject({
      players: [
        { name: 'Deleted player (seat 1)' },
        { name: 'Deleted player (seat 2)' },
      ],
    })
    ;(await db.prepare('DELETE FROM users WHERE id = ?').run(USER.id))
    expect((await db.prepare(`
      SELECT maintainer_user_id, maintainer_identity
      FROM bug_report_evidence_audit
      WHERE submission_id = ?
    `).get(submissionId))).toEqual({
      maintainer_user_id: null,
      maintainer_identity: USER.id,
    })
  })

  it('rate-limits maintainer evidence inspection before replay decoding', async () => {
    const created = await invoke(
      'POST',
      '/api/v1/game-contexts/active-room/bug-reports',
      { phenomenon: 'The game froze' },
    )
    const submissionId = (json(created).report as { submissionId: string }).submissionId
    await invoke(
      'PATCH',
      `/api/v1/bug-reports/${submissionId}`,
      { authorIdentity: 'hosted', confirmHosted: true },
    )
    await invoke('POST', `/api/v1/bug-reports/${submissionId}/submit`, {})
    const insertAudit = db.prepare(`
      INSERT INTO bug_report_evidence_audit (
        submission_id, maintainer_user_id, maintainer_identity, room_id,
        step_no, frame_hash, perspective, reason, created_at
      ) VALUES (?, ?, ?, 'active-room', 5, ?, 'reporter', 'test', ?)
    `)
    for (let index = 0; index < 30; index += 1) {
      ;(await insertAudit.run(submissionId, USER.id, USER.id, FRAME_HASH, Date.now()))
    }

    const inspected = await invoke(
      'POST',
      `/api/v1/bug-reports/${submissionId}/evidence/inspect`,
      { perspective: 'reporter' },
      USER,
      {},
      true,
    )

    expect(inspected.statusCode).toBe(429)
    expect(json(inspected)).toMatchObject({ code: 'rate_limited' })
    expect(((await db.prepare(`
      SELECT COUNT(*) AS count FROM bug_report_evidence_audit
      WHERE maintainer_user_id = ?
    `).get(USER.id)) as { count: number }).count).toBe(30)
  })

  it('expires evidence only while the game context remains active', async () => {
    const created = await invoke(
      'POST',
      '/api/v1/game-contexts/active-room/bug-reports',
      { phenomenon: 'The game froze' },
    )
    const submissionId = (json(created).report as { submissionId: string }).submissionId
    await invoke(
      'PATCH',
      `/api/v1/bug-reports/${submissionId}`,
      { authorIdentity: 'hosted', confirmHosted: true },
    )
    await invoke('POST', `/api/v1/bug-reports/${submissionId}/submit`, {})
    ;(await db.prepare(`
      UPDATE bug_reports SET evidence_expires_at = 0 WHERE submission_id = ?
    `).run(submissionId))

    const inspected = await invoke(
      'POST',
      `/api/v1/bug-reports/${submissionId}/evidence/inspect`,
      { perspective: 'reporter' },
      USER,
      {},
      true,
    )

    expect(inspected.statusCode).toBe(503)
    expect(json(inspected)).toMatchObject({ code: 'replay_segment_unavailable' })

    ;(await db.prepare(`
      UPDATE game_contexts SET lifecycle = 'completed' WHERE room_id = 'active-room'
    `).run())
    ;(await db.prepare(`
      DELETE FROM game_replay_steps WHERE room_id = 'active-room'
    `).run())
    const completed = await invoke(
      'POST',
      `/api/v1/bug-reports/${submissionId}/evidence/inspect`,
      { perspective: 'reporter' },
      USER,
      {},
      true,
    )

    expect(completed.statusCode).toBe(409)
    expect(json(completed)).toMatchObject({ code: 'anchor_mismatch' })
  })
})
