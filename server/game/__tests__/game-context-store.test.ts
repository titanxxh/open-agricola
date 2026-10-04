import type { IncomingMessage, ServerResponse } from 'node:http'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { handleGameContextRoute } from '../../game-context-routes.ts'
import { GameContextStore } from '../game-context-store.ts'

const createDb = () => {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE rooms (
      id TEXT PRIMARY KEY,
      version INTEGER NOT NULL
    );
    CREATE TABLE room_players (
      room_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      player_index INTEGER NOT NULL
    );
    CREATE TABLE game_contexts (
      room_id TEXT PRIMARY KEY,
      lifecycle TEXT NOT NULL,
      phase TEXT,
      replay_status TEXT,
      expires_at INTEGER,
      removal_reason TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE game_results (
      room_id TEXT PRIMARY KEY,
      started_at INTEGER NOT NULL,
      finished_at INTEGER NOT NULL,
      rounds_played INTEGER NOT NULL,
      player_count INTEGER NOT NULL,
      enable_community_deck INTEGER NOT NULL,
      enable_parent_cards INTEGER NOT NULL,
      enable_through_the_seasons INTEGER NOT NULL,
      enable_farmers_of_the_moor INTEGER NOT NULL,
      enable_snake_opening INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE game_result_players (
      room_id TEXT NOT NULL,
      player_index INTEGER NOT NULL,
      game_player_id TEXT NOT NULL,
      user_id TEXT,
      name_is_default INTEGER NOT NULL DEFAULT 0,
      display_name TEXT NOT NULL,
      score INTEGER NOT NULL
    );
    CREATE TABLE game_replays (
      room_id TEXT PRIMARY KEY,
      schema_version INTEGER NOT NULL,
      viewer_build_id TEXT NOT NULL,
      game_build_id TEXT NOT NULL,
      status TEXT NOT NULL,
      latest_step_no INTEGER NOT NULL,
      missing_prefix INTEGER NOT NULL,
      custom_cards_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      completed_at INTEGER
    );
    CREATE TABLE game_replay_steps (
      room_id TEXT NOT NULL,
      step_no INTEGER NOT NULL
    );
  `)
  return db
}

const insertContext = (
  db: Database.Database,
  roomId: string,
  lifecycle: string,
  values: {
    phase?: string | null
    replayStatus?: string | null
    expiresAt?: number | null
    removalReason?: string | null
  } = {},
) => {
  db.prepare(`
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
  )
}

const insertCompleted = (
  db: Database.Database,
  roomId: string,
  replayStatus: 'available' | 'legacy_no_replay',
  options: { snakeOpening?: boolean } = {},
) => {
  insertContext(db, roomId, 'completed', { replayStatus })
  db.prepare(`
    INSERT INTO game_results VALUES (?, 10, 20, 14, 2, 1, 0, 1, 0, ?)
  `).run(roomId, options.snakeOpening ? 1 : 0)
  db.prepare(`
    INSERT INTO game_result_players (room_id, player_index, game_player_id, user_id, display_name, score) VALUES (?, 0, 'p1', 'u1', 'Alice', 42)
  `).run(roomId)
  db.prepare(`
    INSERT INTO game_result_players (room_id, player_index, game_player_id, user_id, display_name, score) VALUES (?, 1, 'p2', 'u2', 'Bob', 35)
  `).run(roomId)
  if (replayStatus === 'available') {
    db.prepare(`
      INSERT INTO game_replays
      VALUES (?, 1, 'viewer-1', 'game-1', 'completed', 4, 0, '[]', 10, 20)
    `).run(roomId)
    db.prepare('INSERT INTO game_replay_steps VALUES (?, 0)').run(roomId)
    db.prepare('INSERT INTO game_replay_steps VALUES (?, 4)').run(roomId)
  }
}

type CapturedResponse = {
  status: number
  headers: Record<string, string>
  body: string
}

const requestRoute = (
  store: GameContextStore,
  path: string,
  userId?: string,
  headers: Record<string, string> = {},
): CapturedResponse => {
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
  expect(handleGameContextRoute(
    req,
    res,
    store,
    userId
      ? { id: userId, username: userId, displayName: userId }
      : null,
  )).toBe(true)
  return captured
}

afterEach(() => {
  delete process.env.PUBLIC_APP_ORIGIN
})

describe('GameContextStore', () => {
  it('retains generated-name provenance in public completed results', () => {
    const db = createDb()
    insertCompleted(db, 'default-names', 'available')
    db.prepare("UPDATE game_result_players SET display_name = 'Player 2', name_is_default = player_index").run()
    expect(new GameContextStore(db).resolve('default-names')).toMatchObject({
      ok: true,
      result: { players: [
        { playerIndex: 0, displayName: 'Player 2' },
        { playerIndex: 1, displayName: 'Player 2', nameIsDefault: true },
      ] },
    })
    db.close()
  })
  it('resolves every lifecycle without exposing internal user ids', () => {
    const db = createDb()
    insertContext(db, 'active-room', 'active', {
      phase: 'playing',
      expiresAt: 20_000,
    })
    db.prepare('INSERT INTO rooms VALUES (?, ?)').run('active-room', 7)
    db.prepare('INSERT INTO room_players VALUES (?, ?, ?)').run('active-room', 'u1', 0)
    db.prepare('INSERT INTO game_replays VALUES (?, 1, ?, ?, ?, 4, 0, ?, 1, NULL)')
      .run('active-room', 'viewer-1', 'game-1', 'recording', '[]')
    insertCompleted(db, 'completed-room', 'available')
    insertCompleted(db, 'legacy-room', 'legacy_no_replay', { snakeOpening: true })
    insertContext(db, 'expired-room', 'expired')
    insertContext(db, 'removed-room', 'removed', { removalReason: 'private detail' })
    const store = new GameContextStore(db, () => 1_000)

    expect(store.resolve('active-room')).toMatchObject({
      ok: false,
      code: 'login_required',
      lifecycle: 'active',
    })
    expect(store.resolve('active-room', 'u9')).toMatchObject({
      ok: false,
      code: 'not_participant',
      lifecycle: 'active',
    })
    expect(store.resolve('active-room', 'u1')).toEqual({
      ok: true,
      roomId: 'active-room',
      lifecycle: 'active',
      phase: 'playing',
      playerIndex: 0,
      roomVersion: 7,
      stepNo: 4,
      expiresAt: 20_000,
    })
    expect(store.resolve('completed-room')).toEqual({
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
    expect(JSON.stringify(store.resolve('completed-room'))).not.toContain('u1')
    expect(store.resolve('legacy-room')).toMatchObject({
      ok: true,
      lifecycle: 'completed',
      replayStatus: 'legacy_no_replay',
      result: { enableSnakeOpening: true },
    })
    expect(store.resolve('expired-room')).toEqual({
      ok: true,
      roomId: 'expired-room',
      lifecycle: 'expired',
    })
    expect(store.resolve('removed-room')).toEqual({
      ok: true,
      roomId: 'removed-room',
      lifecycle: 'removed',
      reason: 'removed',
    })
    expect(store.resolve('missing-room')).toMatchObject({
      ok: false,
      code: 'unknown_context',
    })
    db.close()
  })

  it('expires an active room at its persisted deadline', () => {
    const db = createDb()
    insertContext(db, 'due-room', 'active', {
      phase: 'playing',
      expiresAt: 999,
    })
    db.prepare('INSERT INTO rooms VALUES (?, 1)').run('due-room')
    const store = new GameContextStore(db, () => 1_000)

    expect(store.resolve('due-room')).toEqual({
      ok: true,
      roomId: 'due-room',
      lifecycle: 'expired',
    })
    expect(db.prepare('SELECT 1 FROM rooms WHERE id = ?').get('due-room')).toBeUndefined()
    db.close()
  })

  it('serves active auth errors and cache-revalidated public descriptors', () => {
    const db = createDb()
    insertContext(db, 'active-room', 'active', { phase: 'waiting' })
    db.prepare('INSERT INTO rooms VALUES (?, 2)').run('active-room')
    db.prepare('INSERT INTO room_players VALUES (?, ?, ?)').run('active-room', 'u1', 0)
    insertCompleted(db, 'completed-room', 'legacy_no_replay')
    const store = new GameContextStore(db, () => 1_000)
    process.env.PUBLIC_APP_ORIGIN = 'https://example.test/open-agricola/'

    const loginRequired = requestRoute(store, '/api/v1/game-contexts/active-room')
    expect(loginRequired.status).toBe(401)
    expect(JSON.parse(loginRequired.body)).toMatchObject({
      code: 'login_required',
      returnTo: '/open-agricola/?context=active-room',
    })
    expect(loginRequired.headers['Cache-Control']).toBe('no-store')

    const publicResult = requestRoute(store, '/api/v1/game-contexts/completed-room')
    expect(publicResult.status).toBe(200)
    expect(publicResult.headers['Cache-Control']).toBe('no-cache')
    expect(publicResult.headers.ETag).toMatch(/^"[a-f0-9]{64}"$/)

    const revalidated = requestRoute(
      store,
      '/api/v1/game-contexts/completed-room',
      undefined,
      { 'if-none-match': publicResult.headers.ETag! },
    )
    expect(revalidated.status).toBe(304)
    expect(revalidated.body).toBe('')

    expect(requestRoute(store, '/api/v1/game-contexts/%2Fbad').status).toBe(400)
    expect(requestRoute(store, '/api/v1/game-contexts/missing-room').status).toBe(404)
    db.close()
  })
})
