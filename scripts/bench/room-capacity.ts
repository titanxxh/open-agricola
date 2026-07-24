import { execFileSync } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { cpus } from 'node:os'
import { dirname, join } from 'node:path'
import { monitorEventLoopDelay, performance } from 'node:perf_hooks'
import Database from 'better-sqlite3'
import type { WebSocket } from 'ws'
import '../../shared/cards/register-all.ts'
import {
  rehydrateState,
  serializeState,
  type SerializedGameState,
} from '../../shared/session/serialization.ts'
import { Broadcaster } from '../../server/connection/broadcaster.ts'
import { GameSession } from '../../server/game/authoritative-session.ts'
import type {
  RoomMeta,
  RoomPersistence,
  RoomSnapshot,
  RestoreOptions,
} from '../../server/game/persistence/room-persistence.ts'
import { buildEnvelope } from '../../server/connection/envelope-builder.ts'
import { SqliteRoomPersistence } from '../../server/game/persistence/sqlite-adapter.ts'
import type { Room } from '../../server/game/room.ts'
import { createRoomPersistenceCheckpoint } from '../../server/game/room-persistence-checkpoint.ts'

type Config = {
  levels: number[]
  warmupSeconds: number
  durationSeconds: number
  actionsPerRoomSecond: number
  targetStateBytes: number
  reportPath: string
  label: 'baseline' | 'after'
  allowUnconstrained: boolean
  smoke: boolean
}

type Thresholds = {
  actionP99Ms: number
  eventLoopP99Ms: number
  rssBytes: number
}

type CostProfile = {
  totalActionMs: number
  persistenceStateMs: number
  viewerEnvelopeMs: number
  adapterSaveMs: number
  rawSqliteWriteMs: number
}

type LevelResult = {
  roomCount: number
  actions: number
  actionP50Ms: number
  actionP95Ms: number
  actionP99Ms: number
  eventLoopP50Ms: number
  eventLoopP95Ms: number
  eventLoopP99Ms: number
  burstMs: number
  rssPeakBytes: number
  cpuPercent: number
  dbBytes: number
  walBytes: number
  costProfile: CostProfile
  passed: boolean
  failures: string[]
}

type Environment = {
  commit: string
  node: string
  cpuModel: string
  cgroupCpuCores: number | null
  cgroupMemoryBytes: number | null
  sqlite: string
  journalMode: string
  synchronous: number
  invocation: string
}

const thresholds: Thresholds = {
  actionP99Ms: 250,
  eventLoopP99Ms: 100,
  rssBytes: Math.floor(1.8 * 1024 ** 3),
}

