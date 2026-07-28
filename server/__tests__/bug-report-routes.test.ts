import Database from 'better-sqlite3'
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
import { runMigrations } from '../db.ts'
import { encodeReplayFrame } from '../game/replay-codec.ts'

const FRAME_HASH = 'a'.repeat(64)
const USER: AuthUser = { id: 'u1', username: 'u1', displayName: 'User 1' }
const OTHER: AuthUser = { id: 'u2', username: 'u2', displayName: 'User 2' }

type MockResponse = ServerResponse & {
  statusCode: number
  body: string
  headers: Record<string, string>
}

let db: Database.Database
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

beforeEach(() => {
  vi.stubEnv('BUG_REPORTS_ENABLED', 'true')
  vi.stubEnv('PUBLIC_APP_ORIGIN', 'https://game.example/')
  vi.stubEnv('PUBLIC_API_BASE', 'https://api.example')
  vi.stubEnv('BUG_REPORT_GITHUB_WEBHOOK_SECRET', 'webhook-secret')
  db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
  const now = 1_700_000_000_000
  for (const user of [USER, OTHER]) {
    db.prepare(`
      INSERT INTO users (id, username, display_name, password_hash, created_at)
      VALUES (?, ?, ?, 'hash', ?)
    `).run(user.id, user.username, user.displayName, now)
  }
  db.prepare(`
    INSERT INTO rooms (
      id, created_by, state_json, status, version, created_at, updated_at
    )
    VALUES ('active-room', 'u1', '{}', 'playing', 8, ?, ?)
  `).run(now, now)
  db.prepare(`
    INSERT INTO room_players (room_id, user_id, player_index, joined_at)
    VALUES ('active-room', 'u1', 0, ?)
  `).run(now)
  db.prepare(`
    INSERT INTO game_contexts (
      room_id, lifecycle, phase, created_at, updated_at
    )
    VALUES ('active-room', 'active', 'playing', ?, ?)
  `).run(now, now)
  db.prepare(`
    INSERT INTO game_replays (
      room_id, schema_version, viewer_build_id, game_build_id, status,
      latest_step_no, created_at
    )
    VALUES ('active-room', 1, 'viewer', 'game', 'recording', 5, ?)
  `).run(now)
  db.prepare(`
    INSERT INTO game_replay_steps (
      room_id, step_no, room_version, checkpoint_step_no, player_index,
      command_type, intent_json, payload_kind, payload_gzip, frame_hash,
      created_at
    )
    VALUES ('active-room', 5, 8, 5, 0, 'test', '{}', 'checkpoint', ?, ?, ?)
  `).run(Buffer.from('frame'), FRAME_HASH, now)
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
    },
  } as never
})

