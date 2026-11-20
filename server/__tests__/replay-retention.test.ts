import { afterEach, beforeEach, expect, it } from 'vitest'
import { cleanExpiredSessions } from '../db'
import type { PostgresDatabase } from '../database/postgres'
import { GameContextStore } from '../game/game-context-store'
import { ReplayStore } from '../game/replay-store'
import { expireReplayArchives, REPLAY_RETENTION_MS } from '../game/replay-retention'
import { createTestDatabase } from './_helpers/postgres'

const DAY = 24 * 60 * 60 * 1000
const HASH = 'a'.repeat(64)
let db: PostgresDatabase

beforeEach(async () => { db = await createTestDatabase() })
afterEach(async () => { await db.close() })

/** One recorded game; a checkpoint starts each segment listed in `checkpoints`. */
async function recordedGame(roomId: string, kind: 'completed' | 'terminated', endedAt: number, steps = 4, checkpoints = [0]) {
  await db.prepare(`INSERT INTO game_contexts (room_id, lifecycle, replay_status, created_at, updated_at)
    VALUES (?, ?, 'available', ?, ?)`).run(roomId, kind, endedAt - DAY, endedAt)
  if (kind === 'completed') {
    await db.prepare(`INSERT INTO game_results (room_id, started_at, finished_at, rounds_played, player_count,
      enable_community_deck, enable_parent_cards, enable_through_the_seasons, enable_farmers_of_the_moor)
      VALUES (?, ?, ?, 14, 1, 0, 0, 0, 0)`).run(roomId, endedAt - DAY, endedAt)
    await db.prepare(`INSERT INTO game_result_players (room_id, player_index, game_player_id, display_name, score)
      VALUES (?, 0, 'p1', 'Alice', 42)`).run(roomId)
  } else {
    await db.prepare(`INSERT INTO game_terminations (room_id, reason, intent, proposer_index, started_at, ended_at, round)
      VALUES (?, 'solo_confirmation', 'end', 0, ?, ?, 3)`).run(roomId, endedAt - DAY, endedAt)
    await db.prepare(`INSERT INTO game_termination_players (room_id, player_index, display_name, agreed_at)
      VALUES (?, 0, 'Alice', ?)`).run(roomId, endedAt)
  }
  await db.prepare('INSERT INTO game_context_participants (room_id, player_index) VALUES (?, 0)').run(roomId)
  await db.prepare(`INSERT INTO game_replays (room_id, schema_version, viewer_build_id, game_build_id, status, latest_step_no, created_at, completed_at)
    VALUES (?, 1, 'viewer', 'game', 'completed', ?, ?, ?)`).run(roomId, steps - 1, endedAt - DAY, endedAt)
  let checkpoint = 0
  for (let step = 0; step < steps; step++) {
    if (checkpoints.includes(step)) checkpoint = step
    await db.prepare(`INSERT INTO game_replay_steps (room_id, step_no, room_version, checkpoint_step_no, player_index,
      command_type, intent_json, payload_kind, payload_gzip, frame_hash, created_at)
      VALUES (?, ?, ?, ?, 0, 'test', '{}', ?, ?, ?, ?)`)
      .run(roomId, step, step + 1, checkpoint, step === checkpoint ? 'checkpoint' : 'delta', Buffer.from('frame'), HASH, endedAt)
  }
}

const replayStatus = async (roomId: string) =>
  (await db.prepare('SELECT replay_status FROM game_contexts WHERE room_id = ?').get<{ replay_status: string }>(roomId))?.replay_status
const stepNumbers = async (roomId: string) =>
  (await db.prepare('SELECT step_no FROM game_replay_steps WHERE room_id = ? ORDER BY step_no').all<{ step_no: number }>(roomId))
    .map(row => Number(row.step_no))
const header = (roomId: string) =>
  db.prepare('SELECT latest_step_no FROM game_replays WHERE room_id = ?').get<{ latest_step_no: number }>(roomId)