const numberFlag = (args: string[], name: string, fallback: number): number => {
  const index = args.indexOf(name)
  if (index < 0) return fallback
  const value = Number(args[index + 1])
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be a positive number`)
  return value
}

const stringFlag = (args: string[], name: string, fallback: string): string => {
  const index = args.indexOf(name)
  if (index < 0) return fallback
  const value = args[index + 1]
  if (!value) throw new Error(`${name} requires a value`)
  return value
}

export const parseRoomCapacityArgs = (args: string[]): Config => {
  const smoke = args.includes('--smoke')
  const levels = stringFlag(args, '--levels', '50,100,200,300,400,500,600,700,800,900,1000')
    .split(',')
    .map(Number)
  if (levels.some((level) => !Number.isInteger(level) || level <= 0)) {
    throw new Error('--levels must be comma-separated positive integers')
  }
  const label = stringFlag(args, '--label', 'baseline')
  if (label !== 'baseline' && label !== 'after') throw new Error('--label must be baseline or after')
  return {
    levels: smoke ? [2] : levels,
    warmupSeconds: smoke ? 0.05 : numberFlag(args, '--warmup-seconds', 15),
    durationSeconds: smoke ? 0.2 : numberFlag(args, '--duration-seconds', 60),
    actionsPerRoomSecond: smoke ? 20 : numberFlag(args, '--action-rate', 0.2),
    targetStateBytes: smoke ? 12 * 1024 : numberFlag(args, '--state-bytes', 50 * 1024),
    reportPath: stringFlag(
      args,
      '--report',
      `docs/performance/room-capacity-${label}.md`,
    ),
    label,
    allowUnconstrained: args.includes('--allow-unconstrained'),
    smoke,
  }
}

const readText = (path: string): string | null => {
  try {
    return readFileSync(path, 'utf8').trim()
  } catch {
    return null
  }
}

const cgroupPath = (): string => {
  const entry = readText('/proc/self/cgroup')
    ?.split('\n')
    .find((line) => line.startsWith('0::'))
  return entry ? join('/sys/fs/cgroup', entry.slice(3)) : '/sys/fs/cgroup'
}

const readCgroupLimits = (): Pick<Environment, 'cgroupCpuCores' | 'cgroupMemoryBytes'> => {
  const root = cgroupPath()
  const cpuRaw = readText(join(root, 'cpu.max'))
  const memoryRaw = readText(join(root, 'memory.max'))
  if (cpuRaw) {
    const [quota, period] = cpuRaw.split(/\s+/)
    return {
      cgroupCpuCores: quota !== 'max' && Number(period) > 0
        ? Number(quota) / Number(period)
        : null,
      cgroupMemoryBytes: memoryRaw && memoryRaw !== 'max' ? Number(memoryRaw) : null,
    }
  }
  const quota = Number(
    readText('/sys/fs/cgroup/cpu,cpuacct/cpu.cfs_quota_us') ??
    readText('/sys/fs/cgroup/cpu/cpu.cfs_quota_us'),
  )
  const period = Number(
    readText('/sys/fs/cgroup/cpu,cpuacct/cpu.cfs_period_us') ??
    readText('/sys/fs/cgroup/cpu/cpu.cfs_period_us'),
  )
  const memory = Number(readText('/sys/fs/cgroup/memory/memory.limit_in_bytes'))
  return {
    cgroupCpuCores: quota > 0 && period > 0 ? quota / period : null,
    cgroupMemoryBytes: memory > 0 ? memory : null,
  }
}

const assertResourceLimits = (
  limits: Pick<Environment, 'cgroupCpuCores' | 'cgroupMemoryBytes'>,
  allowUnconstrained: boolean,
): void => {
  if (allowUnconstrained) return
  if (
    limits.cgroupCpuCores === null ||
    limits.cgroupCpuCores > 2.01 ||
    limits.cgroupMemoryBytes === null ||
    limits.cgroupMemoryBytes > 2 * 1024 ** 3
  ) {
    throw new Error('probe must run inside a cgroup limited to 2 CPU and 2 GiB; use --allow-unconstrained only for smoke checks')
  }
}

const percentile = (values: number[], fraction: number): number => {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)]!
}

const sizeOf = (path: string): number => {
  try {
    return statSync(path).size
  } catch {
    return 0
  }
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

const createSchema = (db: Database.Database): void => {
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL')
  db.pragma('busy_timeout = 5000')
  db.pragma('foreign_keys = ON')
  db.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY);
    CREATE TABLE rooms (
      id TEXT PRIMARY KEY,
      created_by TEXT REFERENCES users(id),
      state_json TEXT,
      max_players INTEGER NOT NULL DEFAULT 2,
      status TEXT NOT NULL DEFAULT 'waiting',
      version INTEGER NOT NULL DEFAULT 0,
      custom_card_ids TEXT NOT NULL DEFAULT '[]',
      enable_parent_cards INTEGER NOT NULL DEFAULT 0,
      draft_parents INTEGER,
      enable_through_the_seasons INTEGER NOT NULL DEFAULT 0,
      enable_farmers_of_the_moor INTEGER NOT NULL DEFAULT 0,
      allow_incomplete_farmers_of_the_moor_minor_deal INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE room_players (
      room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id),
      player_index INTEGER NOT NULL,
      joined_at INTEGER NOT NULL,
      PRIMARY KEY (room_id, user_id)
    );
  `)
}

class TimedPersistence implements RoomPersistence {
  saveMs = 0
  errors: string[] = []

