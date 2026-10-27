import { expect, type BrowserContext } from '@playwright/test'
import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import WebSocket from 'ws'
import { PostgresDatabase } from '../../server/database/postgres'
import { S3ObjectStore } from '../../server/storage/s3-store'
import { decodeReplayFrame, type JsonValue } from '../../server/game/replay-codec'
import type { ClientCommand, ServerEvent } from '../../shared/contract/protocol/ws'
import type { CommandIdentity, CommandReceipt } from '../../shared/contract/protocol/commands'
import { BACKEND_URL } from '../fixtures'

const exec = promisify(execFile)
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex')

export async function checkpoint(roomId: string, completedSourceId?: string) {
  const schema = process.env.DATABASE_SCHEMA
  const prefix = process.env.S3_PREFIX
  if (!schema || !/^test_[a-f0-9]{32}$/.test(schema) || !prefix?.startsWith('test/e2e-')) throw new Error('Recovery requires an isolated verify environment')
  const db = new PostgresDatabase({ connectionString: process.env.DATABASE_URL, schema })
  const objects = S3ObjectStore.fromEnv()
  try {
    if (completedSourceId) {
      expect(await db.prepare('SELECT id FROM rooms WHERE id=?').get(completedSourceId)).toBeUndefined()
    }
    const room = await db.prepare('SELECT state_json FROM rooms WHERE id=?').get<{ state_json: string }>(roomId)
    const replay = await db.prepare('SELECT latest_step_no,viewer_build_id,game_build_id FROM game_replays WHERE room_id=?')
      .get<{ latest_step_no: number; viewer_build_id: string; game_build_id: string }>(roomId)
    if (!room || !replay) throw new Error('Missing committed recovery checkpoint')
    const rows = await db.prepare('SELECT step_no,payload_kind,payload_gzip,checkpoint_step_no,frame_hash FROM game_replay_steps WHERE room_id=? ORDER BY step_no')
      .all<{ step_no: number; payload_kind: 'checkpoint' | 'delta'; payload_gzip: Buffer; checkpoint_step_no: number; frame_hash: string }>(roomId)
    let frame: JsonValue | null = null
    for (const row of rows) frame = decodeReplayFrame(frame, { payloadKind: row.payload_kind, payloadGzip: row.payload_gzip, checkpointStepNo: row.checkpoint_step_no, frameHash: row.frame_hash })
    const receipts = await db.prepare('SELECT scope_id,command_id,outcome_json FROM command_requests WHERE result_room_id=? ORDER BY created_at,command_id')
      .all<{ scope_id: string; command_id: string; outcome_json: string }>(roomId)
    const historyNodes = await db.prepare('SELECT node_id,kind,checksum FROM room_history_nodes WHERE room_id=? ORDER BY node_id').all(roomId)
    const recoveryNodes = await db.prepare('SELECT node_id,kind,checksum FROM room_recovery_nodes WHERE room_id=? ORDER BY node_id').all(roomId)
    const keys = await db.prepare(`SELECT o.object_key,o.content_hash FROM stored_objects o JOIN object_references r ON o.object_key=r.object_key
      WHERE o.state='ready' AND r.owner_kind='viewer' AND r.owner_id=? ORDER BY o.object_key`).all<{ object_key: string; content_hash: string }>(replay.viewer_build_id)
    if (!keys.length) throw new Error('Recovery checkpoint has no real S3 Viewer objects')
    const stored = []
    for (const key of keys) {
      const object = await objects.get(key.object_key)
      if (!object) throw new Error(`Missing referenced recovery object ${key.object_key}`)
      expect(hash(object.body)).toBe(key.content_hash)
      stored.push({ key: key.object_key, sha256: hash(object.body), bytes: object.body.length })
    }
    return { schema, prefix, ...(completedSourceId ? { completedSourceId, completedSourceRoomAbsent: true } : {}),
      stepNo: replay.latest_step_no, viewerBuildId: replay.viewer_build_id, gameBuildId: replay.game_build_id,
      frameHash: rows.at(-1)!.frame_hash, decodedFrameHashVerified: true,
      snapshotHash: hash(room.state_json), frame, receipts, historyNodes, recoveryNodes, objects: stored }
  } finally { objects.close(); await db.close() }
}

