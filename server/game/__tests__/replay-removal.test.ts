import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { runMigrations } from '../../db.ts'
import { GameContextStore } from '../game-context-store.ts'
import { ReplayStore } from '../replay-store.ts'
import {
  applyReplayRemovalLedger,
  removeReplay,
} from '../replay-removal.ts'

const hashOf = (body: string): string =>
  createHash('sha256').update(body).digest('hex')

describe('replay removal', () => {
  let tempDir: string
  let assetRoot: string
  let ledgerPath: string
  const databases: Database.Database[] = []

  const createDb = (): Database.Database => {
    const db = new Database(':memory:')
    db.pragma('foreign_keys = ON')
    runMigrations(db)
    databases.push(db)
    return db
  }

  const writeAsset = (body: string): string => {
    const hash = hashOf(body)
    writeFileSync(join(assetRoot, hash), body)
    return hash
  }

  const seedReplay = (
    db: Database.Database,
    roomId: string,
    assetHashes: string[] = [],
  ): void => {
    const now = 100
    db.prepare(`
      INSERT INTO game_contexts (
        room_id, lifecycle, phase, replay_status, expires_at,
        removal_reason, created_at, updated_at
      ) VALUES (?, 'completed', NULL, 'available', NULL, NULL, ?, ?)
    `).run(roomId, now, now)
    db.prepare(`
      INSERT INTO game_results (
        room_id, started_at, finished_at, rounds_played, player_count,
        enable_community_deck, enable_parent_cards,
        enable_through_the_seasons, enable_farmers_of_the_moor
      ) VALUES (?, 1, 2, 14, 2, 0, 0, 0, 0)
    `).run(roomId)
    db.prepare(`
      INSERT INTO game_result_players (
        room_id, player_index, game_player_id, user_id, display_name, score
      ) VALUES (?, 0, 'p1', NULL, 'Alice', 42)
    `).run(roomId)
    db.prepare(`
      INSERT INTO game_replays (
        room_id, schema_version, viewer_build_id, game_build_id, status,
        latest_step_no, missing_prefix, custom_cards_json, created_at, completed_at
      ) VALUES (?, 1, ?, 'game-build', 'completed', 0, 0, ?, ?, ?)
    `).run(
      roomId,
      'a'.repeat(64),
      JSON.stringify(assetHashes.map((hash, index) => ({
        cardType: 'minor',
        cardJson: { id: `CUSTOM_${index}` },
        artUrl: `/replay-assets/${hash}`,
      }))),
      now,
      now,
    )
    db.prepare(`
      INSERT INTO game_replay_steps (
        room_id, step_no, room_version, checkpoint_step_no, player_index,
        command_type, intent_json, payload_kind, payload_gzip, frame_hash, created_at
      ) VALUES (?, 0, 1, 0, NULL, 'initial', '{}', 'checkpoint', ?, ?, ?)
    `).run(roomId, Buffer.from('private replay payload'), 'b'.repeat(64), now)
  }

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'open-agricola-replay-removal-'))
    assetRoot = join(tempDir, 'replay-assets')
    ledgerPath = join(tempDir, 'replay-removals.jsonl')
    mkdirSync(assetRoot)
  })

  afterEach(() => {
    while (databases.length > 0) databases.pop()!.close()
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('dry-runs an exact completed room and rejects unsafe targets', () => {
    const db = createDb()
    const hash = writeAsset('room-only-art')
    seedReplay(db, 'room-one', [hash])

    expect(removeReplay(db, {
      roomId: 'room-one',
      reason: 'moderation',
      dryRun: true,
      assetRoot,
      ledgerPath,
      now: () => 200,
    })).toMatchObject({
      dryRun: true,
      roomIds: ['room-one'],
      assetHashes: [hash],
    })
    expect(db.prepare(`
      SELECT lifecycle FROM game_contexts WHERE room_id = 'room-one'
    `).get()).toEqual({ lifecycle: 'completed' })
    expect(existsSync(ledgerPath)).toBe(false)
    expect(existsSync(join(assetRoot, hash))).toBe(true)

    expect(() => removeReplay(db, {
      roomId: '*',
      reason: 'moderation',
      assetRoot,
      ledgerPath,
    })).toThrow('invalid room id')
    expect(() => removeReplay(db, {
      roomId: 'missing-room',
      reason: 'moderation',
      assetRoot,
      ledgerPath,
    })).toThrow('replay not found')
  })

  it('keeps a tombstone, anonymizes results, and records an idempotent ledger entry', () => {
    const db = createDb()
    const hash = writeAsset('sensitive-art')
    seedReplay(db, 'room-one', [hash])

    expect(removeReplay(db, {
      roomId: 'room-one',
      reason: 'legal',
      assetRoot,
      ledgerPath,
      now: () => 200,
    })).toMatchObject({
      dryRun: false,
      alreadyRemoved: false,
      roomIds: ['room-one'],
      deletedAssetHashes: [hash],
    })
    expect(db.prepare(`
      SELECT lifecycle, replay_status, removal_reason
      FROM game_contexts WHERE room_id = 'room-one'
    `).get()).toEqual({
      lifecycle: 'removed',
      replay_status: null,
      removal_reason: 'legal',
    })
    expect(db.prepare(`
      SELECT COUNT(*) AS count FROM game_replays WHERE room_id = 'room-one'
    `).get()).toEqual({ count: 0 })
    expect(db.prepare(`
      SELECT COUNT(*) AS count FROM game_replay_steps WHERE room_id = 'room-one'
    `).get()).toEqual({ count: 0 })
    expect(db.prepare(`
      SELECT user_id, display_name
      FROM game_result_players WHERE room_id = 'room-one'
    `).get()).toEqual({
      user_id: null,
      display_name: 'Deleted player (seat 1)',
    })
    expect(existsSync(join(assetRoot, hash))).toBe(false)

    const ledger = readFileSync(ledgerPath, 'utf8').trim().split('\n')
    expect(ledger).toHaveLength(1)
    expect(JSON.parse(ledger[0]!)).toEqual({
      version: 1,
      entries: [{
        version: 1,
        roomId: 'room-one',
        reason: 'legal',
        removedAt: 200,
        assetHashes: [hash],
        eraseResult: false,
      }],
      assetTakedowns: [],
    })

    expect(removeReplay(db, {
      roomId: 'room-one',
      reason: 'legal',
      assetRoot,
      ledgerPath,
      now: () => 300,
    })).toMatchObject({
      alreadyRemoved: true,
      roomIds: ['room-one'],
    })
    expect(readFileSync(ledgerPath, 'utf8').trim().split('\n')).toHaveLength(1)
  })

  it('keeps shared assets until the final referencing replay is removed', () => {
    const db = createDb()
    const sharedHash = writeAsset('shared-art')
    const uniqueHash = writeAsset('unique-art')
    seedReplay(db, 'room-one', [sharedHash, uniqueHash])
    seedReplay(db, 'room-two', [sharedHash])

    const first = removeReplay(db, {
      roomId: 'room-one',
      reason: 'moderation',
      assetRoot,
      ledgerPath,
    })
    expect(first.deletedAssetHashes).toEqual([uniqueHash])
    expect(existsSync(join(assetRoot, sharedHash))).toBe(true)

    const second = removeReplay(db, {
      roomId: 'room-two',
      reason: 'moderation',
      assetRoot,
      ledgerPath,
    })
    expect(second.deletedAssetHashes).toEqual([sharedHash])
    expect(existsSync(join(assetRoot, sharedHash))).toBe(false)
  })

  it('removes every replay referencing an asset identified as the offending content', () => {
    const db = createDb()
    const sharedHash = writeAsset('offending-shared-art')
    seedReplay(db, 'room-one', [sharedHash])
    seedReplay(db, 'room-two', [sharedHash])

    const result = removeReplay(db, {
      roomId: 'room-one',
      reason: 'legal',
      assetHash: sharedHash,
      assetRoot,
      ledgerPath,
      now: () => 200,
    })

    expect(result.roomIds).toEqual(['room-one', 'room-two'])
    expect(db.prepare(`
      SELECT room_id, lifecycle
      FROM game_contexts ORDER BY room_id
    `).all()).toEqual([
      { room_id: 'room-one', lifecycle: 'removed' },
      { room_id: 'room-two', lifecycle: 'removed' },
    ])
    const batches = readFileSync(ledgerPath, 'utf8').trim().split('\n')
    expect(batches).toHaveLength(1)
    expect(JSON.parse(batches[0]!)).toMatchObject({
      assetTakedowns: [{
        hash: sharedHash,
        reason: 'legal',
        removedAt: 200,
      }],
    })
    expect(JSON.parse(batches[0]!).entries).toHaveLength(2)
    expect(existsSync(join(assetRoot, sharedHash))).toBe(false)
  })

  it('uses a tombstoned room to take down every remaining reference to an offending asset', () => {
    const db = createDb()
    const sharedHash = writeAsset('later-offending-art')
    seedReplay(db, 'room-one', [sharedHash])
    seedReplay(db, 'room-two', [sharedHash])
    removeReplay(db, {
      roomId: 'room-one',
      reason: 'moderation',
      assetRoot,
      ledgerPath,
      now: () => 100,
    })

    expect(removeReplay(db, {
      roomId: 'room-one',
      reason: 'legal',
      assetHash: sharedHash,
      assetRoot,
      ledgerPath,
      now: () => 200,
    })).toMatchObject({
      alreadyRemoved: false,
      roomIds: ['room-one', 'room-two'],
      deletedAssetHashes: [sharedHash],
    })
    expect(db.prepare(`
      SELECT lifecycle FROM game_contexts WHERE room_id = 'room-two'
    `).get()).toEqual({ lifecycle: 'removed' })
    const batches = readFileSync(ledgerPath, 'utf8').trim().split('\n')
      .map((line) => JSON.parse(line))
    expect(batches[1].assetTakedowns).toEqual([{
      hash: sharedHash,
      reason: 'legal',
      removedAt: 200,
    }])
  })

  it('durably deletes the result archive for an explicit full-record legal erasure', () => {
    const live = createDb()
    const restored = createDb()
    seedReplay(live, 'room-one')
    seedReplay(restored, 'room-one')

    removeReplay(live, {
      roomId: 'room-one',
      reason: 'legal',
      assetRoot,
      ledgerPath,
      now: () => 100,
    })
    live.prepare("DELETE FROM game_results WHERE room_id = 'room-one'").run()
    removeReplay(live, {
      roomId: 'room-one',
      reason: 'legal',
      eraseResult: true,
      assetRoot,
      ledgerPath,
      now: () => 200,
    })
    expect(live.prepare(`
      SELECT COUNT(*) AS count FROM game_results WHERE room_id = 'room-one'
    `).get()).toEqual({ count: 0 })

    applyReplayRemovalLedger(restored, { assetRoot, ledgerPath })
    expect(restored.prepare(`
      SELECT COUNT(*) AS count FROM game_results WHERE room_id = 'room-one'
    `).get()).toEqual({ count: 0 })
  })

  it('clears participant identities when an asset sweep removes an active replay', () => {
    const db = createDb()
    const hash = writeAsset('active-sensitive-art')
    seedReplay(db, 'active-room', [hash])
    db.prepare(`
      INSERT INTO users (
        id, username, display_name, password_hash, created_at
      ) VALUES ('active-user', 'active_user', 'Active User', 'hash', 100)
    `).run()
    db.prepare(`
      UPDATE game_contexts
      SET lifecycle = 'active', phase = 'playing'
      WHERE room_id = 'active-room'
    `).run()
    db.prepare(`
      UPDATE game_replays
      SET status = 'recording', completed_at = NULL
      WHERE room_id = 'active-room'
    `).run()
    db.prepare(`
      INSERT INTO rooms (
        id, created_by, state_json, status, version, created_at, updated_at
      ) VALUES ('active-room', 'active-user', '{}', 'playing', 1, 100, 100)
    `).run()
    db.prepare(`
      INSERT INTO room_players (room_id, user_id, player_index, joined_at)
      VALUES ('active-room', 'active-user', 0, 100)
    `).run()

    removeReplay(db, {
      roomId: 'active-room',
      reason: 'legal',
      assetHash: hash,
      assetRoot,
      ledgerPath,
      now: () => 200,
    })

    expect(db.prepare(`
      SELECT COUNT(*) AS count
      FROM game_context_participants
      WHERE room_id = 'active-room'
    `).get()).toEqual({ count: 0 })
  })

  it('replays the external ledger before a restored backup can expose deleted data', () => {
    const live = createDb()
    const restored = createDb()
    const hash = writeAsset('restored-art')
    seedReplay(live, 'room-one', [hash])
    seedReplay(restored, 'room-one', [hash])

    removeReplay(live, {
      roomId: 'room-one',
      reason: 'legal',
      assetRoot,
      ledgerPath,
      now: () => 200,
    })
    writeFileSync(join(assetRoot, hash), 'restored-art')

    expect(applyReplayRemovalLedger(restored, {
      assetRoot,
      ledgerPath,
    })).toEqual({
      entries: 1,
      removedRoomIds: ['room-one'],
      deletedAssetHashes: [hash],
      assetTakedownHashes: [],
    })
    expect(restored.prepare(`
      SELECT lifecycle, removal_reason
      FROM game_contexts WHERE room_id = 'room-one'
    `).get()).toEqual({
      lifecycle: 'removed',
      removal_reason: 'legal',
    })
    expect(restored.prepare(`
      SELECT COUNT(*) AS count FROM game_replay_steps
    `).get()).toEqual({ count: 0 })
    expect(new GameContextStore(restored).resolve('room-one')).toEqual({
      ok: true,
      roomId: 'room-one',
      lifecycle: 'removed',
      reason: 'legal',
    })
    expect(new ReplayStore(restored).segment('room-one', 0)).toMatchObject({
      ok: false,
      code: 'context_removed',
    })
    expect(existsSync(join(assetRoot, hash))).toBe(false)
  })

  it('applies asset takedown rules to extra restored replays and records them', () => {
    const live = createDb()
    const restored = createDb()
    const hash = writeAsset('durably-offending-art')
    seedReplay(live, 'room-one', [hash])
    seedReplay(restored, 'room-one', [hash])
    seedReplay(restored, 'room-restored-only', [hash])
    removeReplay(live, {
      roomId: 'room-one',
      reason: 'legal',
      assetHash: hash,
      assetRoot,
      ledgerPath,
      now: () => 200,
    })
    writeFileSync(join(assetRoot, hash), 'durably-offending-art')

    expect(applyReplayRemovalLedger(restored, {
      assetRoot,
      ledgerPath,
    })).toMatchObject({
      entries: 2,
      removedRoomIds: ['room-one', 'room-restored-only'],
      deletedAssetHashes: [hash],
      assetTakedownHashes: [hash],
    })
    expect(restored.prepare(`
      SELECT room_id, lifecycle FROM game_contexts ORDER BY room_id
    `).all()).toEqual([
      { room_id: 'room-one', lifecycle: 'removed' },
      { room_id: 'room-restored-only', lifecycle: 'removed' },
    ])
    expect(readFileSync(ledgerPath, 'utf8').trim().split('\n')).toHaveLength(2)
  })

  it('does not let unrelated corrupt replay metadata block ledger replay', () => {
    const live = createDb()
    const restored = createDb()
    seedReplay(live, 'room-one')
    seedReplay(restored, 'room-one')
    seedReplay(restored, 'corrupt-room')
    restored.prepare(`
      UPDATE game_replays SET custom_cards_json = '{bad'
      WHERE room_id = 'corrupt-room'
    `).run()
    removeReplay(live, {
      roomId: 'room-one',
      reason: 'moderation',
      assetRoot,
      ledgerPath,
      now: () => 200,
    })

    expect(applyReplayRemovalLedger(restored, {
      assetRoot,
      ledgerPath,
    })).toMatchObject({
      entries: 1,
      removedRoomIds: ['room-one'],
    })
    expect(restored.prepare(`
      SELECT lifecycle FROM game_contexts WHERE room_id = 'corrupt-room'
    `).get()).toEqual({ lifecycle: 'completed' })
  })

  it('rolls back a torn final batch and rejects corrupt committed batches', () => {
    const live = createDb()
    const restored = createDb()
    seedReplay(live, 'room-one')
    seedReplay(restored, 'room-one')
    removeReplay(live, {
      roomId: 'room-one',
      reason: 'legal',
      assetRoot,
      ledgerPath,
      now: () => 200,
    })
    const committed = readFileSync(ledgerPath, 'utf8')
    writeFileSync(ledgerPath, `${committed}[{"version":1`)

    expect(applyReplayRemovalLedger(restored, {
      assetRoot,
      ledgerPath,
    })).toMatchObject({
      entries: 1,
      removedRoomIds: ['room-one'],
    })
    expect(readFileSync(ledgerPath, 'utf8')).toBe(committed)

    writeFileSync(ledgerPath, `${committed}not-json\n`)
    expect(() => applyReplayRemovalLedger(restored, {
      assetRoot,
      ledgerPath,
    })).toThrow('invalid replay removal ledger')
  })
})