  constructor(private readonly inner: RoomPersistence) {}

  reset(): void {
    this.saveMs = 0
    this.errors = []
  }

  load(id: string): RoomSnapshot | null {
    return this.inner.load(id)
  }

  save(id: string, serialized: Parameters<RoomPersistence['save']>[1], meta: RoomMeta): void {
    const start = performance.now()
    try {
      this.inner.save(id, serialized, meta)
    } catch (err) {
      this.errors.push(err instanceof Error ? err.message : String(err))
    } finally {
      this.saveMs += performance.now() - start
    }
  }

  delete(id: string): void {
    this.inner.delete(id)
  }

  markFinished(id: string, now: number): void {
    this.inner.markFinished(id, now)
  }

  listRestorable(opts: RestoreOptions): RoomSnapshot[] {
    return this.inner.listRestorable(opts)
  }
}

const createState = (targetBytes: number): SerializedGameState => {
  const session = new GameSession(563, undefined, { playerCount: 2 })
  session.state.round = 10
  let index = 0
  while (
    Buffer.byteLength(JSON.stringify(serializeState(session.state, {
      engineStack: session.getEngineStack(),
    }))) < targetBytes
  ) {
    session.state.log.push({
      key: 'benchmark.padding',
      params: { index, value: 'x'.repeat(512) },
    })
    index += 1
  }
  return serializeState(session.state, {
    engineStack: session.getEngineStack(),
  })
}

const fakeSocket = (): WebSocket => ({
  OPEN: 1,
  readyState: 1,
  send: () => undefined,
}) as unknown as WebSocket

const addRoom = (
  index: number,
  state: SerializedGameState,
  db: Database.Database,
  checkpoint: ReturnType<typeof createRoomPersistenceCheckpoint>,
): Room => {
  const firstUserId = `room-${index}-user-0`
  const secondUserId = `room-${index}-user-1`
  const insertUser = db.prepare('INSERT INTO users (id) VALUES (?)')
  insertUser.run(firstUserId)
  insertUser.run(secondUserId)
  const session = new GameSession(rehydrateState(structuredClone(state)))
  const room: Room = {
    id: `bench-${index}`,
    session,
    players: [
      { ws: fakeSocket(), playerIndex: 0, name: 'Player 1', userId: firstUserId },
      { ws: fakeSocket(), playerIndex: 1, name: 'Player 2', userId: secondUserId },
    ],
    maxPlayers: 2,
    version: 0,
    status: 'playing',
    createdBy: firstUserId,
  }
  checkpoint.recordCreated(room)
  return room
}

const mutateAndBroadcast = (room: Room, broadcaster: Broadcaster): string | null => {
  try {
    room.session.state.rngTick = (room.session.state.rngTick ?? 0) + 1
    const resp = room.session.getState()
    if (!resp.ok) return resp.error ?? 'response ok=false'
    broadcaster.broadcastState(room, resp, 'action')
    return null
  } catch (err) {
    return err instanceof Error ? err.message : String(err)
  }
}

const runSteady = async (
  rooms: Room[],
  broadcaster: Broadcaster,
  seconds: number,
  rate: number,
  samples?: number[],
): Promise<{ actions: number; errors: string[] }> => {
  const durationMs = seconds * 1000
  const intervalMs = 1000 / (rooms.length * rate)
  const end = performance.now() + durationMs
  let next = performance.now()
  let actions = 0
  const errors = new Set<string>()
  while (performance.now() < end) {
    const scheduledAt = next
    const error = mutateAndBroadcast(rooms[actions % rooms.length]!, broadcaster)
    if (error) errors.add(error)
    samples?.push(performance.now() - scheduledAt)
    actions += 1
    next += intervalMs
    await sleep(Math.max(0, next - performance.now()))
  }
  return { actions, errors: [...errors] }
}