async function pids(port: string) {
  const result = await exec('lsof', ['-t', `-iTCP:${port}`, '-sTCP:LISTEN']).catch(() => ({ stdout: '' }))
  return result.stdout.trim().split(/\s+/).filter(Boolean).map(Number)
}
export async function restartIsolatedBackend(viewerBuildId: string, gameBuildId: string) {
  const original = await pids(process.env.APP_BASE_PORT!)
  const publicOriginal = await pids(process.env.BACKEND_PORT!)
  expect(original.length).toBeGreaterThan(0)
  expect(publicOriginal.length).toBeGreaterThan(0)
  if (!process.env.OWNED_PROCESSES_FILE || !process.env.DATABASE_SCHEMA?.startsWith('test_')) throw new Error('No owned process boundary')
  await exec('bash', ['./restart-local.sh', '--kill-only'], { maxBuffer: 8 * 1024 * 1024 })
  expect(await pids(process.env.APP_BASE_PORT!)).toEqual([])
  expect(await pids(process.env.BACKEND_PORT!)).toEqual([])
  const stoppedAt = Date.now()
  const result = await exec('bash', ['./restart-local.sh'], { env: { ...process.env, REPLAY_VIEWER_BUILD_ID: viewerBuildId, GAME_BUILD_ID: gameBuildId }, maxBuffer: 8 * 1024 * 1024 })
  const replacement = await pids(process.env.APP_BASE_PORT!)
  expect(replacement.length).toBeGreaterThan(0)
  expect(replacement.every(pid => !original.includes(pid))).toBe(true)
  return { applicationBefore: original, ingressBefore: publicOriginal, applicationAfter: replacement, ingressAfter: await pids(process.env.BACKEND_PORT!), stoppedAt, readyAt: Date.now(), restartOutput: result.stdout }
}

export async function verifyOriginalReceipt(context: BrowserContext, roomId: string, original: ClientCommand, expected: CommandReceipt) {
  const cookies = await context.cookies()
  const cookie = cookies.map(value => `${value.name}=${value.value}`).join('; ')
  const located = await context.request.post(`${BACKEND_URL}/api/rooms/locate`, { data: { roomId } })
  expect(located.ok()).toBe(true)
  const route: { wsPath: string } = await located.json()
  const destination = new URL(route.wsPath, BACKEND_URL)
  destination.protocol = 'ws:'
  const socket = new WebSocket(destination, { headers: { Cookie: cookie } })
  const events: ServerEvent[] = []
  socket.on('message', raw => events.push(JSON.parse(raw.toString()) as ServerEvent))
  await new Promise<void>((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject) })
  try {
    socket.send(JSON.stringify({ type: 'joinRoom', roomId, intent: 'resume', requestId: 'process-join' }))
    await expect.poll(() => events.some(event => event.type === 'stateUpdate')).toBe(true)
    const identity: CommandIdentity = { scopeId: expected.scopeId, commandId: expected.commandId }
    socket.send(JSON.stringify({ type: 'getCommandReceipt', identity, requestId: 'process-receipt' }))
    await expect.poll(() => events.some(event => event.type === 'commandReceipt' && event.requestId === 'process-receipt')).toBe(true)
    const receipt = events.find(event => event.type === 'commandReceipt' && event.requestId === 'process-receipt')
    expect(receipt).toMatchObject({ status: 'completed', receipt: expected })
    socket.send(JSON.stringify({ ...original, requestId: 'process-duplicate' }))
    await expect.poll(() => events.some(event => event.type === 'commandReceipt' && event.requestId === 'process-duplicate')).toBe(true)
    expect(events.find(event => event.type === 'commandReceipt' && event.requestId === 'process-duplicate'))
      .toMatchObject({ status: 'completed', receipt: expected })
    return events
  } finally { socket.close(); await new Promise<void>(resolve => socket.once('close', () => resolve())) }
}
