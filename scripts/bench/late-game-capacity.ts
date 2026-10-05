import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { monitorEventLoopDelay, performance } from 'node:perf_hooks'
import Database from 'better-sqlite3'
import type { WebSocket } from 'ws'
import { runMigrations } from '../../server/db.ts'
import { Broadcaster } from '../../server/connection/broadcaster.ts'
import { GameSession } from '../../server/game/authoritative-session.ts'
import { RoomCommitter } from '../../server/game/room-committer.ts'
import { createRoomPersistenceCheckpoint } from '../../server/game/room-persistence-checkpoint.ts'
import { SqliteRoomPersistence } from '../../server/game/persistence/sqlite-adapter.ts'
import type { Room } from '../../server/game/room.ts'
import { familySize } from '../../shared/domain/player.ts'
import { snapshotForWorker } from '../../shared/session/recovery-catalog.ts'
import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization.ts'
import { assertResourceLimits, readCgroupLimits } from './room-capacity.ts'
import { executeWorkloadCommand, type RoomWorkload } from './room-performance.ts'

const flag = (key: string, fallback = '') => process.argv.includes(key) ? process.argv[process.argv.indexOf(key) + 1]! : fallback
const fixture = flag('--fixture'), output = flag('--output')
const nameMode = flag('--names', 'override')
assert.ok(nameMode === 'matched' || nameMode === 'override', '--names must be matched or override')
if (!fixture || !output) throw new Error('usage: late-game-capacity.ts --fixture <4p-late.json> --output <report.json> [--rooms 30] [--warmup-seconds 1] [--duration-seconds 5] [--action-rate 0.45125] [--keep-db]')
const roomCount = Number(flag('--rooms', '30')), warmupSeconds = Number(flag('--warmup-seconds', '1'))
const durationSeconds = Number(flag('--duration-seconds', '5')), rate = Number(flag('--action-rate', '0.45125'))
assert.ok(Number.isSafeInteger(roomCount) && roomCount > 0)
assert.ok(Number.isFinite(warmupSeconds) && warmupSeconds >= 0 && warmupSeconds <= 60)
assert.ok(Number.isFinite(durationSeconds) && durationSeconds > 0 && durationSeconds <= 60)
assert.ok(Number.isFinite(rate) && rate > 0)
const limits = readCgroupLimits()
assertResourceLimits(limits, false)
assert.equal(limits.cgroupCpuCores, 2)
assert.equal(limits.cgroupMemoryBytes, 2 * 1024 ** 3)
const fixtureText = readFileSync(fixture, 'utf8'), workload = JSON.parse(fixtureText) as RoomWorkload
assert.equal(workload.players, 4)
const capture = (session: GameSession) => snapshotForWorker(serializeSessionSnapshot(session.state, session))
let prefix = new GameSession(rehydrateState(structuredClone(workload.initial))), prefixCommands = 0
let selected: ReturnType<typeof capture>
try {
  while (prefix.state.round < 14 && !prefix.state.gameOver) {
    const command = workload.commands[prefixCommands++]
    assert.ok(command, 'Fixture ended before round 14')
    if (command.type === 'restart') {
      const saved = structuredClone(capture(prefix)); prefix.dispose(); prefix = new GameSession(rehydrateState(saved))
    } else assert.equal(executeWorkloadCommand(prefix, command).ok, true, `Rejected prefix command ${prefixCommands - 1}`)
  }
  assert.equal(prefix.state.round, 14); assert.equal(prefix.state.gameOver, false)
  assert.equal(prefix.state.players.length, 4)
  for (const player of prefix.state.players) {
    assert.equal(familySize(player), 5, `${player.id} must have five active workers`)
    assert.ok(new Set([...player.improvements, ...player.minorPlayed, ...player.occupationPlayed]).size >= 10, `${player.id} needs ten played cards`)
  }
  assert.ok(prefixCommands < workload.commands.length, 'No late commands remain')
  selected = capture(prefix)
} finally { prefix.dispose() }
const directory = mkdtempSync(join(tmpdir(), 'oa-late-capacity-')), dbPath = join(directory, 'probe.db')
const db = new Database(dbPath)
db.pragma('journal_mode = WAL'); db.pragma('synchronous = NORMAL'); db.pragma('foreign_keys = ON'); runMigrations(db)
const persistence = new SqliteRoomPersistence(db), checkpoint = createRoomPersistenceCheckpoint({ persistence })
const committer = new RoomCommitter({ persistence, enabled: true, viewerBuildId: 'probe', gameBuildId: 'probe', viewerBuildExists: () => true })
const broadcaster = new Broadcaster({ checkpoint })
type Entry = { room: Room; index: number; due: number; sent: number; lastSend: number; stopped?: 'exhausted' | 'error' }
const entries: Entry[] = []
const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, Math.max(0, ms)))
const summary = (values: number[]) => {
  const sorted = values.toSorted((a, b) => a - b)
  const at = (fraction: number) => sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)] ?? null
  return { count: sorted.length, p50Ms: at(0.5), p95Ms: at(0.95), p99Ms: at(0.99), maxMs: at(1) }
}
const runUntil = async (end: number) => {
  const latency: number[] = [], queue: number[] = [], scheduledLatency: number[] = []
  const errors: Array<{ roomId: string; commandIndex: number; error: string }> = []
  let attempted = 0, accepted = 0, committed = 0, unchanged = 0, restarts = 0, messages = 0
  while (performance.now() < end) {
    const entry = entries.filter(item => !item.stopped).sort((a, b) => a.due - b.due)[0]
    if (!entry) break
    if (entry.due >= end) { await sleep(end - performance.now()); continue }
    if (entry.due > performance.now()) { await sleep(entry.due - performance.now()); continue }
    const commandIndex = entry.index++, command = workload.commands[commandIndex]!
    const due = entry.due, started = performance.now(), beforeSends = entry.sent
    entry.due += 1000 / rate; attempted += 1
    try {
      if (command.type === 'restart') {
        const saved = persistence.load(entry.room.id)?.serialized
        assert.ok(saved, 'Restart lost persisted state')
        entry.room.session.dispose(); entry.room.session = new GameSession(rehydrateState(saved))
        const result = committer.prepareRoom(entry.room, { missingPrefix: false })
        if (result.kind === 'blocked') throw new Error(result.error)
        restarts += 1
      } else {
        const response = executeWorkloadCommand(entry.room.session, command)
        assert.equal(response.ok, true, response.error)
        const result = committer.commit(entry.room, response, { commandType: command.type, intentJson: JSON.stringify(command) }, command.actor)
        if (result.kind === 'blocked') throw new Error(result.error)
        if (result.kind === 'committed') {
          Reflect.apply(broadcaster.broadcastCommitted, broadcaster, [entry.room, response, 'action', undefined, undefined,
            'serializedState' in result ? result.serializedState : undefined])
          assert.equal(entry.sent - beforeSends, 4, 'Every committed command must reach all four socket sinks')
          committed += 1
        } else {
          broadcaster.sendStateTo(entry.room.players[command.actor]!.ws, entry.room, response, undefined, 'action')
          assert.equal(entry.sent - beforeSends, 1); unchanged += 1
        }
        accepted += 1; messages += entry.sent - beforeSends
        latency.push(entry.lastSend - started); queue.push(Math.max(0, started - due)); scheduledLatency.push(entry.lastSend - due)
      }
      if (entry.index >= workload.commands.length) entry.stopped = 'exhausted'
    } catch (error) {
      entry.stopped = 'error'
      errors.push({ roomId: entry.room.id, commandIndex, error: error instanceof Error ? error.message : String(error) })
    }
  }
  return { attempted, accepted, committed, unchanged, restarts, messages, errors,
    commandToLastSinkSend: summary(latency), queueDelay: summary(queue), scheduledToLastSinkSend: summary(scheduledLatency) }
}
const delay = monitorEventLoopDelay({ resolution: 10 })
let rssTimer: ReturnType<typeof setInterval> | undefined
try {
  const insertUser = db.prepare("INSERT INTO users (id,username,display_name,password_hash,created_at) VALUES (?,?,?,'probe',1)")
  for (let index = 0; index < roomCount; index += 1) {
    const entry: Entry = { room: {} as Room, index: prefixCommands, due: 0, sent: 0, lastSend: 0 }
    const players = Array.from({ length: 4 }, (_, playerIndex) => {
      const userId = `late-${index}-u${playerIndex}`
      const name = nameMode === 'matched' ? selected.state.players[playerIndex]!.name : `P${playerIndex}`
      insertUser.run(userId, userId, name)
      const ws = { OPEN: 1, readyState: 1, send: () => { entry.sent += 1; entry.lastSend = performance.now() } } as unknown as WebSocket
      return { playerIndex, name, userId, ws }
    })
    entry.room = { id: `late-${index}`, session: new GameSession(rehydrateState(structuredClone(selected))), players,
      maxPlayers: 4, status: 'playing', version: 0, startedAt: 1, createdBy: players[0]!.userId }
    entries.push(entry)
    const initial = committer.prepareRoom(entry.room, { missingPrefix: true })
    if (initial.kind === 'blocked') throw new Error(initial.error)
  }
  const origin = performance.now()
  entries.forEach((entry, index) => { entry.due = origin + index * 1000 / (roomCount * rate) })
  const warmup = await runUntil(origin + warmupSeconds * 1000)
  const activeRoomsStart = entries.filter(entry => !entry.stopped).length
  let rssPeakBytes = process.memoryUsage().rss
  rssTimer = setInterval(() => { rssPeakBytes = Math.max(rssPeakBytes, process.memoryUsage().rss) }, 25)
  delay.enable()
  const cpuStart = process.cpuUsage(), started = performance.now(), end = started + durationSeconds * 1000
  const measurement = await runUntil(end), elapsedMs = performance.now() - started, cpu = process.cpuUsage(cpuStart)
  clearInterval(rssTimer); delay.disable(); rssPeakBytes = Math.max(rssPeakBytes, process.memoryUsage().rss)
  const cpuMs = (cpu.user + cpu.system) / 1000
  const remainingDueCommands = entries.reduce((total, entry) => total + (entry.stopped ? 0 : Math.min(workload.commands.length - entry.index, Math.max(0, Math.ceil((end - entry.due) * rate / 1000)))), 0)
  const digest = (value: string | Buffer) => createHash('sha256').update(value).digest('hex')
  const report = { schemaVersion: 1, node: process.version, ...limits,
    sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), harnessSha256: digest(readFileSync(new URL(import.meta.url))),
    fixture, fixtureSha256: digest(fixtureText), preparation: workload.preparation,
    config: { roomCount, playersPerRoom: 4, nameMode, warmupSeconds, durationSeconds, commandsPerRoomSecond: rate },
    selection: { round: selected.state.round, prefixCommands, remainingCommandsPerRoom: workload.commands.length - prefixCommands,
      players: selected.state.players.map(player => ({ id: player.id, workers: familySize(player), played: new Set([...player.improvements, ...player.minorPlayed, ...player.occupationPlayed]).size })) },
    warmup, measurement: { ...measurement, elapsedMs, cpuUserMs: cpu.user / 1000, cpuSystemMs: cpu.system / 1000, cpuMs,
      cpuPercent: cpuMs / elapsedMs * 100, rssPeakBytes, eventLoopP99Ms: delay.count ? delay.percentile(99) / 1e6 : null,
      activeRoomsStart, activeRoomsEnd: entries.filter(entry => !entry.stopped).length, remainingDueCommands,
      completedRequestedWindow: elapsedMs >= durationSeconds * 1000, observedAcceptedPerInitialRoomSecond: measurement.accepted / roomCount / (elapsedMs / 1000) },
    rooms: entries.map(entry => ({ id: entry.room.id, nextCommandIndex: entry.index, remainingCommands: workload.commands.length - entry.index, status: entry.stopped ?? 'active', round: entry.room.session.state.round })),
    database: { path: process.argv.includes('--keep-db') ? dbPath : null, journalMode: 'WAL', synchronous: 'NORMAL', shared: true },
    scope: 'Production Session/SQLite Room commit/four-viewer broadcast with in-process socket sinks. No network, client rendering or HTTP/WS routing. Prefix/setup excluded; measurement includes scheduled idle time and any recorded restarts. Exhausted/failed rooms stop without resets or redistributing their rate. Per-phase CPU is a separate diagnostic; no capacity acceptance verdict is inferred.' }
  mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, JSON.stringify(report, null, 2) + '\n')
  console.log(`Saved late-game capacity probe: ${output}`)
} finally {
  if (rssTimer) clearInterval(rssTimer)
  delay.disable(); committer.shutdown(); checkpoint.shutdown(); entries.forEach(entry => entry.room.session.dispose()); db.close()
  if (!process.argv.includes('--keep-db')) rmSync(directory, { recursive: true, force: true })
}