const profileCosts = (
  room: Room,
  broadcaster: Broadcaster,
  persistence: RoomPersistence,
  db: Database.Database,
): CostProfile => {
  const iterations = 10
  let totalActionMs = 0
  let persistenceStateMs = 0
  let viewerEnvelopeMs = 0
  let adapterSaveMs = 0
  let rawSqliteWriteMs = 0
  const state = room.session.state
  const meta: RoomMeta = {
    createdBy: room.createdBy ?? null,
    maxPlayers: room.maxPlayers,
    customCardDbIds: [],
    status: room.status,
    players: room.players.map((player) => ({
      userId: player.userId!,
      playerIndex: player.playerIndex,
    })),
  }
  const serialized = serializeState(state, { engineStack: room.session.getEngineStack() })
  const json = JSON.stringify(serialized)
  const update = db.prepare('UPDATE rooms SET state_json = ?, version = version + 1, updated_at = ? WHERE id = ?')
  for (let index = 0; index < iterations; index += 1) {
    let start = performance.now()
    serializeState(state, { engineStack: room.session.getEngineStack() })
    persistenceStateMs += performance.now() - start
    const resp = room.session.getState()
    start = performance.now()
    for (const player of state.players) {
      JSON.stringify(buildEnvelope({
        room,
        resp,
        viewerPlayerId: player.id,
        version: room.version,
        cause: 'action',
        emittedAt: Date.now(),
      }))
    }
    viewerEnvelopeMs += performance.now() - start
    start = performance.now()
    persistence.save(room.id, serialized, meta)
    adapterSaveMs += performance.now() - start
    start = performance.now()
    update.run(json, Date.now(), room.id)
    rawSqliteWriteMs += performance.now() - start
    start = performance.now()
    mutateAndBroadcast(room, broadcaster)
    totalActionMs += performance.now() - start
  }
  return {
    totalActionMs: totalActionMs / iterations,
    persistenceStateMs: persistenceStateMs / iterations,
    viewerEnvelopeMs: viewerEnvelopeMs / iterations,
    adapterSaveMs: adapterSaveMs / iterations,
    rawSqliteWriteMs: rawSqliteWriteMs / iterations,
  }
}

const runLevel = async (args: {
  rooms: Room[]
  broadcaster: Broadcaster
  persistence: TimedPersistence
  checkpoint: ReturnType<typeof createRoomPersistenceCheckpoint>
  db: Database.Database
  dbPath: string
  config: Config
}): Promise<LevelResult> => {
  const { rooms, broadcaster, persistence, checkpoint, db, dbPath, config } = args
  await runSteady(rooms, broadcaster, config.warmupSeconds, config.actionsPerRoomSecond)
  persistence.reset()
  const delay = monitorEventLoopDelay({ resolution: 10 })
  delay.enable()
  const latencies: number[] = []
  let rssPeakBytes = process.memoryUsage().rss
  const rssTimer = setInterval(() => {
    rssPeakBytes = Math.max(rssPeakBytes, process.memoryUsage().rss)
  }, 25)
  rssTimer.unref()
  const cpuStart = process.cpuUsage()
  const wallStart = performance.now()
  const steady = await runSteady(
    rooms,
    broadcaster,
    config.durationSeconds,
    config.actionsPerRoomSecond,
    latencies,
  )
  const burstStart = performance.now()
  const burstErrors = new Set<string>()
  for (const room of rooms) {
    const error = mutateAndBroadcast(room, broadcaster)
    if (error) burstErrors.add(error)
  }
  const burstMs = performance.now() - burstStart
  await sleep(25)
  const wallMs = performance.now() - wallStart
  const cpu = process.cpuUsage(cpuStart)
  clearInterval(rssTimer)
  delay.disable()
  rssPeakBytes = Math.max(rssPeakBytes, process.memoryUsage().rss)
  checkpoint.flushAll()
  const dbBytes = sizeOf(dbPath)
  const walBytes = sizeOf(`${dbPath}-wal`)
  const costProfile = profileCosts(rooms[0]!, broadcaster, persistence, db)
  const failures: string[] = []
  for (const error of [...steady.errors, ...burstErrors]) failures.push(`invalid response: ${error}`)
  for (const error of new Set(persistence.errors)) failures.push(`persistence error: ${error}`)
  const actionP99Ms = percentile(latencies, 0.99)
  const eventLoopP99Ms = delay.percentile(99) / 1e6
  if (actionP99Ms > thresholds.actionP99Ms) failures.push(`steady action p99 ${actionP99Ms.toFixed(1)}ms`)
  if (eventLoopP99Ms > thresholds.eventLoopP99Ms) failures.push(`event-loop p99 ${eventLoopP99Ms.toFixed(1)}ms`)
  if (rssPeakBytes > thresholds.rssBytes) failures.push(`RSS ${(rssPeakBytes / 1024 ** 3).toFixed(2)}GiB`)
  return {
    roomCount: rooms.length,
    actions: steady.actions + rooms.length,
    actionP50Ms: percentile(latencies, 0.5),
    actionP95Ms: percentile(latencies, 0.95),
    actionP99Ms,
    eventLoopP50Ms: delay.percentile(50) / 1e6,
    eventLoopP95Ms: delay.percentile(95) / 1e6,
    eventLoopP99Ms,
    burstMs,
    rssPeakBytes,
    cpuPercent: ((cpu.user + cpu.system) / 1000 / wallMs) * 100,
    dbBytes,
    walBytes,
    costProfile,
    passed: failures.length === 0,
    failures,
  }
}

