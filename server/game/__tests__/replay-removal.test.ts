import { createHash, randomUUID } from 'node:crypto'
import type { PostgresDatabase as Database } from '../../database/postgres'
import { createTestDatabase } from '../../__tests__/_helpers/postgres'
import { testStorageEnvironment } from '../../__tests__/_helpers/objects'
import { S3ObjectStore } from '../../storage/s3-store'
import { ResourceStore } from '../../storage/resource-store'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { GameContextStore } from '../game-context-store.ts'
import { ReplayStore } from '../replay-store.ts'
import {
  applyReplayRemovalLedger,
  removeReplay,
} from '../replay-removal.ts'

const hashOf = (body: string): string =>
  createHash('sha256').update(body).digest('hex')

describe('replay removal', () => {
  let objects: S3ObjectStore
  const databases: Database[] = []
  const bodies = new Map<string, Buffer>()
  const resourceFor = (db: Database) => new ResourceStore(db, objects)

  const createDb = async (): Promise<Database> => {
    const db = await createTestDatabase()
    databases.push(db)
    return db
  }

  const writeAsset = async (body: string): Promise<string> => {
    const hash = hashOf(body)
    bodies.set(hash, Buffer.from(body))
    await objects.putImmutable(`replay-assets/${hash}`, Buffer.from(body), 'image/webp')
    return hash
  }

  const seedReplay = async (
    db: Database,
    roomId: string,
    assetHashes: string[] = [],
  ): Promise<void> => {
    for (const hash of assetHashes) await resourceFor(db).stage(`replay-assets/${hash}`, bodies.get(hash)!, 'image/webp')
    const now = 100
    ;(await db.prepare(`
      INSERT INTO game_contexts (
        room_id, lifecycle, phase, replay_status, expires_at,
        removal_reason, created_at, updated_at
      ) VALUES (?, 'completed', NULL, 'available', NULL, NULL, ?, ?)
    `).run(roomId, now, now))
    ;(await db.prepare(`
      INSERT INTO game_results (
        room_id, started_at, finished_at, rounds_played, player_count,
        enable_community_deck, enable_parent_cards,
        enable_through_the_seasons, enable_farmers_of_the_moor, enable_snake_opening
      ) VALUES (?, 1, 2, 14, 2, 0, 0, 0, 0, 0)
    `).run(roomId))
    ;(await db.prepare(`
      INSERT INTO game_result_players (
        room_id, player_index, game_player_id, user_id, display_name, score
      ) VALUES (?, 0, 'p1', NULL, 'Alice', 42)
    `).run(roomId))
    ;(await db.prepare(`
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
    ))
    ;(await db.prepare(`
      INSERT INTO game_replay_steps (
        room_id, step_no, room_version, checkpoint_step_no, player_index,
        command_type, intent_json, payload_kind, payload_gzip, frame_hash, created_at
      ) VALUES (?, 0, 1, 0, NULL, 'initial', '{}', 'checkpoint', ?, ?, ?)
    `).run(roomId, Buffer.from('private replay payload'), 'b'.repeat(64), now))
  }

  beforeEach(() => {
    objects = S3ObjectStore.fromEnv(testStorageEnvironment(), `test/${randomUUID()}/`)
    bodies.clear()
  })

  afterEach(async () => {
    while (databases.length > 0) await databases.pop()!.close()
    await objects.clearPrefix()
    objects.close()
  })

  it('dry-runs an exact completed room and rejects unsafe targets', async () => {
    const db = (await createDb())
    const hash = (await writeAsset('room-only-art'))
    ;(await seedReplay(db, 'room-one', [hash]))

    expect((await removeReplay(db, {
      roomId: 'room-one',
      reason: 'moderation',
      dryRun: true,
      resources: resourceFor(db),
      now: () => 200,
    }))).toMatchObject({
      dryRun: true,
      roomIds: ['room-one'],
      assetHashes: [hash],
    })
    expect((await db.prepare(`
      SELECT lifecycle FROM game_contexts WHERE room_id = 'room-one'
    `).get())).toEqual({ lifecycle: 'completed' })
    expect(!!(await objects.get('erasure/ledger.json'))).toBe(false)
    expect(!!(await objects.get(`replay-assets/${hash}`))).toBe(true)

    ;(await expect(removeReplay(db, {
      roomId: '*',
      reason: 'moderation',
      resources: resourceFor(db),
    })).rejects.toThrow('invalid room id'))
    ;(await expect(removeReplay(db, {
      roomId: 'missing-room',
      reason: 'moderation',
      resources: resourceFor(db),
    })).rejects.toThrow('replay not found'))
  })

  it('keeps a tombstone, anonymizes results, and records an idempotent ledger entry', async () => {
    const db = (await createDb())
    const hash = (await writeAsset('sensitive-art'))
    ;(await seedReplay(db, 'room-one', [hash]))

    expect((await removeReplay(db, {
      roomId: 'room-one',
      reason: 'legal',
      resources: resourceFor(db),
      now: () => 200,
    }))).toMatchObject({
      dryRun: false,
      alreadyRemoved: false,
      roomIds: ['room-one'],
      deletedAssetHashes: [hash],
    })
    expect((await db.prepare(`
      SELECT lifecycle, replay_status, removal_reason
      FROM game_contexts WHERE room_id = 'room-one'
    `).get())).toEqual({
      lifecycle: 'removed',
      replay_status: null,
      removal_reason: 'legal',
    })
    expect((await db.prepare(`
      SELECT COUNT(*) AS count FROM game_replays WHERE room_id = 'room-one'
    `).get())).toEqual({ count: 0 })
    expect((await db.prepare(`
      SELECT COUNT(*) AS count FROM game_replay_steps WHERE room_id = 'room-one'
    `).get())).toEqual({ count: 0 })
    expect((await db.prepare(`
      SELECT user_id, display_name
      FROM game_result_players WHERE room_id = 'room-one'
    `).get())).toEqual({
      user_id: null,
      display_name: 'Deleted player (seat 1)',
    })
    expect(!!(await objects.get(`replay-assets/${hash}`))).toBe(false)

    const ledger = (await resourceFor(databases[0]!).ledger.read())
    expect(ledger).toHaveLength(1)
    expect(ledger[0]!).toEqual({
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

    expect((await removeReplay(db, {
      roomId: 'room-one',
      reason: 'legal',
      resources: resourceFor(db),
      now: () => 300,
    }))).toMatchObject({
      alreadyRemoved: true,
      roomIds: ['room-one'],
    })
    expect((await resourceFor(databases[0]!).ledger.read())).toHaveLength(1)
  })

  it('keeps shared assets until the final referencing replay is removed', async () => {
    const db = (await createDb())
    const sharedHash = (await writeAsset('shared-art'))
    const uniqueHash = (await writeAsset('unique-art'))
    ;(await seedReplay(db, 'room-one', [sharedHash, uniqueHash]))
    ;(await seedReplay(db, 'room-two', [sharedHash]))

    const first = (await removeReplay(db, {
      roomId: 'room-one',
      reason: 'moderation',
      resources: resourceFor(db),
    }))
    expect(first.deletedAssetHashes).toEqual([uniqueHash])
    expect(!!(await objects.get(`replay-assets/${sharedHash}`))).toBe(true)

    const second = (await removeReplay(db, {
      roomId: 'room-two',
      reason: 'moderation',
      resources: resourceFor(db),
    }))
    expect(second.deletedAssetHashes).toEqual([sharedHash])
    expect(!!(await objects.get(`replay-assets/${sharedHash}`))).toBe(false)
  })

  it('removes every replay referencing an asset identified as the offending content', async () => {
    const db = (await createDb())
    const sharedHash = (await writeAsset('offending-shared-art'))
    ;(await seedReplay(db, 'room-one', [sharedHash]))
    ;(await seedReplay(db, 'room-two', [sharedHash]))

    const result = (await removeReplay(db, {
      roomId: 'room-one',
      reason: 'legal',
      assetHash: sharedHash,
      resources: resourceFor(db),
      now: () => 200,
    }))

    expect(result.roomIds).toEqual(['room-one', 'room-two'])
    expect((await db.prepare(`
      SELECT room_id, lifecycle
      FROM game_contexts ORDER BY room_id
    `).all())).toEqual([
      { room_id: 'room-one', lifecycle: 'removed' },
      { room_id: 'room-two', lifecycle: 'removed' },
    ])
    const batches = (await resourceFor(databases[0]!).ledger.read())
    expect(batches).toHaveLength(1)
    expect(batches[0]!).toMatchObject({
      assetTakedowns: [{
        hash: sharedHash,
        reason: 'legal',
        removedAt: 200,
      }],
    })
    expect(batches[0]!.entries).toHaveLength(2)
    expect(!!(await objects.get(`replay-assets/${sharedHash}`))).toBe(false)
  })

  it('uses a tombstoned room to take down every remaining reference to an offending asset', async () => {
    const db = (await createDb())
    const sharedHash = (await writeAsset('later-offending-art'))
    ;(await seedReplay(db, 'room-one', [sharedHash]))
    ;(await seedReplay(db, 'room-two', [sharedHash]))
    ;(await removeReplay(db, {
      roomId: 'room-one',
      reason: 'moderation',
      resources: resourceFor(db),
      now: () => 100,
    }))

    expect((await removeReplay(db, {
      roomId: 'room-one',
      reason: 'legal',
      assetHash: sharedHash,
      resources: resourceFor(db),
      now: () => 200,
    }))).toMatchObject({
      alreadyRemoved: false,
      roomIds: ['room-one', 'room-two'],
      deletedAssetHashes: [sharedHash],
    })
    expect((await db.prepare(`
      SELECT lifecycle FROM game_contexts WHERE room_id = 'room-two'
    `).get())).toEqual({ lifecycle: 'removed' })
    const batches = (await resourceFor(db).ledger.read())
    expect(batches[1].assetTakedowns).toEqual([{
      hash: sharedHash,
      reason: 'legal',
      removedAt: 200,
    }])
  })

  it('durably deletes the result archive for an explicit full-record legal erasure', async () => {
    const live = (await createDb())
    const restored = (await createDb())
    ;(await seedReplay(live, 'room-one'))
    ;(await seedReplay(restored, 'room-one'))

    ;(await removeReplay(live, {
      roomId: 'room-one',
      reason: 'legal',
      resources: resourceFor(live),
      now: () => 100,
    }))
    ;(await live.prepare("DELETE FROM game_results WHERE room_id = 'room-one'").run())
    ;(await removeReplay(live, {
      roomId: 'room-one',
      reason: 'legal',
      eraseResult: true,
      resources: resourceFor(live),
      now: () => 200,
    }))
    expect((await live.prepare(`
      SELECT COUNT(*) AS count FROM game_results WHERE room_id = 'room-one'
    `).get())).toEqual({ count: 0 })

    ;(await applyReplayRemovalLedger(restored, { resources: resourceFor(restored), }))
    expect((await restored.prepare(`
      SELECT COUNT(*) AS count FROM game_results WHERE room_id = 'room-one'
    `).get())).toEqual({ count: 0 })
  })

  it('clears participant identities when an asset sweep removes an active replay', async () => {
    const db = (await createDb())
    const hash = (await writeAsset('active-sensitive-art'))
    ;(await seedReplay(db, 'active-room', [hash]))
    ;(await db.prepare(`
      INSERT INTO users (
        id, username, display_name, password_hash, created_at
      ) VALUES ('active-user', 'active_user', 'Active User', 'hash', 100)
    `).run())
    ;(await db.prepare(`
      UPDATE game_contexts
      SET lifecycle = 'active', phase = 'playing'
      WHERE room_id = 'active-room'
    `).run())
    ;(await db.prepare(`
      UPDATE game_replays
      SET status = 'recording', completed_at = NULL
      WHERE room_id = 'active-room'
    `).run())
    ;(await db.prepare(`
      INSERT INTO rooms (
        id, created_by, state_json, status, version, created_at, updated_at
      ) VALUES ('active-room', 'active-user', '{}', 'playing', 1, 100, 100)
    `).run())
    ;(await db.prepare(`
      INSERT INTO room_players (room_id, user_id, player_index, joined_at)
      VALUES ('active-room', 'active-user', 0, 100)
    `).run())

    ;(await removeReplay(db, {
      roomId: 'active-room',
      reason: 'legal',
      assetHash: hash,
      resources: resourceFor(db),
      now: () => 200,
    }))

    expect((await db.prepare(`
      SELECT COUNT(*) AS count
      FROM game_context_participants
      WHERE room_id = 'active-room'
    `).get())).toEqual({ count: 0 })
  })

  it('replays the external ledger before a restored backup can expose deleted data', async () => {
    const live = (await createDb())
    const restored = (await createDb())
    const hash = (await writeAsset('restored-art'))
    ;(await seedReplay(live, 'room-one', [hash]))
    ;(await seedReplay(restored, 'room-one', [hash]))

    ;(await removeReplay(live, {
      roomId: 'room-one',
      reason: 'legal',
      resources: resourceFor(live),
      now: () => 200,
    }))
    await objects.putImmutable(`replay-assets/${hash}`, Buffer.from('restored-art'), 'image/webp')

    expect((await applyReplayRemovalLedger(restored, {
      resources: resourceFor(restored),
    }))).toEqual({
      entries: 1,
      removedRoomIds: ['room-one'],
      deletedAssetHashes: [hash],
      assetTakedownHashes: [],
    })
    expect((await restored.prepare(`
      SELECT lifecycle, removal_reason
      FROM game_contexts WHERE room_id = 'room-one'
    `).get())).toEqual({
      lifecycle: 'removed',
      removal_reason: 'legal',
    })
    expect((await restored.prepare(`
      SELECT COUNT(*) AS count FROM game_replay_steps
    `).get())).toEqual({ count: 0 })
    expect((await new GameContextStore(restored).resolve('room-one'))).toEqual({
      ok: true,
      roomId: 'room-one',
      lifecycle: 'removed',
      reason: 'legal',
    })
    expect((await new ReplayStore(restored).segment('room-one', 0))).toMatchObject({
      ok: false,
      code: 'context_removed',
    })
    expect(!!(await objects.get(`replay-assets/${hash}`))).toBe(false)
  })

  it('applies asset takedown rules to extra restored replays and records them', async () => {
    const live = (await createDb())
    const restored = (await createDb())
    const hash = (await writeAsset('durably-offending-art'))
    ;(await seedReplay(live, 'room-one', [hash]))
    ;(await seedReplay(restored, 'room-one', [hash]))
    ;(await seedReplay(restored, 'room-restored-only', [hash]))
    ;(await removeReplay(live, {
      roomId: 'room-one',
      reason: 'legal',
      assetHash: hash,
      resources: resourceFor(live),
      now: () => 200,
    }))
    await objects.putImmutable(`replay-assets/${hash}`, Buffer.from('durably-offending-art'), 'image/webp')

    expect((await applyReplayRemovalLedger(restored, {
      resources: resourceFor(restored),
    }))).toMatchObject({
      entries: 2,
      removedRoomIds: ['room-one', 'room-restored-only'],
      deletedAssetHashes: [hash],
      assetTakedownHashes: [hash],
    })
    expect((await restored.prepare(`
      SELECT room_id, lifecycle FROM game_contexts ORDER BY room_id
    `).all())).toEqual([
      { room_id: 'room-one', lifecycle: 'removed' },
      { room_id: 'room-restored-only', lifecycle: 'removed' },
    ])
    expect((await resourceFor(databases[0]!).ledger.read())).toHaveLength(2)
  })

  it('does not let unrelated corrupt replay metadata block ledger replay', async () => {
    const live = (await createDb())
    const restored = (await createDb())
    ;(await seedReplay(live, 'room-one'))
    ;(await seedReplay(restored, 'room-one'))
    ;(await seedReplay(restored, 'corrupt-room'))
    ;(await restored.prepare(`
      UPDATE game_replays SET custom_cards_json = '{bad'
      WHERE room_id = 'corrupt-room'
    `).run())
    ;(await removeReplay(live, {
      roomId: 'room-one',
      reason: 'moderation',
      resources: resourceFor(live),
      now: () => 200,
    }))

    expect((await applyReplayRemovalLedger(restored, {
      resources: resourceFor(restored),
    }))).toMatchObject({
      entries: 1,
      removedRoomIds: ['room-one'],
    })
    expect((await restored.prepare(`
      SELECT lifecycle FROM game_contexts WHERE room_id = 'corrupt-room'
    `).get())).toEqual({ lifecycle: 'completed' })
  })

  it('rejects a corrupt independent erasure ledger before applying a restored database', async () => {
    const live = await createDb()
    const restored = await createDb()
    await seedReplay(live, 'room-one')
    await seedReplay(restored, 'room-one')
    await removeReplay(live, { roomId: 'room-one', reason: 'legal', resources: resourceFor(live), now: () => 200 })
    const ledger = await objects.get('erasure/ledger.json')
    await objects.replace('erasure/ledger.json', Buffer.from('not-json'), ledger!.etag)
    await expect(applyReplayRemovalLedger(restored, { resources: resourceFor(restored) })).rejects.toThrow()
    expect(await restored.prepare("SELECT lifecycle FROM game_contexts WHERE room_id = 'room-one'").get()).toEqual({ lifecycle: 'completed' })
  })
})
