import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runMigrations } from '../db.ts'
import {
  BugReportDelivery,
  BugReportError,
  BugReportStore,
  TokenCipher,
  type IssueDeliveryAdapter,
} from '../bug-report/bug-report-store.ts'

const ACTIVE_HASH = 'a'.repeat(64)
const COMPLETED_HASH = 'b'.repeat(64)
const ISSUE_URL = 'https://github.com/titanxxh/open-agricola-issues/issues/7'

let db: Database.Database
let now: number
let store: BugReportStore

const insertUser = (id: string): void => {
  db.prepare(`
    INSERT INTO users (id, username, display_name, password_hash, created_at)
    VALUES (?, ?, ?, 'hash', ?)
  `).run(id, id, id, now)
}

const insertContext = (
  lifecycle: 'active' | 'completed',
  userId = 'u1',
): string => {
  const roomId = `${lifecycle}-room`
  if (lifecycle === 'active') {
    db.prepare(`
      INSERT INTO rooms (
        id, created_by, state_json, status, version, created_at, updated_at
      )
      VALUES (?, ?, '{}', 'playing', 8, ?, ?)
    `).run(roomId, userId, now, now)
    db.prepare(`
      INSERT INTO room_players (room_id, user_id, player_index, joined_at)
      VALUES (?, ?, 0, ?)
    `).run(roomId, userId, now)
  } else {
    db.prepare(`
      INSERT INTO game_results (
        room_id, started_at, finished_at, rounds_played, player_count,
        enable_community_deck, enable_parent_cards,
        enable_through_the_seasons, enable_farmers_of_the_moor
      )
      VALUES (?, ?, ?, 14, 2, 0, 0, 0, 0)
    `).run(roomId, now - 1_000, now)
    db.prepare(`
      INSERT INTO game_result_players (
        room_id, player_index, game_player_id, user_id, display_name, score
      )
      VALUES (?, 1, 'p2', ?, 'Player 2', 42)
    `).run(roomId, userId)
  }
  db.prepare(`
    INSERT INTO game_contexts (
      room_id, lifecycle, phase, replay_status, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    roomId,
    lifecycle,
    lifecycle === 'active' ? 'playing' : null,
    lifecycle === 'completed' ? 'available' : null,
    now,
    now,
  )
  db.prepare(`
    INSERT INTO game_replays (
      room_id, schema_version, viewer_build_id, game_build_id, status,
      latest_step_no, created_at, completed_at
    )
    VALUES (?, 1, 'viewer', 'game', ?, ?, ?, ?)
  `).run(
    roomId,
    lifecycle === 'active' ? 'recording' : 'completed',
    lifecycle === 'active' ? 5 : 12,
    now,
    lifecycle === 'completed' ? now : null,
  )
  db.prepare(`
    INSERT INTO game_replay_steps (
      room_id, step_no, room_version, checkpoint_step_no, player_index,
      command_type, intent_json, payload_kind, payload_gzip, frame_hash,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, 'test', '{}', 'checkpoint', ?, ?, ?)
  `).run(
    roomId,
    lifecycle === 'active' ? 5 : 12,
    lifecycle === 'active' ? 8 : 21,
    lifecycle === 'active' ? 5 : 12,
    lifecycle === 'active' ? 0 : 1,
    Buffer.from('frame'),
    lifecycle === 'active' ? ACTIVE_HASH : COMPLETED_HASH,
    now,
  )
  return roomId
}

const expectBugReportError = (
  action: () => unknown,
  code: string,
  status: number,
): void => {
  try {
    action()
    throw new Error('expected BugReportError')
  } catch (error) {
    expect(error).toBeInstanceOf(BugReportError)
    expect(error).toMatchObject({ code, status })
  }
}

const successAdapter = (): IssueDeliveryAdapter => ({
  createIssue: vi.fn(async () => ({
    ok: true as const,
    number: 7,
    url: ISSUE_URL,
  })),
  findIssueByMarker: vi.fn(async () => ({ ok: true as const, found: false as const })),
  refreshUserToken: vi.fn(async () => ({
    accessToken: 'refreshed',
    accessTokenExpiresAt: now + 3_600_000,
  })),
  revokeUserGrant: vi.fn(async () => ({ ok: true as const })),
  anonymizeIssue: vi.fn(async () => ({ ok: true as const })),
})

beforeEach(() => {
  db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
  now = 1_700_000_000_000
  store = new BugReportStore(
    db,
    new TokenCipher('k1', new Map([['k1', Buffer.alloc(32, 7)]])),
    () => now,
  )
  insertUser('u1')
  insertUser('u2')
})

afterEach(() => {
  db.close()
})

describe('BugReportStore', () => {
  it('fixes active-game evidence to the reporter and latest server anchor', () => {
    const roomId = insertContext('active')
    const report = store.createDraft({
      userId: 'u1',
      roomId,
      phenomenon: '  The game froze  ',
    })

    expect(report).toMatchObject({
      roomId,
      reporterUserId: 'u1',
      playerIndex: 0,
      lifecycle: 'active',
      roomVersion: 8,
      stepNo: 5,
      frameHash: ACTIVE_HASH,
      phenomenon: 'The game froze',
    })
    expectBugReportError(
      () => store.createDraft({
        userId: 'u1',
        roomId,
        phenomenon: 'Forged anchor',
        stepNo: 5,
        frameHash: ACTIVE_HASH,
      }),
      'anchor_mismatch',
      409,
    )
    expectBugReportError(
      () => store.createDraft({
        userId: 'u2',
        roomId,
        phenomenon: 'Not my game',
      }),
      'not_participant',
      403,
    )
  })

  it('requires an exact archived anchor and original participant for completed games', () => {
    const roomId = insertContext('completed')
    const report = store.createDraft({
      userId: 'u1',
      roomId,
      phenomenon: 'The score changed',
      stepNo: 12,
      frameHash: COMPLETED_HASH,
    })

    expect(report).toMatchObject({
      playerIndex: 1,
      roomVersion: 21,
      stepNo: 12,
      frameHash: COMPLETED_HASH,
    })
    expectBugReportError(
      () => store.createDraft({
        userId: 'u1',
        roomId,
        phenomenon: 'Wrong frame',
        stepNo: 12,
        frameHash: ACTIVE_HASH,
      }),
      'not_participant',
      403,
    )
    expectBugReportError(
      () => store.createDraft({
        userId: 'u2',
        roomId,
        phenomenon: 'Not my game',
        stepNo: 12,
        frameHash: COMPLETED_HASH,
      }),
      'not_participant',
      403,
    )
  })

  it('validates one Unicode phenomenon sentence up to 2000 code points', () => {
    const roomId = insertContext('active')
    expectBugReportError(
      () => store.createDraft({ userId: 'u1', roomId, phenomenon: '   ' }),
      'phenomenon_required',
      400,
    )
    expectBugReportError(
      () => store.createDraft({
        userId: 'u1',
        roomId,
        phenomenon: '界'.repeat(2001),
      }),
      'phenomenon_too_long',
      400,
    )
    expect(store.createDraft({
      userId: 'u1',
      roomId,
      phenomenon: '界'.repeat(2000),
    }).phenomenon).toHaveLength(2000)
  })

  it('limits each user to five unfinished drafts', () => {
    const roomId = insertContext('active')
    const drafts = Array.from({ length: 5 }, (_, index) =>
      store.createDraft({
        userId: 'u1',
        roomId,
        phenomenon: `Problem ${index}`,
      }))

    expectBugReportError(
      () => store.createDraft({
        userId: 'u1',
        roomId,
        phenomenon: 'One draft too many',
      }),
      'bug_report_draft_limit',
      429,
    )

    store.deleteDraft(drafts[0]!.submissionId, 'u1')
    expect(store.createDraft({
      userId: 'u1',
      roomId,
      phenomenon: 'Replacement draft',
    }).status).toBe('draft')
  })

  it('encrypts GitHub tokens and one-time PKCE state at rest', () => {
    store.saveConnection('u1', '99', {
      accessToken: 'access-secret',
      accessTokenExpiresAt: now + 3_600_000,
      refreshToken: 'refresh-secret',
      refreshTokenExpiresAt: now + 86_400_000,
    })

    const raw = db.prepare(`
      SELECT access_token_ciphertext, refresh_token_ciphertext
      FROM issue_submission_connections WHERE user_id = 'u1'
    `).get() as {
      access_token_ciphertext: Buffer
      refresh_token_ciphertext: Buffer
    }
    expect(raw.access_token_ciphertext.toString()).not.toContain('access-secret')
    expect(raw.refresh_token_ciphertext.toString()).not.toContain('refresh-secret')
    expect(store.connectionTokens('u1')).toEqual({
      accessToken: 'access-secret',
      accessTokenExpiresAt: now + 3_600_000,
      refreshToken: 'refresh-secret',
      refreshTokenExpiresAt: now + 86_400_000,
    })
    expectBugReportError(
      () => store.saveConnection('u2', '99', {
        accessToken: 'other',
        accessTokenExpiresAt: now + 3_600_000,
      }),
      'github_identity_already_connected',
      409,
    )

    const connection = store.createConnectionState('u1', '/resume')
    expect(store.consumeConnectionState(connection.state, 'u2')).toBeNull()
    const consumed = store.consumeConnectionState(connection.state, 'u1')
    expect(consumed).toMatchObject({ userId: 'u1', returnTo: '/resume' })
    expect(consumed?.verifier).not.toBe(connection.state)
    expect(store.consumeConnectionState(connection.state, 'u1')).toBeNull()
    expect(JSON.stringify(db.prepare(`
      SELECT * FROM oauth_states
    `).get())).not.toContain(consumed?.verifier)
  })

  it('keeps only one live bug-report OAuth state per user and prunes stale states', () => {
    const used = store.createConnectionState('u1', '/used')
    expect(store.consumeConnectionState(used.state, 'u1')).not.toBeNull()
    const expired = store.createConnectionState('u2', '/expired')
    now += 10 * 60_000 + 1

    const replaced = store.createConnectionState('u1', '/replaced')
    const current = store.createConnectionState('u1', '/current')

    expect(store.consumeConnectionState(expired.state, 'u2')).toBeNull()
    expect(store.consumeConnectionState(replaced.state, 'u1')).toBeNull()
    expect(store.consumeConnectionState(current.state, 'u1'))
      .toMatchObject({ returnTo: '/current' })
    expect(db.prepare(`
      SELECT COUNT(*) AS count FROM oauth_states
    `).get()).toEqual({ count: 1 })
  })

  it('submits once through the hosted identity and stores no phenomenon afterward', async () => {
    const roomId = insertContext('active')
    const report = store.createDraft({
      userId: 'u1',
      roomId,
      phenomenon: '@alice UI\u0001 froze after taking wood',
    })
    expectBugReportError(
      () => store.updateDraft(report.submissionId, 'u1', {
        authorIdentity: 'hosted',
      }),
      'hosted_identity_confirmation_required',
      400,
    )
    store.updateDraft(report.submissionId, 'u1', {
      authorIdentity: 'hosted',
      confirmHosted: true,
    })
    store.queue(report.submissionId, 'u1')
    const adapter = successAdapter()
    const delivery = new BugReportDelivery(store, adapter, 'https://game.example/replay', () => now)

    await delivery.deliver(report.submissionId)
    store.queue(report.submissionId, 'u1')
    await delivery.deliver(report.submissionId)

    expect(adapter.createIssue).toHaveBeenCalledTimes(1)
    expect(adapter.createIssue).toHaveBeenCalledWith(
      'hosted',
      expect.objectContaining({
        title: 'Game bug: @\u200Balice UI froze after taking wood',
        body: expect.stringContaining(`Room ID: \`${roomId}\``),
      }),
      undefined,
    )
    const issue = vi.mocked(adapter.createIssue).mock.calls[0]![1]
    expect(issue.body).toContain('Reporter site ID: `u1`')
    expect(issue.body).toContain('Reporter seat: `p1`')
    expect(issue.body).toContain(`<!-- open-agricola-report:${report.submissionId} -->`)
    expect(issue.body).not.toContain('\u0001')
    expect(store.getOwned(report.submissionId, 'u1')).toMatchObject({
      status: 'submitted',
      phenomenon: null,
      issueNumber: 7,
      issueUrl: ISSUE_URL,
    })
  })

  it('requires and uses the reporter GitHub connection without hosted fallback', async () => {
    const roomId = insertContext('active')
    const report = store.createDraft({
      userId: 'u1',
      roomId,
      phenomenon: 'Action did not resolve',
    })
    expectBugReportError(
      () => store.updateDraft(report.submissionId, 'u1', {
        authorIdentity: 'github_user',
        confirmGitHub: true,
      }),
      'github_connection_required',
      409,
    )
    store.saveConnection('u1', '99', {
      accessToken: 'user-token',
      accessTokenExpiresAt: now + 3_600_000,
    })
    expectBugReportError(
      () => store.updateDraft(report.submissionId, 'u1', {
        authorIdentity: 'github_user',
      }),
      'github_identity_confirmation_required',
      400,
    )
    store.updateDraft(report.submissionId, 'u1', {
      authorIdentity: 'github_user',
      confirmGitHub: true,
    })
    store.queue(report.submissionId, 'u1')
    const adapter = successAdapter()

    await new BugReportDelivery(store, adapter, 'https://game.example', () => now)
      .deliver(report.submissionId)

    expect(adapter.createIssue).toHaveBeenCalledWith(
      'github_user',
      expect.any(Object),
      'user-token',
    )
  })

  it('reconciles an uncertain create by marker instead of creating a duplicate', async () => {
    const roomId = insertContext('active')
    const report = store.createDraft({
      userId: 'u1',
      roomId,
      phenomenon: 'Request timed out',
    })
    store.updateDraft(report.submissionId, 'u1', {
      authorIdentity: 'hosted',
      confirmHosted: true,
    })
    store.queue(report.submissionId, 'u1')
    const adapter: IssueDeliveryAdapter = {
      createIssue: vi.fn(async () => ({
        ok: false as const,
        kind: 'uncertain' as const,
        code: 'github_result_uncertain',
      })),
      findIssueByMarker: vi.fn(async () => ({
        ok: true as const,
        number: 7,
        url: ISSUE_URL,
      })),
      refreshUserToken: vi.fn(),
      revokeUserGrant: vi.fn(),
      anonymizeIssue: vi.fn(),
    }

    await new BugReportDelivery(store, adapter, 'https://game.example', () => now)
      .deliver(report.submissionId)

    expect(adapter.createIssue).toHaveBeenCalledTimes(1)
    expect(adapter.findIssueByMarker).toHaveBeenCalledTimes(1)
    expect(store.getOwned(report.submissionId, 'u1').status).toBe('submitted')
  })

  it('invalidates a rejected user token and preserves the chosen identity', async () => {
    const roomId = insertContext('active')
    const report = store.createDraft({
      userId: 'u1',
      roomId,
      phenomenon: 'GitHub rejected the token',
    })
    store.saveConnection('u1', '99', {
      accessToken: 'user-token',
      accessTokenExpiresAt: now + 3_600_000,
    })
    store.updateDraft(report.submissionId, 'u1', {
      authorIdentity: 'github_user',
      confirmGitHub: true,
    })
    store.queue(report.submissionId, 'u1')
    const adapter: IssueDeliveryAdapter = {
      createIssue: vi.fn(async () => ({
        ok: false as const,
        kind: 'auth' as const,
        code: 'github_auth_invalid',
        status: 401,
      })),
      findIssueByMarker: vi.fn(),
      refreshUserToken: vi.fn(),
      revokeUserGrant: vi.fn(),
      anonymizeIssue: vi.fn(),
    }

    await new BugReportDelivery(store, adapter, 'https://game.example', () => now)
      .deliver(report.submissionId)

    expect(store.connectionStatus('u1')).toEqual({ connected: false })
    expect(store.getOwned(report.submissionId, 'u1')).toMatchObject({
      status: 'needs_reconnect',
      authorIdentity: 'github_user',
      lastErrorCode: 'github_auth_invalid',
    })
    store.saveConnection('u1', '99', {
      accessToken: 'new-user-token',
      accessTokenExpiresAt: now + 3_600_000,
    })
    store.queue(report.submissionId, 'u1')
    expect(store.claim(report.submissionId)?.mode).toBe('reconcile')
  })

  it('does not ask a hosted reporter to reconnect when App authentication fails', async () => {
    const roomId = insertContext('active')
    const report = store.createDraft({
      userId: 'u1',
      roomId,
      phenomenon: 'GitHub App authentication failed',
    })
    store.updateDraft(report.submissionId, 'u1', {
      authorIdentity: 'hosted',
      confirmHosted: true,
    })
    store.queue(report.submissionId, 'u1')
    const adapter: IssueDeliveryAdapter = {
      createIssue: vi.fn(async () => ({
        ok: false as const,
        kind: 'auth' as const,
        code: 'github_auth_invalid',
        status: 401,
      })),
      findIssueByMarker: vi.fn(),
      refreshUserToken: vi.fn(),
      revokeUserGrant: vi.fn(),
      anonymizeIssue: vi.fn(),
    }

    await new BugReportDelivery(store, adapter, 'https://game.example', () => now)
      .deliver(report.submissionId)

    expect(store.getOwned(report.submissionId, 'u1')).toMatchObject({
      status: 'failed',
      authorIdentity: 'hosted',
      lastErrorCode: 'github_auth_invalid',
    })
  })

  it('enforces the user submission window before delivery', () => {
    const roomId = insertContext('active')
    for (let index = 0; index < 3; index += 1) {
      const report = store.createDraft({
        userId: 'u1',
        roomId,
        phenomenon: `Problem ${index}`,
      })
      store.updateDraft(report.submissionId, 'u1', {
        authorIdentity: 'hosted',
        confirmHosted: true,
      })
      store.queue(report.submissionId, 'u1')
    }
    const fourth = store.createDraft({
      userId: 'u1',
      roomId,
      phenomenon: 'Problem 4',
    })
    store.updateDraft(fourth.submissionId, 'u1', {
      authorIdentity: 'hosted',
      confirmHosted: true,
    })

    expectBugReportError(
      () => store.queue(fourth.submissionId, 'u1'),
      'bug_report_rate_limited',
      429,
    )
  })

  it('freezes public fields after delivery starts, including terminal failure', () => {
    const roomId = insertContext('active')
    const report = store.createDraft({
      userId: 'u1',
      roomId,
      phenomenon: 'Original problem',
    })
    store.updateDraft(report.submissionId, 'u1', {
      authorIdentity: 'hosted',
      confirmHosted: true,
    })
    store.queue(report.submissionId, 'u1')

    expectBugReportError(
      () => store.updateDraft(report.submissionId, 'u1', {
        phenomenon: 'Changed while queued',
      }),
      'bug_report_update_conflict',
      409,
    )
    const claim = store.claim(report.submissionId)!
    store.defer(claim, 'failed', 'github_permission_denied')
    expectBugReportError(
      () => store.updateDraft(report.submissionId, 'u1', {
        phenomenon: 'Changed after failure',
      }),
      'bug_report_update_conflict',
      409,
    )
  })

  it('soft-deletes a failed submission without releasing its quota or attempts', () => {
    const roomId = insertContext('active')
    const report = store.createDraft({
      userId: 'u1',
      roomId,
      phenomenon: 'The game froze',
    })
    store.updateDraft(report.submissionId, 'u1', {
      authorIdentity: 'hosted',
      confirmHosted: true,
    })
    store.queue(report.submissionId, 'u1')
    expectBugReportError(
      () => store.deleteDraft(report.submissionId, 'u1'),
      'bug_report_delete_conflict',
      409,
    )
    const claim = store.claim(report.submissionId)!
    store.defer(claim, 'failed', 'github_permission_denied')
    store.recordAttempt(
      report.submissionId,
      'create',
      'permission',
      now,
    )

    store.deleteDraft(report.submissionId, 'u1')
    expectBugReportError(
      () => store.getOwned(report.submissionId, 'u1'),
      'bug_report_not_found',
      404,
    )
    expect(db.prepare(`
      SELECT reporter_user_id, phenomenon, submitted_at, discarded_at
      FROM bug_reports WHERE submission_id = ?
    `).get(report.submissionId)).toMatchObject({
      reporter_user_id: 'u1',
      phenomenon: null,
      submitted_at: now,
      discarded_at: now,
    })
    expect((db.prepare(`
      SELECT COUNT(*) AS count
      FROM bug_report_attempts WHERE submission_id = ?
    `).get(report.submissionId) as { count: number }).count).toBe(1)

    for (const phenomenon of ['Second problem', 'Third problem']) {
      const next = store.createDraft({ userId: 'u1', roomId, phenomenon })
      store.updateDraft(next.submissionId, 'u1', {
        authorIdentity: 'hosted',
        confirmHosted: true,
      })
      store.queue(next.submissionId, 'u1')
    }
    const fourth = store.createDraft({
      userId: 'u1',
      roomId,
      phenomenon: 'Fourth problem',
    })
    store.updateDraft(fourth.submissionId, 'u1', {
      authorIdentity: 'hosted',
      confirmHosted: true,
    })
    expectBugReportError(
      () => store.queue(fourth.submissionId, 'u1'),
      'bug_report_rate_limited',
      429,
    )
  })

  it('allows account deletion after a failed submission is discarded', async () => {
    const roomId = insertContext('active')
    const report = store.createDraft({
      userId: 'u1',
      roomId,
      phenomenon: 'The game froze',
    })
    store.updateDraft(report.submissionId, 'u1', {
      authorIdentity: 'hosted',
      confirmHosted: true,
    })
    store.queue(report.submissionId, 'u1')
    const claim = store.claim(report.submissionId)!
    store.defer(claim, 'failed', 'github_permission_denied')
    store.recordAttempt(report.submissionId, 'create', 'permission', now)
    store.deleteDraft(report.submissionId, 'u1')

    const adapter = successAdapter()
    await new BugReportDelivery(
      store,
      adapter,
      'https://game.example',
      () => now,
    ).deleteReporter('u1')

    expect(adapter.findIssueByMarker).toHaveBeenCalledWith(
      'hosted',
      `<!-- open-agricola-report:${report.submissionId} -->`,
      now,
    )
    expect(db.prepare(`
      SELECT reporter_user_id, submitted_at, discarded_at
      FROM bug_reports WHERE submission_id = ?
    `).get(report.submissionId)).toMatchObject({
      reporter_user_id: null,
      submitted_at: now,
      discarded_at: now,
    })
    expect(db.prepare(`
      SELECT COUNT(*) AS count
      FROM bug_report_attempts WHERE submission_id = ?
    `).get(report.submissionId)).toEqual({ count: 2 })
  })

  it('finds and anonymizes an Issue from a discarded uncertain submission', async () => {
    const roomId = insertContext('active')
    const report = store.createDraft({
      userId: 'u1',
      roomId,
      phenomenon: 'The game froze',
    })
    store.updateDraft(report.submissionId, 'u1', {
      authorIdentity: 'hosted',
      confirmHosted: true,
    })
    store.queue(report.submissionId, 'u1')
    const claim = store.claim(report.submissionId)!
    store.defer(claim, 'failed', 'github_result_uncertain')
    store.recordAttempt(report.submissionId, 'create', 'uncertain', now)
    store.deleteDraft(report.submissionId, 'u1')
    const adapter = successAdapter()
    vi.mocked(adapter.findIssueByMarker)
      .mockResolvedValueOnce({
        ok: false,
        kind: 'uncertain',
        code: 'github_reconciliation_uncertain',
      })
      .mockResolvedValueOnce({
        ok: true,
        number: 9,
        url: 'https://github.com/titanxxh/open-agricola-issues/issues/9',
      })
    const delivery = new BugReportDelivery(
      store,
      adapter,
      'https://game.example',
      () => now,
    )

    await expect(delivery.deleteReporter('u1')).rejects.toMatchObject({
      code: 'github_reconciliation_uncertain',
      status: 503,
    })
    expect(store.reportForEvidence(report.submissionId)?.reporter_user_id)
      .toBe('u1')

    await delivery.deleteReporter('u1')

    expect(adapter.anonymizeIssue).toHaveBeenCalledWith(9, 'u1')
    expect(store.reportForEvidence(report.submissionId)?.reporter_user_id)
      .toBeNull()
  })

  it('anonymizes known Issues and revokes GitHub before account deletion', async () => {
    const roomId = insertContext('active')
    const submitted = store.createDraft({
      userId: 'u1',
      roomId,
      phenomenon: 'Published problem',
    })
    store.updateDraft(submitted.submissionId, 'u1', {
      authorIdentity: 'hosted',
      confirmHosted: true,
    })
    store.queue(submitted.submissionId, 'u1')
    const adapter = successAdapter()
    const delivery = new BugReportDelivery(
      store,
      adapter,
      'https://game.example',
      () => now,
    )
    await delivery.deliver(submitted.submissionId)
    store.createDraft({
      userId: 'u1',
      roomId,
      phenomenon: 'Unsubmitted private draft',
    })
    store.saveConnection('u1', '99', {
      accessToken: 'user-token',
      accessTokenExpiresAt: now + 3_600_000,
    })

    vi.mocked(adapter.anonymizeIssue).mockResolvedValueOnce({
      ok: false,
      kind: 'uncertain',
      code: 'github_anonymization_uncertain',
    })
    await expect(delivery.deleteReporter('u1')).rejects.toMatchObject({
      code: 'github_anonymization_uncertain',
      status: 503,
    })
    expect(store.connectionStatus('u1').connected).toBe(true)
    expect(store.getOwned(submitted.submissionId, 'u1').reporterUserId)
      .toBe('u1')

    await delivery.deleteReporter('u1')

    expect(adapter.anonymizeIssue).toHaveBeenCalledWith(7, 'u1')
    expect(adapter.revokeUserGrant).toHaveBeenCalledWith('user-token')
    expect(store.connectionStatus('u1')).toEqual({ connected: false })
    expect(db.prepare(`
      SELECT COUNT(*) AS count
      FROM bug_reports
      WHERE reporter_user_id IS NOT NULL OR phenomenon IS NOT NULL
    `).get()).toEqual({ count: 0 })
    expect((db.prepare(`
      SELECT COUNT(*) AS count FROM bug_report_attempts
    `).get() as { count: number }).count).toBeGreaterThan(0)
  })

  it('reconciles an interrupted delivery before creating another Issue', () => {
    const roomId = insertContext('active')
    const report = store.createDraft({
      userId: 'u1',
      roomId,
      phenomenon: 'The game froze',
    })
    store.updateDraft(report.submissionId, 'u1', {
      authorIdentity: 'hosted',
      confirmHosted: true,
    })
    store.queue(report.submissionId, 'u1')

    expect(store.claim(report.submissionId)?.mode).toBe('create')
    now += 5 * 60_000 + 1

    expect(store.claim(report.submissionId)?.mode).toBe('reconcile')
  })

  it('stops after all three uncertain reconciliation delays', async () => {
    const roomId = insertContext('active')
    const report = store.createDraft({
      userId: 'u1',
      roomId,
      phenomenon: 'GitHub never returned a definite result',
    })
    store.updateDraft(report.submissionId, 'u1', {
      authorIdentity: 'hosted',
      confirmHosted: true,
    })
    store.queue(report.submissionId, 'u1')
    const adapter: IssueDeliveryAdapter = {
      createIssue: vi.fn(async () => ({
        ok: false as const,
        kind: 'uncertain' as const,
        code: 'github_result_uncertain',
      })),
      findIssueByMarker: vi.fn(async () => ({
        ok: false as const,
        kind: 'uncertain' as const,
        code: 'github_reconciliation_uncertain',
      })),
      refreshUserToken: vi.fn(),
      revokeUserGrant: vi.fn(),
      anonymizeIssue: vi.fn(),
    }
    const delivery = new BugReportDelivery(store, adapter, 'https://game.example', () => now)

    await delivery.deliver(report.submissionId)
    expect(store.getOwned(report.submissionId, 'u1').status).toBe('reconcile')
    now += 30_000
    await delivery.deliver(report.submissionId)
    expect(store.getOwned(report.submissionId, 'u1').status).toBe('reconcile')
    now += 120_000
    await delivery.deliver(report.submissionId)
    expect(store.getOwned(report.submissionId, 'u1').status).toBe('reconcile')
    now += 600_000
    await delivery.deliver(report.submissionId)

    expect(adapter.createIssue).toHaveBeenCalledTimes(1)
    expect(adapter.findIssueByMarker).toHaveBeenCalledTimes(4)
    expect(store.getOwned(report.submissionId, 'u1')).toMatchObject({
      status: 'failed',
      lastErrorCode: 'github_result_uncertain',
    })
  })
})
