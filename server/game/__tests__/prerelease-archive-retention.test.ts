import type { QueryResultRow } from 'pg'
import { randomUUID } from 'node:crypto'
import { testStorageEnvironment } from '../../__tests__/_helpers/objects'
import { S3ObjectStore } from '../../storage/s3-store'
import { ResourceStore } from '../../storage/resource-store'
import { removeReplay } from '../replay-removal'
import { afterAll, afterEach, expect, it, vi } from 'vitest'
import { createTestDatabase } from '../../__tests__/_helpers/postgres'
import { GameContextStore } from '../game-context-store'
import { ReplayStore } from '../replay-store'
import { prereleaseArchiveExpired, PRERELEASE_ARCHIVE_RETENTION_MS } from '../prerelease-archive-retention'

const db = await createTestDatabase()
afterAll(() => db.close())
afterEach(() => vi.unstubAllEnvs())

async function completed(roomId: string, finishedAt: number) {
  await db.prepare(`INSERT INTO game_contexts(room_id,lifecycle,replay_status,created_at,updated_at)
    VALUES (?,'completed','legacy_no_replay',1,1)`).run(roomId)
  await db.prepare(`INSERT INTO game_results(room_id,started_at,finished_at,rounds_played,player_count,
    enable_community_deck,enable_parent_cards,enable_through_the_seasons,enable_farmers_of_the_moor,enable_snake_opening)
    VALUES (?,1,?,14,2,0,0,0,0,0)`).run(roomId, finishedAt)
  await db.prepare(`INSERT INTO game_result_players(room_id,player_index,game_player_id,display_name,score)
    VALUES (?,0,'p1','Alice',42)`).run(roomId)
}

it('stops legacy results and Replay reads at the durable thirty-day deadline without waiting for cleanup', async () => {
  vi.stubEnv('RELEASE_CHANNEL', 'prerelease')
  await completed('pre-durable-result', 1_000)
  let now = 1_000 + PRERELEASE_ARCHIVE_RETENTION_MS - 1
  const contexts = new GameContextStore(db, () => now)
  expect(await prereleaseArchiveExpired(db, 'pre-durable-result', () => now)).toBe(false)
  expect(await contexts.resolve('pre-durable-result')).toMatchObject({ ok: true, lifecycle: 'completed', result: { players: [{ displayName: 'Alice', score: 42 }] } })
  await db.prepare('UPDATE game_contexts SET updated_at=? WHERE room_id=?').run(now, 'pre-durable-result')
  now++
  expect(await prereleaseArchiveExpired(db, 'pre-durable-result', () => now)).toBe(true)
  expect(await contexts.resolve('pre-durable-result')).toEqual({ ok: true, roomId: 'pre-durable-result', lifecycle: 'expired' })
  const clock = vi.spyOn(Date, 'now').mockImplementation(() => now)
  try { expect(await new ReplayStore(db).manifest('pre-durable-result')).toMatchObject({ ok: false, code: 'context_expired' }) }
  finally { clock.mockRestore() }
  expect(await db.prepare('SELECT score FROM game_result_players WHERE room_id=?').get('pre-durable-result')).toEqual({ score: 42 })
})

it('keeps the formal archive policy and expires pre by the earliest persisted completion fact', async () => {
  await completed('formal-durable-result', 10)
  const oldNow = 10 + PRERELEASE_ARCHIVE_RETENTION_MS
  vi.stubEnv('RELEASE_CHANNEL', 'stable')
  expect(await prereleaseArchiveExpired(db, 'formal-durable-result', () => oldNow)).toBe(false)
  expect(await new GameContextStore(db, () => oldNow).resolve('formal-durable-result')).toMatchObject({ lifecycle: 'completed' })
  vi.stubEnv('RELEASE_CHANNEL', 'prerelease')
  await db.prepare(`INSERT INTO game_replays(room_id,schema_version,viewer_build_id,game_build_id,status,latest_step_no,missing_prefix,custom_cards_json,created_at,completed_at)
    VALUES (?,1,?,'game','completed',0,0,'[]',1,5)`).run('formal-durable-result', 'a'.repeat(64))
  expect(await prereleaseArchiveExpired(db, 'formal-durable-result', () => 5 + PRERELEASE_ARCHIVE_RETENTION_MS)).toBe(true)
  expect(await prereleaseArchiveExpired(db, 'unknown-room', () => oldNow)).toBe(false)
})

it('publishes the tombstone when a legal result erasure completes during a summary read', async () => {
  vi.stubEnv('RELEASE_CHANNEL','prerelease')
  const roomId='pre-result-erasure-race', now=Date.now()
  await completed(roomId,now)
  await db.prepare("INSERT INTO game_replays(room_id,schema_version,viewer_build_id,game_build_id,status,latest_step_no,missing_prefix,custom_cards_json,created_at,completed_at) VALUES (?,1,?,'game','completed',0,0,'[]',?,?)").run(roomId,'a'.repeat(64),now,now)
  await db.prepare("UPDATE game_contexts SET replay_status='available' WHERE room_id=?").run(roomId)
  await db.prepare("INSERT INTO game_replay_steps(room_id,step_no,room_version,checkpoint_step_no,command_type,intent_json,payload_kind,payload_gzip,frame_hash,created_at) VALUES (?,0,1,0,'initial','{}','checkpoint',?,?,?)").run(roomId,Buffer.from('unused'),'b'.repeat(64),now)
  const objects=S3ObjectStore.fromEnv(testStorageEnvironment(),`test/context-race-${randomUUID()}/`)
  const resources=new ResourceStore(db,objects)
  const prepare=db.prepare.bind(db)
  const held=vi.spyOn(db,'prepare').mockImplementation(sql=>{
    const statement=prepare(sql)
    if(sql.includes('SELECT player_index, display_name, score, name_is_default')) {
      const all=statement.all
      statement.all=async<Row extends QueryResultRow=QueryResultRow>(...values:unknown[]):Promise<Row[]>=>{
        const rows=await all<Row>(...values)
        await removeReplay(db,{roomId,reason:'legal',eraseResult:true,resources})
        return rows
      }
    }
    return statement
  })
  try {
    const response=await new GameContextStore(db).resolve(roomId)
    expect(await prepare('SELECT COUNT(*) AS count FROM game_results WHERE room_id=?').get(roomId)).toEqual({count:0})
    expect(response).toEqual({ok:true,roomId,lifecycle:'removed',reason:'legal'})
    expect(JSON.stringify(response)).not.toContain('Alice')
  } finally {held.mockRestore();await objects.clearPrefix();objects.close()}
})
