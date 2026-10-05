import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'
import Database from 'better-sqlite3'
import type { WebSocket } from 'ws'
import '../../shared/cards/register-all.ts'
import { rehydrateState, serializeSessionSnapshot, type PersistedSessionSnapshot } from '../../shared/session/serialization.ts'
import { GameSession, type SessionResponse } from '../../server/game/authoritative-session.ts'
import { SqliteRoomPersistence } from '../../server/game/persistence/sqlite-adapter.ts'
import { RoomCommitter } from '../../server/game/room-committer.ts'
import { Broadcaster } from '../../server/connection/broadcaster.ts'
import { createRoomPersistenceCheckpoint } from '../../server/game/room-persistence-checkpoint.ts'
import type { Room } from '../../server/game/room.ts'
import { runMigrations } from '../../server/db.ts'
import { readCgroupLimits, assertResourceLimits } from './room-capacity.ts'

type Command =
  | { type: 'action'; actor: number; actionId: string }
  | { type: 'choice'; actor: number; value: string; payload?: Record<string, unknown> }
  | { type: 'selection'; actor: number; payload: Parameters<GameSession['commitSelectionChoice']>[1] }
  | { type: 'undoStep' | 'undoAction'; actor: number }
  | { type: 'restart'; actor: number }

export type RoomWorkload = {
  seed: number
  players: number
  preparation: string
  initial: PersistedSessionSnapshot
  commands: Command[]
}

export const executeWorkloadCommand = (session: GameSession, command: Exclude<Command, { type: 'restart' }>): SessionResponse => {
  switch (command.type) {
    case 'action': return session.takeAction(command.actor, command.actionId)
    case 'choice': return session.resolveChoice(command.actor, command.value, command.payload)
    case 'selection': return session.commitSelectionChoice(command.actor, command.payload)
    case 'undoStep': return session.undoStep()
    case 'undoAction': return session.undoAction()
  }
}

const selectCommand = (session: GameSession, response: SessionResponse): Command => {
  if (response.interaction.stateId === 'wait') {
    const { playerIndex: actor, request } = response.interaction
    if (request.kind === 'confirm-next-player') return { type: 'choice', actor: request.nextPlayerIndex, value: 'confirm' }
    if (request.kind === 'confirm-player-switch') return { type: 'choice', actor: request.toPlayerIndex, value: 'confirm' }
    if (request.kind === 'feed') return { type: 'choice', actor, value: 'confirm', payload: { selections: [] } }
    if (request.kind === 'choice') {
      const choice = request.options.find(option => option.value === '__skip__') ??
        request.options.find(option => option.value === '__done__') ?? request.options[0]
      if (!choice) throw new Error('empty benchmark choice')
      return { type: 'choice', actor, value: choice.value }
    }
    if (request.kind === 'farm-select') {
      const farm = request.farm
      if (farm.farmType === 'plow') return { type: 'selection', actor, payload: { tile: farm.selectableTiles[0] } }
      if (farm.farmType === 'room') {
        const tile = farm.selectableTiles.find(candidate => session.state.players[actor]!.roomTiles.some(
          room => Math.abs(room.row - candidate.row) + Math.abs(room.col - candidate.col) === 1,
        ))
        if (!tile) throw new Error('no adjacent benchmark room tile')
        return { type: 'selection', actor, payload: { rooms: [tile] } }
      }
      if (farm.farmType === 'stable') return { type: 'selection', actor, payload: { stables: farm.selectableTiles.slice(0, 1) } }
      if (farm.farmType === 'fence') {
        for (let row = 0; row < 3; row++) for (let col = 0; col < 5; col++) {
          const edges = [`H-${row}-${col}`, `H-${row + 1}-${col}`, `V-${row}-${col}`, `V-${row}-${col + 1}`]
          const player = session.state.players[actor]!
          const occupied = [...player.roomTiles, ...player.fields]
            .some(tile => tile.row === row && tile.col === col)
          if (!occupied && edges.every(edge => farm.selectableEdges.includes(edge))) {
            return { type: 'selection', actor, payload: { edges, extraWood: 0 } }
          }
        }
      }
    }
    throw new Error(`unhandled benchmark interaction ${request.kind}`)
  }
  const actor = session.state.currentPlayerIndex
  const player = session.state.players[actor]!
  const availability = session.getActionAvailability(actor)
  const preferred = [
    ...(player.fields.length < 3 ? ['farmland'] : []),
    ...(player.fenceSegments.length === 0 && player.resources.wood >= 4 ? ['fencing'] : []),
    ...(player.rooms < 3 && player.resources.wood >= 5 && player.resources.reed >= 2 ? ['farm-expansion'] : []),
    'forest', 'copse', 'grove', 'reed-bank', 'fishing', 'traveling-players', 'day-laborer', 'clay-pit', 'hollow-4', 'grain-seeds', 'western-quarry', 'vegetable-seeds', 'eastern-quarry',
  ]
  const actionId = preferred.find(id => availability[id])
  if (!actionId) throw new Error(`no benchmark action at round ${session.state.round}: ${Object.keys(availability).filter(id => availability[id]).join(', ')}`)
  return { type: 'action', actor, actionId }
}

