import type { IncomingMessage, ServerResponse } from 'node:http'
import { createTestDatabase } from '../../__tests__/_helpers/postgres'
import type { PostgresDatabase } from '../../database/postgres'
import { afterEach, describe, expect, it } from 'vitest'
import { handleGameContextRoute } from '../../game-context-routes.ts'
import { GameContextStore } from '../game-context-store.ts'

const createDb = async () => {
  const db = await createTestDatabase()
  for (const id of ['u1', 'u2']) await db.prepare('INSERT INTO users (id, username, display_name, password_hash, created_at) VALUES (?, ?, ?, ?, 1)').run(id, id, id, '')
  return db
}

const insertContext = async (
  db: PostgresDatabase,
  roomId: string,
  lifecycle: string,
  values: {
    phase?: string | null
    replayStatus?: string | null
    expiresAt?: number | null
    removalReason?: string | null
  } = {},
) => {
  ;(await db.prepare(`
    INSERT INTO game_contexts (
      room_id, lifecycle, phase, replay_status, expires_at,
      removal_reason, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 1, 1)
  `).run(
    roomId,
    lifecycle,
    values.phase ?? null,
    values.replayStatus ?? null,
    values.expiresAt ?? null,
    values.removalReason ?? null,
  ))
}

const insertCompleted = async (
  db: PostgresDatabase,
  roomId: string,
  replayStatus: 'available' | 'legacy_no_replay',
  options: { snakeOpening?: boolean } = {},
) => {
  ;(await insertContext(db, roomId, 'completed', { replayStatus }))
  ;(await db.prepare(`
    INSERT INTO game_results VALUES (?, 10, 20, 14, 2, 1, 0, 1, 0, ?)
  `).run(roomId, options.snakeOpening ? 1 : 0))
  ;(await db.prepare(`
    INSERT INTO game_result_players (room_id, player_index, game_player_id, user_id, display_name, score) VALUES (?, 0, 'p1', 'u1', 'Alice', 42)
  `).run(roomId))
  ;(await db.prepare(`
    INSERT INTO game_result_players (room_id, player_index, game_player_id, user_id, display_name, score) VALUES (?, 1, 'p2', 'u2', 'Bob', 35)
  `).run(roomId))
  if (replayStatus === 'available') {
    ;(await db.prepare(`
      INSERT INTO game_replays
      VALUES (?, 1, 'viewer-1', 'game-1', 'completed', 4, 0, '[]', 10, 20)
    `).run(roomId))
    await db.prepare(`INSERT INTO game_replay_steps (room_id, step_no, room_version, checkpoint_step_no, command_type, intent_json, payload_kind, payload_gzip, frame_hash, created_at) VALUES (?, 0, 0, 0, 'test', '{}', 'checkpoint', decode('00', 'hex'), repeat('a', 64), 1)`).run(roomId)
    await db.prepare(`INSERT INTO game_replay_steps (room_id, step_no, room_version, checkpoint_step_no, command_type, intent_json, payload_kind, payload_gzip, frame_hash, created_at) VALUES (?, 4, 4, 0, 'test', '{}', 'checkpoint', decode('00', 'hex'), repeat('a', 64), 1)`).run(roomId)
  }
}

type CapturedResponse = {
  status: number
  headers: Record<string, string>
  body: string
}

const requestRoute = async (
  store: GameContextStore,
  path: string,
  userId?: string,
  headers: Record<string, string> = {},
): Promise<Awaited<CapturedResponse>> => {
  const captured: CapturedResponse = { status: 0, headers: {}, body: '' }
  const req = {
    method: 'GET',
    url: path,
    headers: { host: 'localhost', ...headers },
  } as unknown as IncomingMessage
  const res = {
    writeHead(status: number, responseHeaders: Record<string, string>) {
      captured.status = status
      captured.headers = responseHeaders
    },
    end(body?: string) {
      captured.body = body ?? ''
    },
  } as unknown as ServerResponse
  expect((await handleGameContextRoute(
    req,
    res,
    store,
    userId
      ? { id: userId, username: userId, displayName: userId }
      : null,
  ))).toBe(true)
  return captured
}

afterEach(() => {
  delete process.env.PUBLIC_APP_ORIGIN
})