const formatBytes = (bytes: number): string => `${(bytes / 1024 ** 2).toFixed(1)} MiB`
const formatMs = (value: number): string => value.toFixed(1)

const renderReport = (
  config: Config,
  environment: Environment,
  stateBytes: number,
  levels: LevelResult[],
): string => {
  const title = config.label === 'baseline' ? 'Baseline' : 'After'
  const highest = [...levels].reverse().find((level) => level.passed)
  const firstFailure = levels.find((level) => !level.passed)
  const rows = levels.map((level, index) => {
    const previous = levels[index - 1]
    const incrementalRss = previous
      ? formatBytes(
          (level.rssPeakBytes - previous.rssPeakBytes) /
          (level.roomCount - previous.roomCount),
        )
      : 'n/a'
    return `| ${level.roomCount} | ${level.actions} | ${formatMs(level.actionP50Ms)} | ${formatMs(level.actionP95Ms)} | ${formatMs(level.actionP99Ms)} | ${formatMs(level.eventLoopP50Ms)} | ${formatMs(level.eventLoopP95Ms)} | ${formatMs(level.eventLoopP99Ms)} | ${formatMs(level.burstMs)} | ${formatBytes(level.rssPeakBytes)} | ${incrementalRss} | ${level.cpuPercent.toFixed(0)}% | ${formatBytes(level.dbBytes)} | ${formatBytes(level.walBytes)} | ${level.passed ? 'PASS' : `FAIL: ${level.failures.join(', ')}`} |`
  },
  ).join('\n')
  const profiles = levels.map((level) =>
    `| ${level.roomCount} | ${level.costProfile.totalActionMs.toFixed(3)} | ${level.costProfile.persistenceStateMs.toFixed(3)} | ${level.costProfile.viewerEnvelopeMs.toFixed(3)} | ${level.costProfile.adapterSaveMs.toFixed(3)} | ${level.costProfile.rawSqliteWriteMs.toFixed(3)} |`,
  ).join('\n')
  return `# Room Capacity ${title}

## Environment

- Commit: ${environment.commit}
- Node: ${environment.node}
- CPU: ${environment.cpuModel}
- Cgroup CPU limit: ${environment.cgroupCpuCores ?? 'unbounded'} cores
- Cgroup memory limit: ${environment.cgroupMemoryBytes === null ? 'unbounded' : formatBytes(environment.cgroupMemoryBytes)}
- SQLite: ${environment.sqlite}
- journal_mode: ${environment.journalMode}
- synchronous: ${environment.synchronous}
- Serialized state: ${(stateBytes / 1024).toFixed(1)} KiB
- Exact invocation: ${environment.invocation}

## Workload

- Active two-player rooms with two open WebSocket seats
- Late-game state; production viewer envelopes and persistence checkpoint path
- In-process socket sink; network transport latency is excluded
- Levels: ${config.levels.join(', ')}
- Warmup per level: ${config.warmupSeconds}s
- Measurement per level: ${config.durationSeconds}s
- Steady action rate: ${config.actionsPerRoomSecond} actions/room/s
- Burst: one synchronized action per room
- Thresholds: action p99 <= ${thresholds.actionP99Ms}ms, event-loop p99 <= ${thresholds.eventLoopP99Ms}ms, RSS <= ${formatBytes(thresholds.rssBytes)}
- Approx. incremental RSS / room is the peak-RSS slope from the preceding ramp level; it is unavailable at the first level.

## Capacity

| Rooms | Actions (steady + burst) | Steady action p50 ms | Steady action p95 ms | Steady action p99 ms | Event-loop p50 ms | Event-loop p95 ms | Event-loop p99 ms | Burst ms | Peak RSS | Approx. incremental RSS / room | CPU | DB | WAL | Result |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | :--- |
${rows}

## Cost attribution

| Rooms | Full action-to-broadcast ms | Persistence state serialization ms | Two-viewer envelope serialization ms | Adapter save ms | Raw SQLite update ms |
| ---: | ---: | ---: | ---: | ---: | ---: |
${profiles}

## Conclusion

- Maximum passing level: ${highest?.roomCount ?? 'none'}
- First failing level: ${firstFailure?.roomCount ?? 'none'}
- Binding evidence: ${firstFailure?.failures.join(', ') || 'No threshold crossed in the configured range'}
`
}

