import { gzipSync } from 'node:zlib'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  canonicalJson,
  encodeReplayFrame,
  frameHash,
  type JsonValue,
} from '../replay-codec.ts'
import { ReplayStore } from '../replay-store.ts'

const frames = [
  {
    round: 1,
    players: [
      { id: 'p1', name: 'Alice', minorHand: ['A'], occupationHand: ['B'], resources: { food: 0 } },
      { id: 'p2', name: 'Bob', minorHand: ['C'], occupationHand: ['D'], resources: { food: 0 } },
    ],
    log: [{
      key: 'log.test',
      params: {
        player: 'Alice',
        nested: ['Alice', 'Bob'],
      },
    }],
  },
  {
    round: 1,
    players: [
      { id: 'p1', name: 'Alice', minorHand: ['A'], occupationHand: ['B'], resources: { food: 1 } },
      { id: 'p2', name: 'Bob', minorHand: ['C'], occupationHand: ['D'], resources: { food: 0 } },
    ],
  },
  {
    round: 2,
    players: [
      { id: 'p1', name: 'Alice', minorHand: ['A'], occupationHand: ['B'], resources: { food: 1 } },
      { id: 'p2', name: 'Bob', minorHand: ['C'], occupationHand: ['D'], resources: { food: 2 } },
    ],
  },
  {
    round: 2,
    players: [
      { id: 'p1', name: 'Alice', minorHand: [], occupationHand: ['B'], resources: { food: 1 } },
      { id: 'p2', name: 'Bob', minorHand: ['C'], occupationHand: ['D'], resources: { food: 2 } },
    ],
  },
] satisfies JsonValue[]

