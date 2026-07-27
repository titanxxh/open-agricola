import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
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
import { gzipSync } from 'node:zlib'
import Database from 'better-sqlite3'
import type { WebSocket } from 'ws'
import '../../shared/cards/register-all.ts'
import { familySize, workersAvailable } from '../../shared/domain/player.ts'
import {
  rehydrateState,
  serializeState,
  type SerializedGameState,
} from '../../shared/session/serialization.ts'
import { Broadcaster } from '../../server/connection/broadcaster.ts'
import {
  GameSession,
  type SessionResponse,
} from '../../server/game/authoritative-session.ts'
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
  label: 'baseline' | 'after' | 'replay'
  replayArchive: boolean
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

type ReplayMetrics = {
  writes: number
  acceptedCommands: number
  checkpoints: number
  deltas: number
  payloadBytes: number
  archiveP50Ms: number
  archiveP95Ms: number
  archiveP99Ms: number
  archiveMaxMs: number
  sqliteP99Ms: number
  sqliteMaxMs: number
  sqliteTailPauses: number
  walAutoCheckpointPages: number
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
  dbGrowthBytes: number
  walGrowthBytes: number
  costProfile: CostProfile
  replay: ReplayMetrics | null
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
  walAutoCheckpointPages: number
  invocation: string
}

type JsonValue = null | boolean | number | string | JsonValue[] | {
  [key: string]: JsonValue
}

type ReplayPatchOperation =
  | { op: 'add' | 'replace'; path: string; value: JsonValue }
  | { op: 'remove'; path: string }

type ReplayStepWrite = {
  roomId: string
  stateJson: string
  stepNo: number
  roomVersion: number
  payloadKind: 'checkpoint' | 'delta'
  payload: Buffer
  frameHash: string
  actorPlayerIndex: number | null
  commandType: string
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
  if (label !== 'baseline' && label !== 'after' && label !== 'replay') {
    throw new Error('--label must be baseline, after, or replay')
  }
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
    replayArchive: args.includes('--replay-archive'),
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

const jsonPointerPart = (value: string): string => value.replaceAll('~', '~0').replaceAll('/', '~1')

const isJsonObject = (value: JsonValue): value is { [key: string]: JsonValue } =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

const buildReplayPatch = (
  before: JsonValue,
  after: JsonValue,
  path: string = '',
): ReplayPatchOperation[] => {
  if (Object.is(before, after)) return []
  if (Array.isArray(before) && Array.isArray(after)) {
    const operations: ReplayPatchOperation[] = []
    const sharedLength = Math.min(before.length, after.length)
    for (let index = 0; index < sharedLength; index += 1) {
      operations.push(...buildReplayPatch(before[index]!, after[index]!, `${path}/${index}`))
    }
    for (let index = before.length - 1; index >= after.length; index -= 1) {
      operations.push({ op: 'remove', path: `${path}/${index}` })
    }
    for (let index = before.length; index < after.length; index += 1) {
      operations.push({ op: 'add', path: `${path}/${index}`, value: after[index]! })
    }
    return operations
  }
  if (isJsonObject(before) && isJsonObject(after)) {
    const operations: ReplayPatchOperation[] = []
    const beforeKeys = Object.keys(before).sort()
    const afterKeys = Object.keys(after).sort()
    for (const key of beforeKeys) {
      if (!(key in after)) {
        operations.push({ op: 'remove', path: `${path}/${jsonPointerPart(key)}` })
      }
    }
    for (const key of afterKeys) {
      const nextPath = `${path}/${jsonPointerPart(key)}`
      if (!(key in before)) {
        operations.push({ op: 'add', path: nextPath, value: after[key]! })
      } else {
        operations.push(...buildReplayPatch(before[key]!, after[key]!, nextPath))
      }
    }
    return operations
  }
  return [{ op: 'replace', path, value: after }]
}

const canonicalizeJson = (value: JsonValue): JsonValue => {
  if (Array.isArray(value)) return value.map(canonicalizeJson)
  if (!isJsonObject(value)) return value
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, canonicalizeJson(value[key]!)]),
  )
}