describe('GameContextStore', () => {
  it('retains generated-name provenance in public completed results', async () => {
    const db = (await createDb())
    ;(await insertCompleted(db, 'default-names', 'available'))
    ;(await db.prepare("UPDATE game_result_players SET display_name = 'Player 2', name_is_default = player_index").run())
    expect((await new GameContextStore(db).resolve('default-names'))).toMatchObject({
      ok: true,
      result: { players: [
        { playerIndex: 0, displayName: 'Player 2' },
        { playerIndex: 1, displayName: 'Player 2', nameIsDefault: true },
      ] },
    })
    ;(await db.close())
  })
  it('resolves every lifecycle without exposing internal user ids', async () => {
    const db = (await createDb())
    ;(await insertContext(db, 'active-room', 'active', {
      phase: 'playing',
      expiresAt: 20_000,
    }))
    ;(await db.prepare('INSERT INTO rooms (id, version, created_at, updated_at) VALUES (?, ?, 1, 1)').run('active-room', 7))
    ;(await db.prepare('INSERT INTO room_players (room_id, user_id, player_index, joined_at) VALUES (?, ?, ?, 1)').run('active-room', 'u1', 0))
    ;(await db.prepare('INSERT INTO game_replays VALUES (?, 1, ?, ?, ?, 4, 0, ?, 1, NULL)')
      .run('active-room', 'viewer-1', 'game-1', 'recording', '[]'))
    ;(await insertCompleted(db, 'completed-room', 'available'))
    ;(await insertCompleted(db, 'legacy-room', 'legacy_no_replay', { snakeOpening: true }))
    ;(await insertContext(db, 'expired-room', 'expired'))
    ;(await insertContext(db, 'removed-room', 'removed', { removalReason: 'private detail' }))
    const store = new GameContextStore(db, () => 1_000)

    expect((await store.resolve('active-room'))).toMatchObject({
      ok: false,
      code: 'login_required',
      lifecycle: 'active',
    })
    expect((await store.resolve('active-room', 'u9'))).toMatchObject({
      ok: false,
      code: 'not_participant',
      lifecycle: 'active',
    })
    expect((await store.resolve('active-room', 'u1'))).toEqual({
      ok: true,
      roomId: 'active-room',
      lifecycle: 'active',
      phase: 'playing',
      playerIndex: 0,
      roomVersion: 7,
      stepNo: 4,
      expiresAt: 20_000,
    })
    expect((await store.resolve('completed-room'))).toEqual({
      ok: true,
      roomId: 'completed-room',
      lifecycle: 'completed',
      replayStatus: 'available',
      result: {
        startedAt: 10,
        finishedAt: 20,
        roundsPlayed: 14,
        playerCount: 2,
        enableCommunityDeck: true,
        enableParentCards: false,
        enableThroughTheSeasons: true,
        enableFarmersOfTheMoor: false,
        enableSnakeOpening: false,
        players: [
          { playerIndex: 0, displayName: 'Alice', score: 42 },
          { playerIndex: 1, displayName: 'Bob', score: 35 },
        ],
      },
      replay: {
        firstStepNo: 0,
        lastStepNo: 4,
        missingPrefix: false,
        schemaVersion: 1,
        viewerBuildId: 'viewer-1',
      },
    })
    expect(JSON.stringify((await store.resolve('completed-room')))).not.toContain('u1')
    expect((await store.resolve('legacy-room'))).toMatchObject({
      ok: true,
      lifecycle: 'completed',
      replayStatus: 'legacy_no_replay',
      result: { enableSnakeOpening: true },
    })
    expect((await store.resolve('expired-room'))).toEqual({
      ok: true,
      roomId: 'expired-room',
      lifecycle: 'expired',
    })
    expect((await store.resolve('removed-room'))).toEqual({
      ok: true,
      roomId: 'removed-room',
      lifecycle: 'removed',
      reason: 'removed',
    })
    expect((await store.resolve('missing-room'))).toMatchObject({
      ok: false,
      code: 'unknown_context',
    })
    ;(await db.close())
  })

  it('expires an active room at its persisted deadline', async () => {
    const db = (await createDb())
    ;(await insertContext(db, 'due-room', 'active', {
      phase: 'playing',
      expiresAt: 999,
    }))
    ;(await db.prepare('INSERT INTO rooms (id, version, created_at, updated_at) VALUES (?, 1, 1, 1)').run('due-room'))
    const store = new GameContextStore(db, () => 1_000)

    expect((await store.resolve('due-room'))).toEqual({
      ok: true,
      roomId: 'due-room',
      lifecycle: 'expired',
    })
    expect((await db.prepare('SELECT 1 FROM rooms WHERE id = ?').get('due-room'))).toBeUndefined()
    ;(await db.close())
  })

  it('serves active auth errors and cache-revalidated public descriptors', async () => {
    const db = (await createDb())
    ;(await insertContext(db, 'active-room', 'active', { phase: 'waiting' }))
    ;(await db.prepare('INSERT INTO rooms (id, version, created_at, updated_at) VALUES (?, 2, 1, 1)').run('active-room'))
    ;(await db.prepare('INSERT INTO room_players (room_id, user_id, player_index, joined_at) VALUES (?, ?, ?, 1)').run('active-room', 'u1', 0))
    ;(await insertCompleted(db, 'completed-room', 'legacy_no_replay'))
    const store = new GameContextStore(db, () => 1_000)
    process.env.PUBLIC_APP_ORIGIN = 'https://example.test/open-agricola/'

    const loginRequired = (await requestRoute(store, '/api/v1/game-contexts/active-room'))
    expect(loginRequired.status).toBe(401)
    expect(JSON.parse(loginRequired.body)).toMatchObject({
      code: 'login_required',
      returnTo: '/open-agricola/?context=active-room',
    })
    expect(loginRequired.headers['Cache-Control']).toBe('no-store')

    const publicResult = (await requestRoute(store, '/api/v1/game-contexts/completed-room'))
    expect(publicResult.status).toBe(200)
    expect(publicResult.headers['Cache-Control']).toBe('no-cache')
    expect(publicResult.headers.ETag).toMatch(/^"[a-f0-9]{64}"$/)

    const revalidated = (await requestRoute(
      store,
      '/api/v1/game-contexts/completed-room',
      undefined,
      { 'if-none-match': publicResult.headers.ETag! },
    ))
    expect(revalidated.status).toBe(304)
    expect(revalidated.body).toBe('')

    expect((await requestRoute(store, '/api/v1/game-contexts/%2Fbad')).status).toBe(400)
    expect((await requestRoute(store, '/api/v1/game-contexts/missing-room')).status).toBe(404)
    ;(await db.close())
  })
})