describe('ReplayStore', () => {
  let db: Database.Database
  let store: ReplayStore

  beforeEach(() => {
    db = new Database(':memory:')
    db.exec(`
      CREATE TABLE game_contexts (
        room_id TEXT PRIMARY KEY,
        lifecycle TEXT NOT NULL,
        replay_status TEXT
      );
      CREATE TABLE game_replays (
        room_id TEXT PRIMARY KEY,
        schema_version INTEGER NOT NULL,
        viewer_build_id TEXT NOT NULL,
        game_build_id TEXT NOT NULL,
        status TEXT NOT NULL,
        latest_step_no INTEGER NOT NULL,
        missing_prefix INTEGER NOT NULL,
        custom_cards_json TEXT NOT NULL
      );
      CREATE TABLE game_replay_steps (
        room_id TEXT NOT NULL,
        step_no INTEGER NOT NULL,
        room_version INTEGER NOT NULL,
        checkpoint_step_no INTEGER NOT NULL,
        player_index INTEGER,
        command_type TEXT NOT NULL,
        intent_json TEXT NOT NULL,
        payload_kind TEXT NOT NULL,
        payload_gzip BLOB NOT NULL,
        frame_hash TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (room_id, step_no)
      );
      CREATE TABLE game_result_players (
        room_id TEXT NOT NULL,
        player_index INTEGER NOT NULL,
        display_name TEXT NOT NULL
      );
    `)
    db.prepare('INSERT INTO game_contexts VALUES (?, ?, ?)')
      .run('room-1', 'completed', 'available')
    db.prepare("INSERT INTO game_replays VALUES (?, 1, ?, ?, 'completed', 3, 0, ?)")
      .run('room-1', 'a'.repeat(64), 'game-1', JSON.stringify([{
        cardType: 'minor',
        cardJson: { id: 'CUSTOM_1', name: 'Custom', deck: 'X', number: 1 },
      }]))
    db.prepare('INSERT INTO game_result_players VALUES (?, 0, ?)')
      .run('room-1', 'Alice')
    db.prepare('INSERT INTO game_result_players VALUES (?, 1, ?)')
      .run('room-1', 'Bob')

    const encoded0 = encodeReplayFrame({
      frame: frames[0],
      previousFrame: null,
      stepNo: 0,
      previousCheckpointStepNo: 0,
    })
    const encoded1 = encodeReplayFrame({
      frame: frames[1],
      previousFrame: frames[0],
      stepNo: 1,
      previousCheckpointStepNo: 0,
    })
    const encoded2 = {
      payloadKind: 'checkpoint' as const,
      payloadGzip: gzipSync(canonicalJson(frames[2])),
      checkpointStepNo: 2,
      frameHash: frameHash(frames[2]),
    }
    const encoded3 = encodeReplayFrame({
      frame: frames[3],
      previousFrame: frames[2],
      stepNo: 3,
      previousCheckpointStepNo: 2,
    })
    const insert = db.prepare(`
      INSERT INTO game_replay_steps VALUES (
        @roomId, @stepNo, @roomVersion, @checkpointStepNo, @playerIndex,
        @commandType, @intentJson, @payloadKind, @payloadGzip, @frameHash, @createdAt
      )
    `)
    ;[
      { stepNo: 0, playerIndex: null, commandType: 'initial', intentJson: '{}', ...encoded0 },
      { stepNo: 1, playerIndex: 0, commandType: 'action', intentJson: '{"spaceId":"forest"}', ...encoded1 },
      { stepNo: 2, playerIndex: 1, commandType: 'action', intentJson: '{"spaceId":"fishing"}', ...encoded2 },
      { stepNo: 3, playerIndex: 0, commandType: 'choice', intentJson: '{"value":"confirm"}', ...encoded3 },
    ].forEach((step) => insert.run({
      roomId: 'room-1',
      roomVersion: step.stepNo,
      createdAt: 1_000 + step.stepNo,
      ...step,
    }))
    store = new ReplayStore(db)
  })

  afterEach(() => db.close())

  it('returns a public manifest and reconstructs bounded segments', () => {
    expect(store.manifest('room-1')).toEqual({
      ok: true,
      kind: 'replayManifest',
      apiVersion: 1,
      roomId: 'room-1',
      schemaVersion: 1,
      viewerBuildId: 'a'.repeat(64),
      gameBuildId: 'game-1',
      firstStepNo: 0,
      lastStepNo: 3,
      missingPrefix: false,
      participants: [
        { playerIndex: 0, displayName: 'Alice' },
        { playerIndex: 1, displayName: 'Bob' },
      ],
      segments: [
        { checkpointStepNo: 0, firstStepNo: 0, lastStepNo: 1 },
        { checkpointStepNo: 2, firstStepNo: 2, lastStepNo: 3 },
      ],
      steps: [
        {
          stepNo: 0,
          roomVersion: 0,
          checkpointStepNo: 0,
          playerIndex: null,
          commandType: 'initial',
          intent: {},
          frameHash: frameHash(frames[0]),
          createdAt: 1_000,
        },
        {
          stepNo: 1,
          roomVersion: 1,
          checkpointStepNo: 0,
          playerIndex: 0,
          commandType: 'action',
          intent: { spaceId: 'forest' },
          frameHash: frameHash(frames[1]),
          createdAt: 1_001,
        },
        {
          stepNo: 2,
          roomVersion: 2,
          checkpointStepNo: 2,
          playerIndex: 1,
          commandType: 'action',
          intent: { spaceId: 'fishing' },
          frameHash: frameHash(frames[2]),
          createdAt: 1_002,
        },
        {
          stepNo: 3,
          roomVersion: 3,
          checkpointStepNo: 2,
          playerIndex: 0,
          commandType: 'choice',
          intent: { value: 'confirm' },
          frameHash: frameHash(frames[3]),
          createdAt: 1_003,
        },
      ],
      corruptRanges: [],
      customCards: [{
        cardType: 'minor',
        cardJson: { id: 'CUSTOM_1', name: 'Custom', deck: 'X', number: 1 },
      }],
    })

    const first = store.segment('room-1', 0)
    expect(first.ok).toBe(true)
    if (!first.ok) return
    expect(first.steps.map((step) => step.frame)).toEqual(frames.slice(0, 2))
    expect(first.steps[1]).toMatchObject({
      stepNo: 1,
      playerIndex: 0,
      commandType: 'action',
      intent: { spaceId: 'forest' },
    })
  })

  it('requires an exact step and frame hash for anchor evidence', () => {
    const exact = store.anchor('room-1', 3, frameHash(frames[3]))
    expect(exact.ok).toBe(true)
    if (exact.ok) expect(exact.step.frame).toEqual(frames[3])

    expect(store.anchor('room-1', 3, 'f'.repeat(64))).toMatchObject({
      ok: false,
      code: 'anchor_mismatch',
    })
    expect(store.anchor('room-1', 2, frameHash(frames[1]))).toMatchObject({
      ok: false,
      code: 'anchor_mismatch',
    })
  })

  it('reports a corrupt range and the next checkpoint without guessing a frame', () => {
    db.prepare('UPDATE game_replay_steps SET payload_gzip = ? WHERE room_id = ? AND step_no = 1')
      .run(Buffer.from('broken'), 'room-1')

    expect(store.segment('room-1', 0)).toEqual({
      ok: false,
      code: 'replay_segment_unavailable',
      lifecycle: 'completed',
      message: 'Replay segment failed its integrity check',
      unavailableRange: {
        firstStepNo: 0,
        lastStepNo: 1,
        nextCheckpointStepNo: 2,
      },
    })
    const next = store.segment('room-1', 2)
    expect(next.ok).toBe(true)
  })

  it('reports missing final rows instead of silently truncating the timeline', () => {
    db.prepare('DELETE FROM game_replay_steps WHERE room_id = ? AND step_no = ?')
      .run('room-1', 3)

    const manifest = store.manifest('room-1')
    expect(manifest.ok).toBe(true)
    if (!manifest.ok) return
    expect(manifest.lastStepNo).toBe(3)
    expect(manifest.steps.at(-1)?.stepNo).toBe(2)
    expect(manifest.corruptRanges).toEqual([{
      firstStepNo: 3,
      lastStepNo: 3,
    }])
  })

  it('uses current participant names in archived frames', () => {
    db.prepare('UPDATE game_result_players SET display_name = ? WHERE room_id = ? AND player_index = 0')
      .run('Deleted player (seat 1)', 'room-1')

    const segment = store.segment('room-1', 0)
    expect(segment.ok).toBe(true)
    if (!segment.ok) return
    expect(segment.steps[0]?.frame.players[0]?.name).toBe('Deleted player (seat 1)')
    expect(segment.steps[0]?.frame.players[1]?.name).toBe('Bob')
    expect(segment.steps[0]?.frame.log[0]?.params).toEqual({
      player: 'Deleted player (seat 1)',
      nested: ['Deleted player (seat 1)', 'Bob'],
    })
  })

  it('never exposes active or legacy replay payloads', () => {
    db.prepare('INSERT INTO game_contexts VALUES (?, ?, NULL)').run('active-room', 'active')
    db.prepare('INSERT INTO game_contexts VALUES (?, ?, ?)').run(
      'legacy-room',
      'completed',
      'legacy_no_replay',
    )

    expect(store.manifest('active-room')).toMatchObject({
      ok: false,
      code: 'context_changed',
      lifecycle: 'active',
    })
    expect(store.manifest('legacy-room')).toMatchObject({
      ok: false,
      code: 'replay_segment_unavailable',
      lifecycle: 'completed',
    })
    db.prepare("UPDATE game_replays SET status = 'recording' WHERE room_id = 'room-1'").run()
    expect(store.manifest('room-1')).toMatchObject({
      ok: false,
      code: 'replay_segment_unavailable',
      lifecycle: 'completed',
    })
  })
})