export const recordRoomWorkload = (players: number): RoomWorkload => {
  let session = new GameSession(563, undefined, { playerCount: players })
  // Explicit stress preparation; the recorded commands themselves follow real rules.
  const state = session.getState().state
  for (const player of state.players) {
    player.minorHand = ['A075_LumberMill']
    player.occupationHand = ['__test_placeholder__']
    player.occupationPlayed = ['B126_Carpenter', 'C122_Bricklayer', 'D154_ChimneySweep']
    player.resources = { ...player.resources, wood: 40, reed: 20, clay: 20, stone: 20, food: 100 }
  }
  session.loadState(state)
  const initial = serializeSessionSnapshot(session.state, session)
  const commands: Command[] = []
  let response = session.getState()
  const undone = new Set<number>()
  let restarted = false
  while (!session.state.gameOver && commands.length < 700) {
    let command = selectCommand(session, response)
    if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'farm-select' &&
      !undone.has(session.state.round)) {
      const round = session.state.round
      undone.add(round)
      const undo: Command = { type: round % 2 === 0 ? 'undoAction' : 'undoStep', actor: response.interaction.playerIndex }
      const next = executeWorkloadCommand(session, undo)
      if (!next.ok) throw new Error(`benchmark undo rejected: ${next.error}`)
      commands.push(undo)
      response = next
      continue
    }
    if (!restarted && session.state.round >= 10) {
      restarted = true
      commands.push({ type: 'restart', actor: command.actor })
      session = new GameSession(rehydrateState(serializeSessionSnapshot(session.state, session)))
      response = session.getState()
      command = selectCommand(session, response)
    }
    if (command.type === 'restart') throw new Error('unexpected recorder restart')
    response = executeWorkloadCommand(session, command)
    if (!response.ok) throw new Error(`benchmark command rejected: ${JSON.stringify(command)}: ${response.error}`)
    commands.push(command)
  }
  if (!session.state.gameOver) throw new Error('benchmark transcript did not finish')
  return { seed: 563, players, preparation: 'Explicit hands, three cost occupations, resources wood40/reed20/clay20/stone20/food100 per player; all following commands obey rules.', initial, commands }
}

const percentile = (values: number[], quantile: number): number => {
  const sorted = values.toSorted((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * quantile) - 1)] ?? 0
}