const createReplaySchema = (db: Database.Database): void => {
  db.exec(`
    CREATE TABLE replay_headers (
      room_id TEXT PRIMARY KEY,
      schema_version INTEGER NOT NULL,
      viewer_build_id TEXT NOT NULL,
      status TEXT NOT NULL,
      missing_prefix INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE replay_steps (
      room_id TEXT NOT NULL,
      step_no INTEGER NOT NULL,
      room_version INTEGER NOT NULL,
      payload_kind TEXT NOT NULL,
      payload BLOB NOT NULL,
      frame_hash TEXT NOT NULL,
      actor_player_index INTEGER,
      command_type TEXT NOT NULL,
      params_json TEXT NOT NULL,
      PRIMARY KEY (room_id, step_no)
    );
  `)
}

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
      started_at INTEGER,
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
    CREATE TABLE game_results (
      room_id TEXT PRIMARY KEY,
      started_at INTEGER NOT NULL,
      finished_at INTEGER NOT NULL,
      rounds_played INTEGER NOT NULL,
      player_count INTEGER NOT NULL,
      enable_community_deck INTEGER NOT NULL,
      enable_parent_cards INTEGER NOT NULL,
      enable_through_the_seasons INTEGER NOT NULL,
      enable_farmers_of_the_moor INTEGER NOT NULL
    );
    CREATE TABLE game_result_players (
      room_id TEXT NOT NULL REFERENCES game_results(room_id) ON DELETE CASCADE,
      player_index INTEGER NOT NULL,
      game_player_id TEXT NOT NULL,
      user_id TEXT,
      display_name TEXT NOT NULL,
      score INTEGER NOT NULL,
      PRIMARY KEY (room_id, player_index)
    );
  `)
}

class ReplayArchiveProbe {
  private readonly previousFrames = new Map<string, JsonValue>()
  private readonly nextStepNo = new Map<string, number>()
  private readonly archiveSamples: number[] = []
  private readonly sqliteSamples: number[] = []
  private readonly writeStep: (args: ReplayStepWrite) => void
  private writes = 0
  private acceptedCommands = 0
  private checkpoints = 0
  private deltas = 0
  private payloadBytes = 0
  readonly walAutoCheckpointPages: number

  constructor(db: Database.Database) {
    const insertHeader = db.prepare(`
      INSERT OR IGNORE INTO replay_headers (
        room_id, schema_version, viewer_build_id, status, missing_prefix
      ) VALUES (?, 1, 'benchmark-viewer', 'recording', 0)
    `)
    const updateRoom = db.prepare(`
      UPDATE rooms
      SET state_json = ?, version = version + 1, updated_at = ?
      WHERE id = ?
    `)
    const insertStep = db.prepare(`
      INSERT INTO replay_steps (
        room_id, step_no, room_version, payload_kind, payload, frame_hash,
        actor_player_index, command_type, params_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, '{}')
    `)
    this.writeStep = db.transaction((args: ReplayStepWrite) => {
      insertHeader.run(args.roomId)
      updateRoom.run(args.stateJson, Date.now(), args.roomId)
      insertStep.run(
        args.roomId,
        args.stepNo,
        args.roomVersion,
        args.payloadKind,
        args.payload,
        args.frameHash,
        args.actorPlayerIndex,
        args.commandType,
      )
    })
    this.walAutoCheckpointPages = Number(db.pragma('wal_autocheckpoint', { simple: true }))
  }

  recordInitial(room: Room): void {
    this.record(room, room.version, null, 'initial')
  }

  recordStep(room: Room, actorPlayerIndex: number, commandType: string): void {
    this.record(
      room,
      room.version + 1,
      actorPlayerIndex,
      commandType,
    )
    this.acceptedCommands += 1
  }

  resetMetrics(): void {
    this.archiveSamples.length = 0
    this.sqliteSamples.length = 0
    this.writes = 0
    this.acceptedCommands = 0
    this.checkpoints = 0
    this.deltas = 0
    this.payloadBytes = 0
  }

  metrics(): ReplayMetrics {
    return {
      writes: this.writes,
      acceptedCommands: this.acceptedCommands,
      checkpoints: this.checkpoints,
      deltas: this.deltas,
      payloadBytes: this.payloadBytes,
      archiveP50Ms: percentile(this.archiveSamples, 0.5),
      archiveP95Ms: percentile(this.archiveSamples, 0.95),
      archiveP99Ms: percentile(this.archiveSamples, 0.99),
      archiveMaxMs: Math.max(0, ...this.archiveSamples),
      sqliteP99Ms: percentile(this.sqliteSamples, 0.99),
      sqliteMaxMs: Math.max(0, ...this.sqliteSamples),
      sqliteTailPauses: this.sqliteSamples.filter((sample) => sample >= 100).length,
      walAutoCheckpointPages: this.walAutoCheckpointPages,
    }
  }

  private record(
    room: Room,
    roomVersion: number,
    actorPlayerIndex: number | null,
    commandType: string,
  ): void {
    const startedAt = performance.now()
    const serialized = serializeState(room.session.state, {
      engineStack: room.session.getEngineStack(),
    })
    const stateJson = JSON.stringify(serialized)
    const frame = JSON.parse(stateJson) as JsonValue
    const previous = this.previousFrames.get(room.id)
    const stepNo = this.nextStepNo.get(room.id) ?? 0
    const patchJson = previous === undefined || stepNo % 16 === 0
      ? null
      : JSON.stringify(buildReplayPatch(previous, frame))
    const payloadKind = patchJson === null ||
      Buffer.byteLength(patchJson!) >= Buffer.byteLength(stateJson)
      ? 'checkpoint'
      : 'delta'
    const payloadText = payloadKind === 'checkpoint' ? stateJson : patchJson!
    const payload = gzipSync(payloadText)
    const frameHash = createHash('sha256')
      .update(JSON.stringify(canonicalizeJson(frame)))
      .digest('hex')
    const sqliteStartedAt = performance.now()
    this.writeStep({
      roomId: room.id,
      stateJson,
      stepNo,
      roomVersion,
      payloadKind,
      payload,
      frameHash,
      actorPlayerIndex,
      commandType,
    })
    this.sqliteSamples.push(performance.now() - sqliteStartedAt)
    this.archiveSamples.push(performance.now() - startedAt)
    this.previousFrames.set(room.id, frame)
    this.nextStepNo.set(room.id, stepNo + 1)
    this.writes += 1
    this.payloadBytes += payload.length
    if (payloadKind === 'checkpoint') this.checkpoints += 1
    else this.deltas += 1
  }
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

  discard(id: string): void {
    this.inner.discard(id)
  }

  complete(result: Parameters<RoomPersistence['complete']>[0]): ReturnType<RoomPersistence['complete']> {
    return this.inner.complete(result)
  }

  hasRoomId(id: string): boolean {
    return this.inner.hasRoomId(id)
  }

  listRestorable(opts: RestoreOptions): RoomSnapshot[] {
    return this.inner.listRestorable(opts)
  }
}

const SAFE_ACTIONS = [
  'forest',
  'reed-bank',
  'fishing',
  'day-laborer',
  'clay-pit',
  'grain-seeds',
  'western-quarry',
  'vegetable-seeds',
  'eastern-quarry',
] as const

type StateFixture = {
  state: SerializedGameState
  trajectorySteps: number
  candidateFrames: number
  remainingCommands: number
}

const availableBenchmarkAction = (session: GameSession): string | undefined => {
  const playerIndex = session.state.currentPlayerIndex
  const player = session.state.players[playerIndex]
  if (!player || workersAvailable(session.state, player) <= 0) return undefined
  const availability = session.getActionAvailability(playerIndex)
  return SAFE_ACTIONS.find((id) => availability[id]) ??
    Object.keys(availability).sort().find((id) => availability[id])
}

const resolveBenchmarkWait = (
  session: GameSession,
  interaction: Extract<SessionResponse['interaction'], { stateId: 'wait' }>,
): {
  resp: SessionResponse
  actorPlayerIndex: number
  commandType: 'resolveChoice' | 'commitSelection'
} => {
  const { request, playerIndex } = interaction
  if (request.kind === 'confirm-next-player') {
    return {
      resp: session.resolveChoice(request.nextPlayerIndex, 'confirm'),
      actorPlayerIndex: request.nextPlayerIndex,
      commandType: 'resolveChoice',
    }
  }
  if (request.kind === 'confirm-player-switch') {
    return {
      resp: session.resolveChoice(request.toPlayerIndex, 'confirm'),
      actorPlayerIndex: request.toPlayerIndex,
      commandType: 'resolveChoice',
    }
  }
  if (request.kind === 'feed') {
    return {
      resp: session.resolveChoice(playerIndex, 'confirm', { selections: [] }),
      actorPlayerIndex: playerIndex,
      commandType: 'resolveChoice',
    }
  }
  if (request.kind === 'choice') {
    const player = session.state.players[playerIndex]!
    const choice = request.options.find((option) =>
      familySize(player) < 4 &&
      player.rooms < 4 &&
      option.labelKey === 'actions.construct.name'
    ) ?? request.options.find((option) => option.value === '__skip__')
      ?? request.options.find((option) => option.value === '__done__')
      ?? request.options[0]
    if (!choice) throw new Error(`empty choice at round ${session.state.round}`)
    return {
      resp: session.resolveChoice(playerIndex, choice.value),
      actorPlayerIndex: playerIndex,
      commandType: 'resolveChoice',
    }
  }
  if (request.kind === 'farm-select' && request.farm.farmType === 'room') {
    const tile = request.farm.selectableTiles[0]
    if (!tile) throw new Error(`no room tile at round ${session.state.round}`)
    return {
      resp: session.commitSelectionChoice(playerIndex, { rooms: [tile] }),
      actorPlayerIndex: playerIndex,
      commandType: 'commitSelection',
    }
  }
  throw new Error(`unhandled ${request.kind} at round ${session.state.round}`)
}

const createStateFixture = (
  targetBytes: number,
  requiredCommands: number,
): StateFixture => {
  const session = new GameSession(563, undefined, { playerCount: 2 })
  const candidates: Array<{
    state: SerializedGameState
    bytes: number
    stepNo: number
  }> = []
  let resp = session.getState()
  let trajectorySteps = 0

  const captureCandidate = (): void => {
    const player = session.state.players[session.state.currentPlayerIndex]
    if (
      resp.interaction.stateId !== 'idle' ||
      session.state.gameOver ||
      !player ||
      workersAvailable(session.state, player) < 2 ||
      !availableBenchmarkAction(session)
    ) return
    const serialized = serializeState(session.state, {
      engineStack: session.getEngineStack(),
    })
    const stateJson = JSON.stringify(serialized)
    candidates.push({
      state: JSON.parse(stateJson) as SerializedGameState,
      bytes: Buffer.byteLength(stateJson),
      stepNo: trajectorySteps,
    })
  }

  const accepted = (next: SessionResponse): void => {
    if (!next.ok) throw new Error(next.error ?? 'representative command rejected')
    resp = next
    trajectorySteps += 1
    captureCandidate()
  }

  captureCandidate()
  while (!session.state.gameOver && trajectorySteps < 500) {
    if (resp.interaction.stateId === 'wait') {
      accepted(resolveBenchmarkWait(session, resp.interaction).resp)
      continue
    }

    const playerIndex = session.state.currentPlayerIndex
    const player = session.state.players[playerIndex]!
    const availability = session.getActionAvailability(playerIndex)
    const size = familySize(player)
    const growthAction = ['wish-children', 'urgent-wish-children']
      .find((id) => size < 4 && player.rooms > size && availability[id])
    const canBuildRoom =
      size < 4 &&
      player.rooms <= size &&
      player.resources.wood >= 5 &&
      player.resources.reed >= 2 &&
      availability['farm-expansion']
    const deficits = size < 4 && player.rooms <= size
      ? [
          { id: 'forest', value: Math.max(0, 5 - player.resources.wood) / 5 },
          { id: 'reed-bank', value: Math.max(0, 2 - player.resources.reed) / 2 },
        ].sort((left, right) => right.value - left.value)
      : []
    const neededResource = deficits.find(({ id, value }) =>
      value > 0 && availability[id]
    )?.id
    const actionId = growthAction ??
      (canBuildRoom ? 'farm-expansion' : undefined) ??
      neededResource ??
      availableBenchmarkAction(session)
    if (!actionId) {
      throw new Error(`no safe action for player ${playerIndex} at round ${session.state.round}`)
    }
    accepted(session.takeAction(playerIndex, actionId))
  }

  if (!session.state.gameOver) throw new Error('representative game did not finish')
  const eligible = candidates.filter(
    (candidate) => trajectorySteps - candidate.stepNo >= requiredCommands,
  )
  if (eligible.length === 0) {
    throw new Error(`no representative state has ${requiredCommands} remaining commands`)
  }
  const selected = eligible.reduce((best, candidate) =>
    Math.abs(candidate.bytes - targetBytes) < Math.abs(best.bytes - targetBytes)
      ? candidate
      : best
  )
  return {
    state: selected.state,
    trajectorySteps,
    candidateFrames: candidates.length,
    remainingCommands: trajectorySteps - selected.stepNo,
  }
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

const executeBenchmarkCommand = (
  room: Room,
): {
  resp: SessionResponse
  actorPlayerIndex: number
  commandType: string
} => {
  const before = room.session.getState()
  if (before.interaction.stateId === 'wait') {
    return resolveBenchmarkWait(room.session, before.interaction)
  }
  if (before.interaction.stateId !== 'idle') {
    throw new Error(`benchmark room is ${before.interaction.stateId}`)
  }
  const actorPlayerIndex = room.session.state.currentPlayerIndex
  const actionId = availableBenchmarkAction(room.session)
  if (!actionId) {
    const player = room.session.state.players[actorPlayerIndex]!
    throw new Error(
      `no benchmark action at round ${room.session.state.round}, player ${actorPlayerIndex}, workers ${workersAvailable(room.session.state, player)}`,
    )
  }
  const resp = room.session.takeAction(actorPlayerIndex, actionId)
  return { resp, actorPlayerIndex, commandType: 'takeAction' }
}

const mutateAndBroadcast = (
  room: Room,
  broadcaster: Broadcaster,
  checkpoint: ReturnType<typeof createRoomPersistenceCheckpoint>,
  replay: ReplayArchiveProbe | null,
): string | null => {
  try {
    const { resp, actorPlayerIndex, commandType } = executeBenchmarkCommand(room)
    if (!resp.ok) return resp.error ?? 'response ok=false'
    replay?.recordStep(room, actorPlayerIndex, commandType)
    broadcaster.broadcastState(room, resp, 'action')
    if (replay) checkpoint.cancelRoom(room.id)
    return null
  } catch (err) {
    return err instanceof Error ? err.message : String(err)
  }
}

const runSteady = async (
  rooms: Room[],
  broadcaster: Broadcaster,
  checkpoint: ReturnType<typeof createRoomPersistenceCheckpoint>,
  replay: ReplayArchiveProbe | null,
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
    const error = mutateAndBroadcast(
      rooms[actions % rooms.length]!,
      broadcaster,
      checkpoint,
      replay,
    )
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
  checkpoint: ReturnType<typeof createRoomPersistenceCheckpoint>,
  replay: ReplayArchiveProbe | null,
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
    mutateAndBroadcast(room, broadcaster, checkpoint, replay)
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
  replay: ReplayArchiveProbe | null
  db: Database.Database
  dbPath: string
  config: Config
}): Promise<LevelResult> => {
  const { rooms, broadcaster, persistence, checkpoint, replay, db, dbPath, config } = args
  await runSteady(
    rooms,
    broadcaster,
    checkpoint,
    replay,
    config.warmupSeconds,
    config.actionsPerRoomSecond,
  )
  persistence.reset()
  replay?.resetMetrics()
  const dbStartBytes = sizeOf(dbPath)
  const walStartBytes = sizeOf(`${dbPath}-wal`)
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
    checkpoint,
    replay,
    config.durationSeconds,
    config.actionsPerRoomSecond,
    latencies,
  )
  const burstStart = performance.now()
  const burstErrors = new Set<string>()
  for (const room of rooms) {
    const error = mutateAndBroadcast(room, broadcaster, checkpoint, replay)
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
  const replayMetrics = replay?.metrics() ?? null
  const costProfile = profileCosts(
    rooms[0]!,
    broadcaster,
    checkpoint,
    replay,
    persistence,
    db,
  )
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
    dbGrowthBytes: dbBytes - dbStartBytes,
    walGrowthBytes: walBytes - walStartBytes,
    costProfile,
    replay: replayMetrics,
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
  stateFixture: StateFixture,
  levels: LevelResult[],
): string => {
  const title = config.label === 'baseline'
    ? 'Baseline'
    : config.label === 'after'
      ? 'After'
      : 'Replay'
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
    return `| ${level.roomCount} | ${level.actions} | ${formatMs(level.actionP50Ms)} | ${formatMs(level.actionP95Ms)} | ${formatMs(level.actionP99Ms)} | ${formatMs(level.eventLoopP50Ms)} | ${formatMs(level.eventLoopP95Ms)} | ${formatMs(level.eventLoopP99Ms)} | ${formatMs(level.burstMs)} | ${formatBytes(level.rssPeakBytes)} | ${incrementalRss} | ${level.cpuPercent.toFixed(0)}% | ${formatBytes(level.dbBytes)} | ${formatBytes(level.walBytes)} | ${formatBytes(level.dbGrowthBytes)} | ${formatBytes(level.walGrowthBytes)} | ${level.passed ? 'PASS' : `FAIL: ${level.failures.join(', ')}`} |`
  },
  ).join('\n')
  const profiles = levels.map((level) =>
    `| ${level.roomCount} | ${level.costProfile.totalActionMs.toFixed(3)} | ${level.costProfile.persistenceStateMs.toFixed(3)} | ${level.costProfile.viewerEnvelopeMs.toFixed(3)} | ${level.costProfile.adapterSaveMs.toFixed(3)} | ${level.costProfile.rawSqliteWriteMs.toFixed(3)} |`,
  ).join('\n')
  const replayRows = levels
    .filter((level): level is LevelResult & { replay: ReplayMetrics } => level.replay !== null)
    .map((level) => {
      const replay = level.replay
      return `| ${level.roomCount} | ${replay.writes} | ${replay.checkpoints} | ${replay.deltas} | ${(replay.payloadBytes / Math.max(1, replay.writes) / 1024).toFixed(2)} | ${replay.archiveP50Ms.toFixed(3)} | ${replay.archiveP95Ms.toFixed(3)} | ${replay.archiveP99Ms.toFixed(3)} | ${replay.archiveMaxMs.toFixed(3)} | ${replay.sqliteP99Ms.toFixed(3)} | ${replay.sqliteMaxMs.toFixed(3)} | ${replay.sqliteTailPauses} |`
    })
    .join('\n')
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
- WAL auto-checkpoint: ${environment.walAutoCheckpointPages} pages
- Serialized state: ${(stateBytes / 1024).toFixed(1)} KiB
- State fixture: deterministic played session (seed 563, ${stateFixture.trajectorySteps} accepted commands, ${stateFixture.candidateFrames} action-ready frames, ${stateFixture.remainingCommands} commands remaining)
- Exact invocation: ${environment.invocation}

## Workload

- Active two-player rooms with two open WebSocket seats
- Late-game state; production viewer envelopes and persistence checkpoint path
- Replay archive: ${config.replayArchive ? 'bounded authoritative state delta chain with atomic Room snapshot + Replay Step writes' : 'disabled'}
- In-process socket sink; network transport latency is excluded
- Levels: ${config.levels.join(', ')}
- Warmup per level: ${config.warmupSeconds}s
- Measurement per level: ${config.durationSeconds}s
- Steady action rate: ${config.actionsPerRoomSecond} actions/room/s
- Burst: one synchronized action per room
- Thresholds: steady action p99 <= ${thresholds.actionP99Ms}ms, event-loop p99 <= ${thresholds.eventLoopP99Ms}ms, RSS <= ${formatBytes(thresholds.rssBytes)}
- Approx. incremental RSS / room is the peak-RSS slope from the preceding ramp level; it is unavailable at the first level.

## Capacity

| Rooms | Actions (steady + burst) | Steady action p50 ms | Steady action p95 ms | Steady action p99 ms | Event-loop p50 ms | Event-loop p95 ms | Event-loop p99 ms | Burst ms | Peak RSS | Approx. incremental RSS / room | CPU | DB | WAL | DB growth | WAL growth | Result |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | :--- |
${rows}

${config.replayArchive ? `## Replay archive writes

