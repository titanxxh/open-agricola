import { createTestDatabase } from './_helpers/postgres'
import type { PostgresDatabase } from '../database/postgres'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

let db: PostgresDatabase
let now: number
let store: BugReportStore

const insertUser = async (id: string): Promise<Awaited<void>> => {
  ;(await db.prepare(`
    INSERT INTO users (id, username, display_name, password_hash, created_at)
    VALUES (?, ?, ?, 'hash', ?)
  `).run(id, id, id, now))
}

const insertContext = async (
  lifecycle: 'active' | 'completed',
  userId = 'u1',
): Promise<Awaited<string>> => {
  const roomId = `${lifecycle}-room`
  if (lifecycle === 'active') {
    ;(await db.prepare(`
      INSERT INTO rooms (
        id, created_by, state_json, status, version, created_at, updated_at
      )
      VALUES (?, ?, '{}', 'playing', 8, ?, ?)
    `).run(roomId, userId, now, now))
    ;(await db.prepare(`
      INSERT INTO room_players (room_id, user_id, player_index, joined_at)
      VALUES (?, ?, 0, ?)
    `).run(roomId, userId, now))
  } else {
    ;(await db.prepare(`
      INSERT INTO game_results (
        room_id, started_at, finished_at, rounds_played, player_count,
        enable_community_deck, enable_parent_cards,
        enable_through_the_seasons, enable_farmers_of_the_moor, enable_snake_opening
      )
      VALUES (?, ?, ?, 14, 2, 0, 0, 0, 0, 0)
    `).run(roomId, now - 1_000, now))
    ;(await db.prepare(`
      INSERT INTO game_result_players (
        room_id, player_index, game_player_id, user_id, display_name, score
      )
      VALUES (?, 1, 'p2', ?, 'Player 2', 42)
    `).run(roomId, userId))
  }
  ;(await db.prepare(`
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
  ))
  ;(await db.prepare(`
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
  ))
  ;(await db.prepare(`
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
  ))
  return roomId
}

const expectBugReportError = async (
  action: () => unknown,
  code: string,
  status: number,
): Promise<void> => {
  try {
    await action()
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

beforeEach(async () => {
  db = await createTestDatabase()


  now = 1_700_000_000_000
  store = new BugReportStore(
    db,
    new TokenCipher('k1', new Map([['k1', Buffer.alloc(32, 7)]])),
    () => now,
  )
  ;(await insertUser('u1'))
  ;(await insertUser('u2'))
})

afterEach(async () => {
  ;(await db.close())
})

describe('BugReportStore', () => {
  it('serializes draft and submission quotas across shared store instances', async () => {
    const roomId = await insertContext('active')
    const other = new BugReportStore(db, new TokenCipher('k1', new Map([['k1', Buffer.alloc(32, 7)]])), () => now)
    const attempts = await Promise.allSettled(Array.from({ length: 8 }, (_, index) =>
      (index % 2 ? store : other).createDraft({ userId: 'u1', roomId, phenomenon: `Concurrent report ${index}` })))
    const reports = attempts.flatMap(result => result.status === 'fulfilled' ? [result.value] : [])
    expect(reports).toHaveLength(5)
    expect(attempts.filter(result => result.status === 'rejected')).toHaveLength(3)
    await Promise.all(reports.map(report => store.updateDraft(report.submissionId, 'u1', { authorIdentity: 'hosted', confirmHosted: true })))
    const queued = await Promise.allSettled(reports.map((report, index) => (index % 2 ? store : other).queue(report.submissionId, 'u1')))
    expect(queued.filter(result => result.status === 'fulfilled')).toHaveLength(3)
    expect(queued.filter(result => result.status === 'rejected')).toHaveLength(2)
  })

  it('lets only one executor deliver the same report and fences grant-revocation completion', async () => {
    const roomId = await insertContext('active')
    const report = await store.createDraft({ userId: 'u1', roomId, phenomenon: 'Shared delivery' })
    await store.updateDraft(report.submissionId, 'u1', { authorIdentity: 'hosted', confirmHosted: true })
    await store.queue(report.submissionId, 'u1')
    const other = new BugReportStore(db, new TokenCipher('k1', new Map([['k1', Buffer.alloc(32, 7)]])), () => now)
    const adapter = successAdapter()
    await Promise.all([store, other].map(worker => new BugReportDelivery(worker, adapter, 'https://game.example', () => now).deliver(report.submissionId)))
    expect(adapter.createIssue).toHaveBeenCalledOnce()
    expect(await store.getOwned(report.submissionId, 'u1')).toMatchObject({ status: 'submitted', issueNumber: 7 })
    const hash = await store.queueGrantRevocation('private-token')
    const claims = await Promise.all([store.nextGrantRevocation(), other.nextGrantRevocation()])
    expect(claims.filter(Boolean)).toHaveLength(1)
    await other.finishGrantRevocation(hash, 'wrong-owner')
    expect(await db.prepare('SELECT token_hash FROM github_grant_revocations WHERE token_hash = ?').get(hash)).toBeDefined()
    await store.finishGrantRevocation(hash, claims.find(Boolean)!.claimToken)
    expect(await db.prepare('SELECT token_hash FROM github_grant_revocations WHERE token_hash = ?').get(hash)).toBeUndefined()
    const slots = await Promise.all(Array.from({ length: 24 }, (_, index) => (index % 2 ? store : other).canSendGithubRequest()))
    // Delivery already reserved one request in this shared minute.
    expect(slots.filter(slot => slot.ok)).toHaveLength(19)
  })

  it('fixes active-game evidence to the reporter and latest server anchor', async () => {
    const roomId = (await insertContext('active'))
    const report = (await store.createDraft({
      userId: 'u1',
      roomId,
      phenomenon: '  The game froze  ',
    }))

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
    await expectBugReportError(
      async () => (await store.createDraft({
        userId: 'u1',
        roomId,
        phenomenon: 'Forged anchor',
        stepNo: 5,
        frameHash: ACTIVE_HASH,
      })),
      'anchor_mismatch',
      409,
    )
    await expectBugReportError(
      async () => (await store.createDraft({
        userId: 'u2',
        roomId,
        phenomenon: 'Not my game',
      })),
      'not_participant',
      403,
    )
  })

  it('starts active evidence retention at the first submission', async () => {
    const roomId = (await insertContext('active'))
    const report = (await store.createDraft({
      userId: 'u1',
      roomId,
      phenomenon: 'The game froze',
    }))
    expect((await db.prepare(`
      SELECT evidence_expires_at FROM bug_reports WHERE submission_id = ?
    `).get(report.submissionId))).toEqual({ evidence_expires_at: null })
    ;(await store.updateDraft(report.submissionId, 'u1', {
      authorIdentity: 'hosted',
      confirmHosted: true,
    }))
    now += 7 * 24 * 60 * 60 * 1000

    ;(await store.queue(report.submissionId, 'u1'))

    expect((await db.prepare(`
      SELECT submitted_at, evidence_expires_at
      FROM bug_reports WHERE submission_id = ?
    `).get(report.submissionId))).toEqual({
      submitted_at: now,
      evidence_expires_at: now + 30 * 24 * 60 * 60 * 1000,
    })
  })

  it('refuses to submit active evidence after its segment prefix is gone', async () => {
    const roomId = (await insertContext('active'))
    ;(await db.prepare(`
      INSERT INTO game_replay_steps (
        room_id, step_no, room_version, checkpoint_step_no, player_index,
        command_type, intent_json, payload_kind, payload_gzip, frame_hash,
        created_at
      )
      VALUES (?, 6, 9, 5, 0, 'test', '{}', 'delta', ?, ?, ?)
    `).run(roomId, Buffer.from('delta'), 'c'.repeat(64), now))
    const report = (await store.createDraft({
      userId: 'u1',
      roomId,
      phenomenon: 'The game froze',
    }))
    ;(await store.updateDraft(report.submissionId, 'u1', {
      authorIdentity: 'hosted',
      confirmHosted: true,
    }))
    ;(await db.prepare(`
      DELETE FROM game_replay_steps WHERE room_id = ? AND step_no = ?
    `).run(roomId, 5))

    await expectBugReportError(
      async () => (await store.queue(report.submissionId, 'u1')),
      'replay_segment_unavailable',
      503,
    )
    expect((await db.prepare(`
      SELECT status, submitted_at, evidence_expires_at
      FROM bug_reports WHERE submission_id = ?
    `).get(report.submissionId))).toEqual({
      status: 'draft',
      submitted_at: null,
      evidence_expires_at: null,
    })
  })

  it('requires an exact archived anchor and original participant for completed games', async () => {
    const roomId = (await insertContext('completed'))
    const report = (await store.createDraft({
      userId: 'u1',
      roomId,
      phenomenon: 'The score changed',
      stepNo: 12,
      frameHash: COMPLETED_HASH,
    }))

    expect(report).toMatchObject({
      playerIndex: 1,
      roomVersion: 21,
      stepNo: 12,
      frameHash: COMPLETED_HASH,
    })
    await expectBugReportError(
      async () => (await store.createDraft({
        userId: 'u1',
        roomId,
        phenomenon: 'Wrong frame',
        stepNo: 12,
        frameHash: ACTIVE_HASH,
      })),
      'anchor_mismatch',
      409,
    )
    await expectBugReportError(
      async () => (await store.createDraft({
        userId: 'u2',
        roomId,
        phenomenon: 'Not my game',
        stepNo: 12,
        frameHash: COMPLETED_HASH,
      })),
      'not_participant',
      403,
    )
  })

  it('revalidates a completed context before its first queue', async () => {
    const roomId = (await insertContext('completed'))
    const report = (await store.createDraft({
      userId: 'u1',
      roomId,
      phenomenon: 'The score changed',
      stepNo: 12,
      frameHash: COMPLETED_HASH,
    }))
    ;(await store.updateDraft(report.submissionId, 'u1', {
      authorIdentity: 'hosted',
      confirmHosted: true,
    }))
    ;(await db.prepare(`
      UPDATE game_contexts SET lifecycle = 'expired' WHERE room_id = ?
    `).run(roomId))

    await expectBugReportError(
      async () => (await store.queue(report.submissionId, 'u1')),
      'replay_segment_unavailable',
      503,
    )
    expect((await store.getOwned(report.submissionId, 'u1')).status).toBe('draft')
    ;(await store.deleteDraft(report.submissionId, 'u1'))
    await expectBugReportError(
      async () => (await store.getOwned(report.submissionId, 'u1')),
      'bug_report_not_found',
      404,
    )
  })

  it('validates one Unicode phenomenon sentence up to 2000 code points', async () => {
    const roomId = (await insertContext('active'))
    await expectBugReportError(
      async () => (await store.createDraft({ userId: 'u1', roomId, phenomenon: '   ' })),
      'phenomenon_required',
      400,
    )
    await expectBugReportError(
      async () => (await store.createDraft({ userId: 'u1', roomId, phenomenon: '\u0001' })),
      'phenomenon_required',
      400,
    )
    await expectBugReportError(
      async () => (await store.createDraft({
        userId: 'u1',
        roomId,
        phenomenon: '界'.repeat(2001),
      })),
      'phenomenon_too_long',
      400,
    )
    expect((await store.createDraft({
      userId: 'u1',
      roomId,
      phenomenon: '界'.repeat(2000),
    })).phenomenon).toHaveLength(2000)
  })

  it('limits each user to five unfinished drafts', async () => {
    const roomId = (await insertContext('active'))
    const drafts = await Promise.all(Array.from({ length: 5 }, async (_, index) =>
      (await store.createDraft({
        userId: 'u1',
        roomId,
        phenomenon: `Problem ${index}`,
      }))))
    ;(await db.prepare(`
      UPDATE bug_reports
      SET status = ?
      WHERE submission_id = ?
    `).run('failed', drafts[0]!.submissionId))
    ;(await db.prepare(`
      UPDATE bug_reports
      SET status = ?
      WHERE submission_id = ?
    `).run('needs_reconnect', drafts[1]!.submissionId))

    await expectBugReportError(
      async () => (await store.createDraft({
        userId: 'u1',
        roomId,
        phenomenon: 'One draft too many',
      })),
      'bug_report_draft_limit',
      429,
    )

    ;(await store.deleteDraft(drafts[0]!.submissionId, 'u1'))
    expect((await store.createDraft({
      userId: 'u1',
      roomId,
      phenomenon: 'Replacement draft',
    })).status).toBe('draft')
  })

  it('encrypts GitHub tokens and one-time PKCE state at rest', async () => {
    ;(await store.saveConnection('u1', '99', {
      accessToken: 'access-secret',
      accessTokenExpiresAt: now + 3_600_000,
      refreshToken: 'refresh-secret',
      refreshTokenExpiresAt: now + 86_400_000,
    }))

    const raw = (await db.prepare(`
      SELECT access_token_ciphertext, refresh_token_ciphertext
      FROM issue_submission_connections WHERE user_id = 'u1'
    `).get()) as {
      access_token_ciphertext: Buffer
      refresh_token_ciphertext: Buffer
    }
    expect(raw.access_token_ciphertext.toString()).not.toContain('access-secret')
    expect(raw.refresh_token_ciphertext.toString()).not.toContain('refresh-secret')
    expect((await store.connectionTokens('u1'))).toEqual({
      githubUserId: '99',
      accessToken: 'access-secret',
      accessTokenExpiresAt: now + 3_600_000,
      refreshToken: 'refresh-secret',
      refreshTokenExpiresAt: now + 86_400_000,
    })
    await expectBugReportError(
      async () => (await store.saveConnection('u1', '101', {
        accessToken: 'replacement-secret',
        accessTokenExpiresAt: now + 3_600_000,
      })),
      'github_identity_mismatch',
      409,
    )
    expect((await store.connectionTokens('u1'))?.accessToken).toBe('access-secret')
    await expectBugReportError(
      async () => (await store.saveConnection('u2', '99', {
        accessToken: 'other',
        accessTokenExpiresAt: now + 3_600_000,
      })),
      'github_identity_already_connected',
      409,
    )
    ;(await db.prepare(`
      INSERT INTO auth_identities (
        id, user_id, provider, provider_user_id,
        provider_email_verified, linked_at
      ) VALUES ('identity-u2', 'u2', 'github', '100', 0, ?)
    `).run(now))
    await expectBugReportError(
      async () => (await store.saveConnection('u1', '100', {
        accessToken: 'other-identity',
        accessTokenExpiresAt: now + 3_600_000,
      })),
      'github_identity_already_connected',
      409,
    )
    ;(await db.prepare(`
      UPDATE issue_submission_connections
      SET revoked_at = ?
      WHERE user_id = 'u1'
    `).run(now))
    expect((await store.connectionStatus('u1'))).toEqual({ connected: false })
    expect((await store.reporterDeletionPlan('u1')).tokens).toMatchObject({
      githubUserId: '99',
      accessToken: 'access-secret',
    })

    const connection = (await store.createConnectionState('u1', '/resume'))
    expect((await store.consumeConnectionState(connection.state, 'u2'))).toBeNull()
    const consumed = (await store.consumeConnectionState(connection.state, 'u1'))
    expect(consumed).toMatchObject({ userId: 'u1', returnTo: '/resume' })
    expect(consumed?.verifier).not.toBe(connection.state)
    expect((await store.consumeConnectionState(connection.state, 'u1'))).toBeNull()
    expect(JSON.stringify((await db.prepare(`
      SELECT * FROM oauth_states
    `).get()))).not.toContain(consumed?.verifier)
  })

  it('keeps only one live bug-report OAuth state per user and prunes stale states', async () => {
    const used = (await store.createConnectionState('u1', '/used'))
    expect((await store.consumeConnectionState(used.state, 'u1'))).not.toBeNull()
    const expired = (await store.createConnectionState('u2', '/expired'))
    now += 10 * 60_000 + 1

    const replaced = (await store.createConnectionState('u1', '/replaced'))
    const current = (await store.createConnectionState('u1', '/current'))

    expect((await store.consumeConnectionState(expired.state, 'u2'))).toBeNull()
    expect((await store.consumeConnectionState(replaced.state, 'u1'))).toBeNull()
    expect((await store.consumeConnectionState(current.state, 'u1')))
      .toMatchObject({ returnTo: '/current' })
    expect((await db.prepare(`
      SELECT COUNT(*) AS count FROM oauth_states
    `).get())).toEqual({ count: 1 })
  })

  it('submits once through the hosted identity and stores no phenomenon afterward', async () => {
    const roomId = (await insertContext('active'))
    const report = (await store.createDraft({
      userId: 'u1',
      roomId,
      phenomenon: '@alice UI\u0001 froze after taking wood\n'
        + 'https://host/@bob user@example.com @scope/pkg @org/team\n'
        + '<!-- open-agricola-report:forged -->',
    }))
    await expectBugReportError(
      async () => (await store.updateDraft(report.submissionId, 'u1', {
        authorIdentity: 'hosted',
      })),
      'hosted_identity_confirmation_required',
      400,
    )
    ;(await store.updateDraft(report.submissionId, 'u1', {
      authorIdentity: 'hosted',
      confirmHosted: true,
    }))
    ;(await store.queue(report.submissionId, 'u1'))
    const adapter = successAdapter()
    const delivery = new BugReportDelivery(store, adapter, 'https://game.example/replay', () => now)

    await delivery.deliver(report.submissionId)
    ;(await store.queue(report.submissionId, 'u1'))
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
    expect(issue.body).toContain('https://host/@bob')
    expect(issue.body).toContain('user@example.com')
    expect(issue.body).toContain('@\u200Bscope/pkg')
    expect(issue.body).toContain('@\u200Borg/team')
    expect(issue.body).toContain('&lt;!-- open-agricola-report:forged -->')
    expect(issue.body.match(/<!-- open-agricola-report:[^>\r\n]+ -->/g)).toHaveLength(1)
    expect(issue.body).not.toContain('\u0001')
    expect((await store.getOwned(report.submissionId, 'u1'))).toMatchObject({
      status: 'submitted',
      phenomenon: null,
      issueNumber: 7,
      issueUrl: ISSUE_URL,
    })
  })

  it('disconnects locally when GitHub revocation is unavailable', async () => {
    ;(await store.saveConnection('u1', '99', {
      accessToken: 'user-token',
      accessTokenExpiresAt: now + 3_600_000,
    }))
    const adapter = successAdapter()
    vi.mocked(adapter.revokeUserGrant).mockResolvedValueOnce({
      ok: false,
      kind: 'uncertain',
      code: 'github_revocation_uncertain',
    })

    const delivery = new BugReportDelivery(
      store,
      adapter,
      'https://game.example',
      () => now,
    )
    await expect(delivery.disconnectUser('u1')).rejects.toMatchObject({
      code: 'github_revocation_uncertain',
      status: 503,
    })

    expect((await store.connectionStatus('u1'))).toEqual({ connected: false })
    expect((await store.connectionTokens('u1'))).toBeNull()
    expect((await db.prepare(`
      SELECT COUNT(*) AS count FROM github_grant_revocations
    `).get())).toEqual({ count: 1 })

    now += 30_000
    vi.mocked(adapter.revokeUserGrant).mockResolvedValueOnce({ ok: true })
    await delivery.retryGrantRevocation()

    expect((await db.prepare(`
      SELECT COUNT(*) AS count FROM github_grant_revocations
    `).get())).toEqual({ count: 0 })
  })

  it('requires and uses the reporter GitHub connection without hosted fallback', async () => {
    const roomId = (await insertContext('active'))
    const report = (await store.createDraft({
      userId: 'u1',
      roomId,
      phenomenon: 'Action did not resolve',
    }))
    await expectBugReportError(
      async () => (await store.updateDraft(report.submissionId, 'u1', {
        authorIdentity: 'github_user',
        confirmGitHub: true,
      })),
      'github_connection_required',
      409,
    )
    ;(await store.saveConnection('u1', '99', {
      accessToken: 'user-token',
      accessTokenExpiresAt: now + 3_600_000,
    }))
    await expectBugReportError(
      async () => (await store.updateDraft(report.submissionId, 'u1', {
        authorIdentity: 'github_user',
      })),
      'github_identity_confirmation_required',
      400,
    )
    ;(await store.updateDraft(report.submissionId, 'u1', {
      authorIdentity: 'github_user',
      confirmGitHub: true,
    }))
    ;(await store.queue(report.submissionId, 'u1'))
    const adapter = successAdapter()

    await new BugReportDelivery(store, adapter, 'https://game.example', () => now)
      .deliver(report.submissionId)

    expect(adapter.createIssue).toHaveBeenCalledWith(
      'github_user',
      expect.any(Object),
      'user-token',
    )
  })

  it('queues a refreshed token for revocation when account deletion wins the refresh race', async () => {
    const roomId = (await insertContext('active'))
    const report = (await store.createDraft({
      userId: 'u1',
      roomId,
      phenomenon: 'Action did not resolve',
    }))
    ;(await store.saveConnection('u1', '99', {
      accessToken: 'expired-token',
      accessTokenExpiresAt: now,
      refreshToken: 'refresh-token',
      refreshTokenExpiresAt: now + 3_600_000,
    }))
    ;(await store.updateDraft(report.submissionId, 'u1', {
      authorIdentity: 'github_user',
      confirmGitHub: true,
    }))
    ;(await store.queue(report.submissionId, 'u1'))
    const adapter = successAdapter()
    let resolveRefresh!: (tokens: {
      accessToken: string
      accessTokenExpiresAt: number
    }) => void
    vi.mocked(adapter.refreshUserToken).mockImplementationOnce(() =>
      new Promise((resolve) => {
        resolveRefresh = resolve
      }))
    const delivery = new BugReportDelivery(
      store,
      adapter,
      'https://game.example',
      () => now,
    )

    const delivering = delivery.deliver(report.submissionId)
    await vi.waitFor(() => {
      expect(adapter.refreshUserToken).toHaveBeenCalledWith('refresh-token')
    })
    ;(await db.prepare(`
      INSERT INTO account_deletion_requests (
        user_id, requested_at, next_attempt_at, last_error_code
      ) VALUES ('u1', ?, ?, NULL)
    `).run(now, now))
    resolveRefresh({
      accessToken: 'refreshed-after-deletion',
      accessTokenExpiresAt: now + 3_600_000,
    })
    await delivering

    expect(adapter.createIssue).not.toHaveBeenCalled()
    expect((await store.nextGrantRevocation())).toMatchObject({
      accessToken: 'refreshed-after-deletion',
    })
    expect((await store.getOwned(report.submissionId, 'u1'))).toMatchObject({
      status: 'needs_reconnect',
      lastErrorCode: 'github_connection_required',
    })
  })

  it('requires new confirmation when the connected GitHub account changes', async () => {
    const roomId = (await insertContext('active'))
    const report = (await store.createDraft({
      userId: 'u1',
      roomId,
      phenomenon: 'Action did not resolve',
    }))
    ;(await store.saveConnection('u1', '99', {
      accessToken: 'user-token-a',
      accessTokenExpiresAt: now + 3_600_000,
    }))
    ;(await store.updateDraft(report.submissionId, 'u1', {
      authorIdentity: 'github_user',
      confirmGitHub: true,
    }))
    ;(await store.queue(report.submissionId, 'u1'))
    ;(await store.disconnect('u1'))
    ;(await store.saveConnection('u1', '100', {
      accessToken: 'user-token-b',
      accessTokenExpiresAt: now + 3_600_000,
    }))
    const adapter = successAdapter()
    const delivery = new BugReportDelivery(
      store,
      adapter,
      'https://game.example',
      () => now,
    )

    await delivery.deliver(report.submissionId)

    expect(adapter.createIssue).not.toHaveBeenCalled()
    expect((await store.getOwned(report.submissionId, 'u1'))).toMatchObject({
      status: 'needs_reconnect',
      lastErrorCode: 'github_identity_confirmation_required',
    })

    ;(await store.updateDraft(report.submissionId, 'u1', { confirmGitHub: true }))
    ;(await store.queue(report.submissionId, 'u1'))
    await delivery.deliver(report.submissionId)

    expect(adapter.createIssue).toHaveBeenCalledWith(
      'github_user',
      expect.any(Object),
      'user-token-b',
    )
  })

  it('allows an explicit hosted retry after a GitHub connection failure', async () => {
    const roomId = (await insertContext('active'))
    const report = (await store.createDraft({
      userId: 'u1',
      roomId,
      phenomenon: 'Action did not resolve',
    }))
    ;(await store.saveConnection('u1', '99', {
      accessToken: 'user-token',
      accessTokenExpiresAt: now + 3_600_000,
    }))
    ;(await store.updateDraft(report.submissionId, 'u1', {
      authorIdentity: 'github_user',
      confirmGitHub: true,
    }))
    ;(await store.queue(report.submissionId, 'u1'))
    const claim = (await store.claim(report.submissionId))!
    ;(await store.defer(claim, 'needs_reconnect', 'github_connection_required'))

    const changed = (await store.updateDraft(report.submissionId, 'u1', {
      authorIdentity: 'hosted',
      confirmHosted: true,
    }))

    expect(changed).toMatchObject({
      submissionId: report.submissionId,
      status: 'needs_reconnect',
      authorIdentity: 'hosted',
      lastErrorCode: null,
    })
    ;(await store.disconnect('u1'))
    ;(await store.queue(report.submissionId, 'u1'))
    expect((await store.claim(report.submissionId))?.mode).toBe('reconcile')
  })

  it('reconciles an uncertain create by marker instead of creating a duplicate', async () => {
    const roomId = (await insertContext('active'))
    const report = (await store.createDraft({
      userId: 'u1',
      roomId,
      phenomenon: 'Request timed out',
    }))
    ;(await store.updateDraft(report.submissionId, 'u1', {
      authorIdentity: 'hosted',
      confirmHosted: true,
    }))
    ;(await store.queue(report.submissionId, 'u1'))
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
    expect((await store.getOwned(report.submissionId, 'u1')).status).toBe('submitted')
  })

  it('invalidates a rejected user token and preserves the chosen identity', async () => {
    const roomId = (await insertContext('active'))
    const report = (await store.createDraft({
      userId: 'u1',
      roomId,
      phenomenon: 'GitHub rejected the token',
    }))
    ;(await store.saveConnection('u1', '99', {
      accessToken: 'user-token',
      accessTokenExpiresAt: now + 3_600_000,
    }))
    ;(await store.updateDraft(report.submissionId, 'u1', {
      authorIdentity: 'github_user',
      confirmGitHub: true,
    }))
    ;(await store.queue(report.submissionId, 'u1'))
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

    expect((await store.connectionStatus('u1'))).toEqual({ connected: false })
    expect((await store.getOwned(report.submissionId, 'u1'))).toMatchObject({
      status: 'needs_reconnect',
      authorIdentity: 'github_user',
      lastErrorCode: 'github_auth_invalid',
    })
    ;(await store.saveConnection('u1', '99', {
      accessToken: 'new-user-token',
      accessTokenExpiresAt: now + 3_600_000,
    }))
    ;(await store.queue(report.submissionId, 'u1'))
    expect((await store.claim(report.submissionId))?.mode).toBe('reconcile')
  })

  it('does not ask a hosted reporter to reconnect when App authentication fails', async () => {
    const roomId = (await insertContext('active'))
    const report = (await store.createDraft({
      userId: 'u1',
      roomId,
      phenomenon: 'GitHub App authentication failed',
    }))
    ;(await store.updateDraft(report.submissionId, 'u1', {
      authorIdentity: 'hosted',
      confirmHosted: true,
    }))
    ;(await store.queue(report.submissionId, 'u1'))
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

    expect((await store.getOwned(report.submissionId, 'u1'))).toMatchObject({
      status: 'failed',
      authorIdentity: 'hosted',
      lastErrorCode: 'github_auth_invalid',
    })
  })

  it('enforces the user submission window before delivery', async () => {
    const roomId = (await insertContext('active'))
    for (let index = 0; index < 3; index += 1) {
      const report = (await store.createDraft({
        userId: 'u1',
        roomId,
        phenomenon: `Problem ${index}`,
      }))
      ;(await store.updateDraft(report.submissionId, 'u1', {
        authorIdentity: 'hosted',
        confirmHosted: true,
      }))
      ;(await store.queue(report.submissionId, 'u1'))
    }
    const fourth = (await store.createDraft({
      userId: 'u1',
      roomId,
      phenomenon: 'Problem 4',
    }))
    ;(await store.updateDraft(fourth.submissionId, 'u1', {
      authorIdentity: 'hosted',
      confirmHosted: true,
    }))

    await expectBugReportError(
      async () => (await store.queue(fourth.submissionId, 'u1')),
      'bug_report_rate_limited',
      429,
    )
  })

  it('freezes public fields after delivery starts, including terminal failure', async () => {
    const roomId = (await insertContext('active'))
    const report = (await store.createDraft({
      userId: 'u1',
      roomId,
      phenomenon: 'Original problem',
    }))
    ;(await store.updateDraft(report.submissionId, 'u1', {
      authorIdentity: 'hosted',
      confirmHosted: true,
    }))
    ;(await store.queue(report.submissionId, 'u1'))

    await expectBugReportError(
      async () => (await store.updateDraft(report.submissionId, 'u1', {
        phenomenon: 'Changed while queued',
      })),
      'bug_report_update_conflict',
      409,
    )
    const claim = (await store.claim(report.submissionId))!
    ;(await store.defer(claim, 'failed', 'github_permission_denied'))
    await expectBugReportError(
      async () => (await store.updateDraft(report.submissionId, 'u1', {
        phenomenon: 'Changed after failure',
      })),
      'bug_report_update_conflict',
      409,
    )
  })

  it('soft-deletes a failed submission without releasing its quota or attempts', async () => {
    const roomId = (await insertContext('active'))
    const report = (await store.createDraft({
      userId: 'u1',
      roomId,
      phenomenon: 'The game froze',
    }))
    ;(await store.updateDraft(report.submissionId, 'u1', {
      authorIdentity: 'hosted',
      confirmHosted: true,
    }))
    ;(await store.queue(report.submissionId, 'u1'))
    await expectBugReportError(
      async () => (await store.deleteDraft(report.submissionId, 'u1')),
      'bug_report_delete_conflict',
      409,
    )
    const claim = (await store.claim(report.submissionId))!
    ;(await store.defer(claim, 'failed', 'github_permission_denied'))
    ;(await store.recordAttempt(
      report.submissionId,
      'create',
      'permission',
      now,
    ))

    ;(await store.deleteDraft(report.submissionId, 'u1'))
    await expectBugReportError(
      async () => (await store.getOwned(report.submissionId, 'u1')),
      'bug_report_not_found',
      404,
    )
    expect((await db.prepare(`
      SELECT reporter_user_id, phenomenon, submitted_at, discarded_at
      FROM bug_reports WHERE submission_id = ?
    `).get(report.submissionId))).toMatchObject({
      reporter_user_id: 'u1',
      phenomenon: null,
      submitted_at: now,
      discarded_at: now,
    })
    expect(((await db.prepare(`
      SELECT COUNT(*) AS count
      FROM bug_report_attempts WHERE submission_id = ?
    `).get(report.submissionId)) as { count: number }).count).toBe(1)

    for (const phenomenon of ['Second problem', 'Third problem']) {
      const next = (await store.createDraft({ userId: 'u1', roomId, phenomenon }))
      ;(await store.updateDraft(next.submissionId, 'u1', {
        authorIdentity: 'hosted',
        confirmHosted: true,
      }))
      ;(await store.queue(next.submissionId, 'u1'))
    }
    const fourth = (await store.createDraft({
      userId: 'u1',
      roomId,
      phenomenon: 'Fourth problem',
    }))
    ;(await store.updateDraft(fourth.submissionId, 'u1', {
      authorIdentity: 'hosted',
      confirmHosted: true,
    }))
    await expectBugReportError(
      async () => (await store.queue(fourth.submissionId, 'u1')),
      'bug_report_rate_limited',
      429,
    )
  })

  it('allows account deletion after a failed submission is discarded', async () => {
    const roomId = (await insertContext('active'))
    const report = (await store.createDraft({
      userId: 'u1',
      roomId,
      phenomenon: 'The game froze',
    }))
    ;(await store.updateDraft(report.submissionId, 'u1', {
      authorIdentity: 'hosted',
      confirmHosted: true,
    }))
    ;(await store.queue(report.submissionId, 'u1'))
    const claim = (await store.claim(report.submissionId))!
    ;(await store.defer(claim, 'failed', 'github_permission_denied'))
    ;(await store.recordAttempt(report.submissionId, 'create', 'permission', now))
    ;(await store.deleteDraft(report.submissionId, 'u1'))

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
    expect((await db.prepare(`
      SELECT reporter_user_id, submitted_at, discarded_at
      FROM bug_reports WHERE submission_id = ?
    `).get(report.submissionId))).toMatchObject({
      reporter_user_id: null,
      submitted_at: now,
      discarded_at: now,
    })
    expect((await db.prepare(`
      SELECT COUNT(*) AS count
      FROM bug_report_attempts WHERE submission_id = ?
    `).get(report.submissionId))).toEqual({ count: 2 })
  })

  it('finds and anonymizes an Issue from a discarded uncertain submission', async () => {
    const roomId = (await insertContext('active'))
    const report = (await store.createDraft({
      userId: 'u1',
      roomId,
      phenomenon: 'The game froze',
    }))
    ;(await store.updateDraft(report.submissionId, 'u1', {
      authorIdentity: 'hosted',
      confirmHosted: true,
    }))
    ;(await store.queue(report.submissionId, 'u1'))
    const claim = (await store.claim(report.submissionId))!
    ;(await store.defer(claim, 'failed', 'github_result_uncertain'))
    ;(await store.recordAttempt(report.submissionId, 'create', 'uncertain', now))
    ;(await store.deleteDraft(report.submissionId, 'u1'))
    const adapter = successAdapter()
    vi.mocked(adapter.anonymizeIssue).mockResolvedValueOnce({
      ok: false,
      kind: 'uncertain',
      code: 'github_anonymization_uncertain',
    })
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
    expect((await store.reportForEvidence(report.submissionId))?.reporter_user_id)
      .toBe('u1')

    await expect(delivery.deleteReporter('u1')).rejects.toMatchObject({
      code: 'github_anonymization_uncertain',
      status: 503,
    })
    expect((await store.reportForEvidence(report.submissionId))).toMatchObject({
      reporter_user_id: 'u1',
      status: 'submitted',
      github_issue_number: 9,
      github_issue_url: 'https://github.com/titanxxh/open-agricola-issues/issues/9',
    })

    await delivery.deleteReporter('u1')

    expect(adapter.anonymizeIssue).toHaveBeenCalledWith(9, 'u1')
    expect(adapter.findIssueByMarker).toHaveBeenCalledTimes(2)
    expect((await store.reportForEvidence(report.submissionId))?.reporter_user_id)
      .toBeNull()
  })

  it('anonymizes known Issues and revokes GitHub before account deletion', async () => {
    const roomId = (await insertContext('active'))
    const submitted = (await store.createDraft({
      userId: 'u1',
      roomId,
      phenomenon: 'Published problem',
    }))
    ;(await store.updateDraft(submitted.submissionId, 'u1', {
      authorIdentity: 'hosted',
      confirmHosted: true,
    }))
    ;(await store.queue(submitted.submissionId, 'u1'))
    const adapter = successAdapter()
    const delivery = new BugReportDelivery(
      store,
      adapter,
      'https://game.example',
      () => now,
    )
    await delivery.deliver(submitted.submissionId)
    ;(await store.createDraft({
      userId: 'u1',
      roomId,
      phenomenon: 'Unsubmitted private draft',
    }))
    ;(await store.saveConnection('u1', '99', {
      accessToken: 'user-token',
      accessTokenExpiresAt: now + 3_600_000,
    }))

    vi.mocked(adapter.anonymizeIssue).mockResolvedValueOnce({
      ok: false,
      kind: 'uncertain',
      code: 'github_anonymization_uncertain',
    })
    await expect(delivery.deleteReporter('u1')).rejects.toMatchObject({
      code: 'github_anonymization_uncertain',
      status: 503,
    })
    expect((await store.connectionStatus('u1')).connected).toBe(true)
    expect((await store.getOwned(submitted.submissionId, 'u1')).reporterUserId)
      .toBe('u1')

    await delivery.deleteReporter('u1')

    expect(adapter.anonymizeIssue).toHaveBeenCalledWith(7, 'u1')
    expect(adapter.revokeUserGrant).toHaveBeenCalledWith('user-token')
    expect((await store.connectionStatus('u1'))).toEqual({ connected: false })
    expect((await db.prepare(`
      SELECT COUNT(*) AS count
      FROM bug_reports
      WHERE reporter_user_id IS NOT NULL OR phenomenon IS NOT NULL
    `).get())).toEqual({ count: 0 })
    expect(((await db.prepare(`
      SELECT COUNT(*) AS count FROM bug_report_attempts
    `).get()) as { count: number }).count).toBeGreaterThan(0)
  })

  it('reconciles an interrupted delivery before creating another Issue', async () => {
    const roomId = (await insertContext('active'))
    const report = (await store.createDraft({
      userId: 'u1',
      roomId,
      phenomenon: 'The game froze',
    }))
    ;(await store.updateDraft(report.submissionId, 'u1', {
      authorIdentity: 'hosted',
      confirmHosted: true,
    }))
    ;(await store.queue(report.submissionId, 'u1'))

    expect((await store.claim(report.submissionId))?.mode).toBe('create')
    now += 5 * 60_000 + 1

    expect((await store.claim(report.submissionId))?.mode).toBe('reconcile')
  })

  it('stops after all three uncertain reconciliation delays', async () => {
    const roomId = (await insertContext('active'))
    const report = (await store.createDraft({
      userId: 'u1',
      roomId,
      phenomenon: 'GitHub never returned a definite result',
    }))
    ;(await store.updateDraft(report.submissionId, 'u1', {
      authorIdentity: 'hosted',
      confirmHosted: true,
    }))
    ;(await store.queue(report.submissionId, 'u1'))
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
    expect((await store.getOwned(report.submissionId, 'u1')).status).toBe('reconcile')
    now += 30_000
    await delivery.deliver(report.submissionId)
    expect((await store.getOwned(report.submissionId, 'u1')).status).toBe('reconcile')
    now += 120_000
    await delivery.deliver(report.submissionId)
    expect((await store.getOwned(report.submissionId, 'u1')).status).toBe('reconcile')
    now += 600_000
    await delivery.deliver(report.submissionId)

    expect(adapter.createIssue).toHaveBeenCalledTimes(1)
    expect(adapter.findIssueByMarker).toHaveBeenCalledTimes(4)
    expect((await store.getOwned(report.submissionId, 'u1'))).toMatchObject({
      status: 'failed',
      lastErrorCode: 'github_result_uncertain',
    })
  })
})