export const runRoomWorkload = (workload: RoomWorkload, options: {
  onPacket?: (packet: { commandIndex: number; playerIndex: number; data: string }) => void
  nameMode?: 'matched' | 'override'
} = {}) => {
  const dir = mkdtempSync(join(tmpdir(), 'oa-room-performance-'))
  const dbPath = join(dir, 'probe.db')
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
  const persistence = new SqliteRoomPersistence(db)
  const makeCommitter = () => new RoomCommitter({ persistence, enabled: true, viewerBuildId: 'probe', gameBuildId: 'probe', viewerBuildExists: () => true })
  let committer = makeCommitter()
  const checkpoint = createRoomPersistenceCheckpoint({ persistence })
  const broadcaster = new Broadcaster({ checkpoint })
  const insertUser = db.prepare("INSERT INTO users (id,username,display_name,password_hash,created_at) VALUES (?,?,?,'probe',1)")
  for (let index = 0; index < workload.players; index++) insertUser.run(`u${index}`, `u${index}`, `P${index}`)
  let commandIndex = -1
  let sentPackets = 0
  const room: Room = {
    id: 'probe', session: new GameSession(rehydrateState(structuredClone(workload.initial))),
    players: Array.from({ length: workload.players }, (_, playerIndex) => ({
      playerIndex,
      name: options.nameMode === 'matched' ? workload.initial.state.players[playerIndex]!.name : `P${playerIndex}`,
      userId: `u${playerIndex}`,
      ws: { OPEN: 1, readyState: 1, send: (data: string) => {
        sentPackets += 1
        options.onPacket?.({ commandIndex, playerIndex, data })
      } } as unknown as WebSocket,
    })),
    maxPlayers: workload.players, status: 'playing', version: 0, startedAt: 1, createdBy: 'u0',
  }
  const start = committer.prepareRoom(room, { missingPrefix: false })
  if (start.kind === 'blocked') throw new Error(start.error)
  const latencies: number[] = []
  const ruleSamples: number[] = []
  const classifications: string[] = []
  const hashes: string[] = []
  const commandSamples: Array<{ commandIndex: number; roundBefore: number; roundAfter: number; type: Command['type']; classification: string; sentPackets: number; elapsedMs: number }> = []
  let snapshotBytes = 0
  const ioBefore = readFileSync('/proc/self/io', 'utf8')
  const cpuBefore = process.cpuUsage()
  if (process.env.ROOM_PERFORMANCE_TRACE === '1') process.stderr.write(`OA_TRACE_BEGIN ${workload.players}\n`)
  const begin = performance.now()
  try {
    for (const [index, command] of workload.commands.entries()) {
      commandIndex = index
      if (command.type === 'restart') {
        committer.shutdown()
        const saved = persistence.load(room.id)?.serialized
        if (!saved) throw new Error('benchmark restart lost snapshot')
        room.session.dispose()
        room.session = new GameSession(rehydrateState(saved))
        committer = makeCommitter()
        const restored = committer.prepareRoom(room, { missingPrefix: false })
        if (restored.kind === 'blocked') throw new Error(restored.error)
        continue
      }
      const roundBefore = room.session.state.round
      const packetsBefore = sentPackets
      const started = performance.now()
      const response = executeWorkloadCommand(room.session, command)
      ruleSamples.push(performance.now() - started)
      if (!response.ok) throw new Error(`fixed transcript rejected ${JSON.stringify(command)}: ${response.error}`)
      const result = committer.commit(room, response, { commandType: command.type, intentJson: JSON.stringify(command) }, command.actor)
      classifications.push(result.kind)
      if (result.kind === 'blocked') throw new Error(result.error)
      if (result.kind === 'committed') {
        hashes.push(result.frameHash)
        // The same harness runs old and new implementations. Old committed
        // results have no prepared state; newer ones publish that exact value.
        if ('serializedState' in result) {
          Reflect.apply(broadcaster.broadcastCommitted, broadcaster, [room, response, 'action', undefined, undefined, result.serializedState])
        } else broadcaster.broadcastCommitted(room, response, 'action')
      }
      const elapsedMs = performance.now() - started
      latencies.push(elapsedMs)
      commandSamples.push({ commandIndex, roundBefore, roundAfter: room.session.state.round, type: command.type, classification: result.kind, sentPackets: sentPackets - packetsBefore, elapsedMs })
      if (process.env.ROOM_PERFORMANCE_MEASURE_BYTES === '1') {
        snapshotBytes += Buffer.byteLength(JSON.stringify(serializeSessionSnapshot(room.session.state, room.session)))
      }
    }
    const elapsedMs = performance.now() - begin
    const cpu = process.cpuUsage(cpuBefore)
    if (process.env.ROOM_PERFORMANCE_TRACE === '1') process.stderr.write(`OA_TRACE_END ${workload.players}\n`)
    const ioAfter = readFileSync('/proc/self/io', 'utf8')
    const wchar = (raw: string) => Number(raw.match(/^wchar: (\d+)$/m)?.[1] ?? 0)
    return {
      players: workload.players, commands: workload.commands.length, elapsedMs,
      cpuMs: (cpu.user + cpu.system) / 1000, ruleMs: ruleSamples.reduce((a, b) => a + b, 0),
      latencyP50Ms: percentile(latencies, 0.5), latencyP95Ms: percentile(latencies, 0.95), latencyP99Ms: percentile(latencies, 0.99),
      logicalSnapshotBytes: process.env.ROOM_PERFORMANCE_MEASURE_BYTES === '1' ? snapshotBytes : null,
      processWrittenBytes: wchar(ioAfter) - wchar(ioBefore),
      rssBytes: process.memoryUsage().rss, hashes, classifications, commandSamples,
    }
  } finally {
    committer.shutdown()
    checkpoint.shutdown()
    room.session.dispose()
    db.close()
    if (!process.env.ROOM_PERFORMANCE_KEEP_DB) rmSync(dir, { recursive: true, force: true })
  }
}

if (process.argv[1]?.endsWith('room-performance.ts')) {
  const [mode, path] = process.argv.slice(2)
  if (!path) throw new Error('usage: room-performance.ts record|run <directory>')
  mkdirSync(path, { recursive: true })
  if (mode === 'record') {
    for (const players of [2, 4]) {
      const workload = recordRoomWorkload(players)
      writeFileSync(join(path, `${players}p.json`), JSON.stringify(workload) + '\n')
      process.stdout.write(`Recorded ${players}p: ${workload.commands.length} commands\n`)
    }
  } else if (mode === 'run') {
    const limits = readCgroupLimits()
    assertResourceLimits(limits, process.argv.includes('--allow-unconstrained'))
    const results = [2, 4].map(players => runRoomWorkload(JSON.parse(readFileSync(join(path, `${players}p.json`), 'utf8')) as RoomWorkload))
    const report = JSON.stringify({ node: process.version, ...limits, commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), results }) + '\n'
    const output = process.argv[4]
    if (output && !output.startsWith('--')) {
      writeFileSync(output, report)
      process.stdout.write(`Saved measurement: ${output}\n`)
    } else process.stdout.write(report)
  } else throw new Error('unknown mode')
}