export const runRoomCapacityProbe = async (config: Config): Promise<{
  config: Config
  environment: Environment
  stateBytes: number
  levels: LevelResult[]
}> => {
  const limits = readCgroupLimits()
  assertResourceLimits(limits, config.allowUnconstrained)
  const tempDir = mkdtempSync(join(process.env.TMPDIR ?? '/tmp', 'oa-room-capacity-'))
  const dbPath = join(tempDir, 'capacity.db')
  const db = new Database(dbPath)
  try {
    createSchema(db)
    const sqlite = new SqliteRoomPersistence(db)
    const persistence = new TimedPersistence(sqlite)
    const checkpoint = createRoomPersistenceCheckpoint({ persistence })
    const broadcaster = new Broadcaster({ checkpoint })
    const baseState = createState(config.targetStateBytes)
    const stateBytes = Buffer.byteLength(JSON.stringify(baseState))
    const rooms: Room[] = []
    const levels: LevelResult[] = []
    for (const level of config.levels) {
      while (rooms.length < level) rooms.push(addRoom(rooms.length, baseState, db, checkpoint))
      const result = await runLevel({
        rooms,
        broadcaster,
        persistence,
        checkpoint,
        db,
        dbPath,
        config,
      })
      levels.push(result)
      if (!result.passed && !config.smoke) break
    }
    const environment: Environment = {
      commit: process.env.ROOM_CAPACITY_COMMIT ??
        execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
      node: process.version,
      cpuModel: cpus()[0]?.model ?? 'unknown',
      ...limits,
      sqlite: (db.prepare('SELECT sqlite_version() AS version').get() as { version: string }).version,
      journalMode: String(db.pragma('journal_mode', { simple: true })),
      synchronous: Number(db.pragma('synchronous', { simple: true })),
      invocation: process.env.ROOM_CAPACITY_INVOCATION ??
        `pnpm exec tsx scripts/bench/room-capacity.ts ${process.argv.slice(2).join(' ')}`,
    }
    mkdirSync(dirname(config.reportPath), { recursive: true })
    writeFileSync(config.reportPath, renderReport(config, environment, stateBytes, levels))
    return { config, environment, stateBytes, levels }
  } finally {
    db.close()
    rmSync(tempDir, { recursive: true, force: true })
  }
}

if (process.argv[1]?.endsWith('room-capacity.ts')) {
  const summary = await runRoomCapacityProbe(parseRoomCapacityArgs(process.argv.slice(2)))
  process.stdout.write(`${JSON.stringify(summary)}\n`)
}