afterEach(() => {
  db.close()
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

    db.prepare(`
      DELETE FROM game_replay_steps WHERE room_id = 'active-room'
    `).run()

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

  it('revokes the GitHub grant before removing the local connection', async () => {
    store.saveConnection('u1', '99', {
      accessToken: 'token',
      accessTokenExpiresAt: 1_700_003_600_000,
    })
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
    expect(store.connectionStatus('u1').connected).toBe(true)

    const removed = await invoke(
      'DELETE',
      '/api/v1/issue-submission-connection',
    )
    expect(removed.statusCode).toBe(200)
    expect(revokeUserGrant).toHaveBeenLastCalledWith('token')
    expect(store.connectionStatus('u1')).toEqual({ connected: false })
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
    expect(store.connectionStatus('u1')).toMatchObject({
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
    expect(store.getOwned(submissionId, 'u1').status).toBe('draft')
  })

  it('validates signed webhooks and revokes the matching connection', async () => {
    store.saveConnection('u1', '99', {
      accessToken: 'token',
      accessTokenExpiresAt: 1_700_003_600_000,
    })
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
    expect(store.connectionStatus('u1').connected).toBe(true)

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
    expect(store.connectionStatus('u1')).toEqual({ connected: false })

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
    db.prepare(`
      UPDATE bug_reports
      SET github_issue_number = 7, github_issue_state = 'open'
      WHERE submission_id = ?
    `).run(submissionId)
    const webhook = async (action: string, repository: string) => {
      const payload = JSON.stringify({
        action,
        issue: { number: 7 },
        repository: { full_name: repository },
      })
      return invoke(
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
      )
    }

    await webhook('closed', 'attacker/repository')
    expect((db.prepare(`
      SELECT github_issue_state AS state
      FROM bug_reports WHERE submission_id = ?
    `).get(submissionId) as { state: string }).state).toBe('open')

    await webhook('closed', 'titanxxh/open-agricola-issues')
    expect((db.prepare(`
      SELECT github_issue_state AS state
      FROM bug_reports WHERE submission_id = ?
    `).get(submissionId) as { state: string }).state).toBe('closed')

    await webhook('reopened', 'titanxxh/open-agricola-issues')
    expect((db.prepare(`
      SELECT github_issue_state AS state
      FROM bug_reports WHERE submission_id = ?
    `).get(submissionId) as { state: string }).state).toBe('open')
  })

  it('applies current replay participant tombstones to inspected evidence', async () => {
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
      engineStack: { frames: [] },
    }
    const encoded = encodeReplayFrame({
      frame,
      previousFrame: null,
      stepNo: 5,
      previousCheckpointStepNo: 5,
    })
    db.prepare(`
      UPDATE game_replay_steps
      SET payload_kind = ?, payload_gzip = ?, frame_hash = ?
      WHERE room_id = 'active-room' AND step_no = 5
    `).run(encoded.payloadKind, encoded.payloadGzip, encoded.frameHash)
    db.prepare(`
      UPDATE bug_reports SET frame_hash = ? WHERE submission_id = ?
    `).run(encoded.frameHash, submissionId)
    db.prepare(`
      UPDATE game_contexts
      SET lifecycle = 'completed', phase = NULL, replay_status = 'available'
      WHERE room_id = 'active-room'
    `).run()
    db.prepare(`
      UPDATE game_replays SET status = 'completed'
      WHERE room_id = 'active-room'
    `).run()
    db.prepare(`
      INSERT INTO game_results (
        room_id, started_at, finished_at, rounds_played, player_count,
        enable_community_deck, enable_parent_cards,
        enable_through_the_seasons, enable_farmers_of_the_moor
      ) VALUES ('active-room', 1, 2, 14, 1, 0, 0, 0, 0)
    `).run()
    db.prepare(`
      INSERT INTO game_result_players (
        room_id, player_index, game_player_id, user_id, display_name, score
      ) VALUES (
        'active-room', 0, 'p1', NULL, 'Deleted player (seat 1)', 42
      )
    `).run()

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
      players: [{ name: 'Deleted player (seat 1)' }],
      log: [{ params: { player: 'Deleted player (seat 1)' } }],
      scores: [{ playerName: 'Deleted player (seat 1)' }],
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
        submission_id, maintainer_user_id, room_id, step_no, frame_hash,
        perspective, reason, created_at
      ) VALUES (?, ?, 'active-room', 5, ?, 'reporter', 'test', ?)
    `)
    for (let index = 0; index < 30; index += 1) {
      insertAudit.run(submissionId, USER.id, FRAME_HASH, Date.now())
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
    expect((db.prepare(`
      SELECT COUNT(*) AS count FROM bug_report_evidence_audit
      WHERE maintainer_user_id = ?
    `).get(USER.id) as { count: number }).count).toBe(30)
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
    db.prepare(`
      UPDATE bug_reports SET evidence_expires_at = 0 WHERE submission_id = ?
    `).run(submissionId)

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

    db.prepare(`
      UPDATE game_contexts SET lifecycle = 'completed' WHERE room_id = 'active-room'
    `).run()
    db.prepare(`
      DELETE FROM game_replay_steps WHERE room_id = 'active-room'
    `).run()
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