it('removes replays seven days after the game ends and keeps the result and termination records', async () => {
  const now = Date.now()
  await recordedGame('old-completed', 'completed', now - 8 * DAY)
  await recordedGame('fresh-completed', 'completed', now - 6 * DAY)
  await recordedGame('old-terminated', 'terminated', now - 8 * DAY)

  await cleanExpiredSessions(db)

  for (const roomId of ['old-completed', 'old-terminated']) {
    expect(await replayStatus(roomId)).toBe('expired')
    expect(await stepNumbers(roomId)).toEqual([])
    expect(await header(roomId)).toBeUndefined()
    expect(await db.prepare('SELECT 1 FROM game_context_participants WHERE room_id = ?').get(roomId)).toBeTruthy()
  }
  expect(await replayStatus('fresh-completed')).toBe('available')
  expect(await stepNumbers('fresh-completed')).toEqual([0, 1, 2, 3])

  const contexts = new GameContextStore(db)
  const completed = await contexts.resolve('old-completed')
  expect(completed).toMatchObject({ ok: true, lifecycle: 'completed', replayStatus: 'expired',
    result: { players: [{ playerIndex: 0, displayName: 'Alice', score: 42 }] } })
  expect(completed).not.toHaveProperty('replay')
  const terminated = await contexts.resolve('old-terminated')
  expect(terminated).toMatchObject({ ok: true, lifecycle: 'terminated', replayStatus: 'expired',
    termination: { reason: 'solo_confirmation', round: 3, players: [{ playerIndex: 0, displayName: 'Alice' }] } })
  expect(terminated).not.toHaveProperty('replay')
  expect(await contexts.resolve('fresh-completed')).toMatchObject({ replayStatus: 'available', replay: { firstStepNo: 0, lastStepNo: 3 } })

  expect(await new ReplayStore(db).manifest('old-completed')).toMatchObject({ ok: false, code: 'replay_segment_unavailable' })
})

it('keeps a Bug Report evidence segment until its deadline, then removes the rest of the archive', async () => {
  const now = Date.now()
  await recordedGame('reported', 'completed', now - 8 * DAY, 6, [0, 3])
  await db.prepare(`INSERT INTO bug_reports (submission_id, room_id, player_index, lifecycle, room_version, step_no, frame_hash,
    evidence_expires_at, submitted_at, created_at, updated_at)
    VALUES ('report', 'reported', 0, 'active', 5, 4, ?, ?, ?, ?, ?)`).run(HASH, now + DAY, now - 9 * DAY, now - 9 * DAY, now - 9 * DAY)

  await cleanExpiredSessions(db)

  expect(await replayStatus('reported')).toBe('expired')
  expect(await stepNumbers('reported')).toEqual([3, 4])
  expect(Number((await header('reported'))?.latest_step_no)).toBe(4)
  expect(await new ReplayStore(db).manifest('reported')).toMatchObject({ ok: false, code: 'replay_segment_unavailable' })

  await db.prepare("UPDATE bug_reports SET evidence_expires_at = ? WHERE submission_id = 'report'").run(now - 1)
  await cleanExpiredSessions(db)

  expect(await stepNumbers('reported')).toEqual([])
  expect(await header('reported')).toBeUndefined()
})

it('marks at most one batch per sweep and leaves other replay states alone', async () => {
  const now = Date.now()
  await recordedGame('old-a', 'completed', now - 9 * DAY)
  await recordedGame('old-b', 'completed', now - 9 * DAY)
  await recordedGame('legacy', 'completed', now - 30 * DAY)
  await db.prepare("UPDATE game_contexts SET replay_status = 'legacy_no_replay' WHERE room_id = 'legacy'").run()

  expect(await expireReplayArchives(db, now, { limit: 1 })).toBe(1)
  expect(await expireReplayArchives(db, now, { limit: 1 })).toBe(1)
  expect(await expireReplayArchives(db, now, { limit: 1 })).toBe(0)
  expect([await replayStatus('old-a'), await replayStatus('old-b'), await replayStatus('legacy')])
    .toEqual(['expired', 'expired', 'legacy_no_replay'])
  expect(await expireReplayArchives(db, now + REPLAY_RETENTION_MS)).toBe(0)
})