| Rooms | Writes | Checkpoints | Deltas | Avg. gzip payload KiB | Archive p50 ms | Archive p95 ms | Archive p99 ms | Archive max ms | SQLite tx p99 ms | SQLite tx max ms | SQLite tx >= 100ms |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${replayRows}

Transactions at or above 100ms are reported as WAL auto-checkpoint tail candidates; the probe does not claim every such pause was caused by checkpointing.

` : ''}## Cost attribution

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
  stateFixture: Omit<StateFixture, 'state'>
  levels: LevelResult[]
}> => {
  const limits = readCgroupLimits()
  assertResourceLimits(limits, config.allowUnconstrained)
  const tempDir = mkdtempSync(join(process.env.TMPDIR ?? '/tmp', 'oa-room-capacity-'))
  const dbPath = join(tempDir, 'capacity.db')
  const db = new Database(dbPath)
  try {
    createSchema(db)
    if (config.replayArchive) createReplaySchema(db)
    const sqlite = new SqliteRoomPersistence(db)
    const persistence = new TimedPersistence(sqlite)
    const checkpoint = createRoomPersistenceCheckpoint({ persistence })
    const broadcaster = new Broadcaster({ checkpoint })
    const replay = config.replayArchive ? new ReplayArchiveProbe(db) : null
    const requiredCommands = config.levels.length * (
      Math.ceil(config.warmupSeconds * config.actionsPerRoomSecond) +
      Math.ceil(config.durationSeconds * config.actionsPerRoomSecond) +
      11
    )
    const stateFixture = createStateFixture(config.targetStateBytes, requiredCommands)
    const baseState = stateFixture.state
    const stateBytes = Buffer.byteLength(JSON.stringify(baseState))
    const rooms: Room[] = []
    const levels: LevelResult[] = []
    for (const level of config.levels) {
      while (rooms.length < level) {
        const roomIndex = rooms.length
        const room = addRoom(roomIndex, baseState, db, checkpoint)
        rooms.push(room)
        replay?.recordInitial(room)
      }
      const result = await runLevel({
        rooms,
        broadcaster,
        persistence,
        checkpoint,
        replay,
        db,
        dbPath,
        config,
      })
      levels.push(result)
      if (!result.passed && !config.smoke) break
    }
    checkpoint.shutdown()
    const environment: Environment = {
      commit: process.env.ROOM_CAPACITY_COMMIT ??
        execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
      node: process.version,
      cpuModel: cpus()[0]?.model ?? 'unknown',
      ...limits,
      sqlite: (db.prepare('SELECT sqlite_version() AS version').get() as { version: string }).version,
      journalMode: String(db.pragma('journal_mode', { simple: true })),
      synchronous: Number(db.pragma('synchronous', { simple: true })),
      walAutoCheckpointPages: Number(db.pragma('wal_autocheckpoint', { simple: true })),
      invocation: process.env.ROOM_CAPACITY_INVOCATION ??
        `pnpm exec tsx scripts/bench/room-capacity.ts ${process.argv.slice(2).join(' ')}`,
    }
    mkdirSync(dirname(config.reportPath), { recursive: true })
    writeFileSync(
      config.reportPath,
      renderReport(config, environment, stateBytes, stateFixture, levels),
    )
    return {
      config,
      environment,
      stateBytes,
      stateFixture: {
        trajectorySteps: stateFixture.trajectorySteps,
        candidateFrames: stateFixture.candidateFrames,
        remainingCommands: stateFixture.remainingCommands,
      },
      levels,
    }
  } finally {
    db.close()
    rmSync(tempDir, { recursive: true, force: true })
  }
}

if (process.argv[1]?.endsWith('room-capacity.ts')) {
  const summary = await runRoomCapacityProbe(parseRoomCapacityArgs(process.argv.slice(2)))
  process.stdout.write(`${JSON.stringify(summary)}\n`)
}
