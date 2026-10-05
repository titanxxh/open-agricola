import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Broadcaster } from '../../server/connection/broadcaster.ts'
import { GameSession } from '../../server/game/authoritative-session.ts'
import { RoomCommitter } from '../../server/game/room-committer.ts'
import { PostgresRoomPersistence } from '../../server/game/persistence/postgres-adapter.ts'
import { canonicalJson, decodeReplayFrame, type JsonValue } from '../../server/game/replay-codec.ts'
import { assertResourceLimits, readCgroupLimits } from './resource-limits.ts'
import { runRoomWorkload, type RoomWorkload } from './room-performance.ts'

const [fixturePath, outputPath] = process.argv.slice(2)
if (!fixturePath || !outputPath) throw new Error('usage: broadcast-performance.ts <fixture.json> <output.json> [--exact trace.jsonl | --attribution] [--repeats 3] [--names matched|override]')
const flagValue = (flag: string, fallback: string) => {
  const index = process.argv.indexOf(flag)
  return index < 0 ? fallback : process.argv[index + 1]!
}
const tracePath = flagValue('--exact', '')
const nameMode = flagValue('--names', 'override')
assert.ok(nameMode === 'matched' || nameMode === 'override', '--names must be matched or override')
const attributed = process.argv.includes('--attribution')
const diagnostic = !!tracePath || attributed
const repeats = Number(flagValue('--repeats', diagnostic ? '1' : '3'))
const warmups = Number(flagValue('--warmups', diagnostic ? '0' : '1'))
assert.ok(Number.isSafeInteger(repeats) && repeats > 0)
assert.ok(Number.isSafeInteger(warmups) && warmups >= 0)
const limits = readCgroupLimits()
assertResourceLimits(limits, process.argv.includes('--allow-unconstrained'))
const fixtureText = readFileSync(fixturePath, 'utf8')
const workload = JSON.parse(fixtureText) as RoomWorkload
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')

type Phase = 'rules' | 'commit' | 'broadcast'
const phaseCpuMs = { rules: 0, commit: 0, broadcast: 0 }
const phaseCalls = { rules: 0, commit: 0, broadcast: 0 }
if (attributed) {
  let depth = 0
  const measure = <This, Args extends unknown[], Result>(original: (this: This, ...args: Args) => Result, phase: Phase) =>
    function (this: This, ...args: Args): Result {
      if (depth) return original.apply(this, args)
      depth += 1
      const before = process.cpuUsage()
      const finish = () => {
        const cpu = process.cpuUsage(before)
        phaseCpuMs[phase] += (cpu.user + cpu.system) / 1000
        phaseCalls[phase] += 1
        depth -= 1
      }
      try {
        const result = original.apply(this, args)
        if (result instanceof Promise) return result.finally(finish) as Result
        finish(); return result
      } catch (error) { finish(); throw error }
    }
  GameSession.prototype.takeAction = measure(GameSession.prototype.takeAction, 'rules')
  GameSession.prototype.resolveChoice = measure(GameSession.prototype.resolveChoice, 'rules')
  GameSession.prototype.commitSelectionChoice = measure(GameSession.prototype.commitSelectionChoice, 'rules')
  GameSession.prototype.undoStep = measure(GameSession.prototype.undoStep, 'rules')
  GameSession.prototype.undoAction = measure(GameSession.prototype.undoAction, 'rules')
  RoomCommitter.prototype.commit = measure(RoomCommitter.prototype.commit, 'commit')
  Broadcaster.prototype.broadcastCommitted = measure(Broadcaster.prototype.broadcastCommitted, 'broadcast')
}

let iteration = -1
if (tracePath) {
  // Only correctness runs replace nondeterministic transport/identity values.
  // Retain every identifier and reference; do not delete pagination identity.
  Date.now = () => 1_800_000_000_000
  let uuid = 0
  Object.defineProperty(globalThis.crypto, 'randomUUID', { configurable: true, value: () =>
    `00000000-0000-4000-8000-${(++uuid).toString(16).padStart(12, '0')}` })
  writeFileSync(tracePath, '')
  const commitReplay = PostgresRoomPersistence.prototype.commitReplay
  let previous: JsonValue | null = null
  PostgresRoomPersistence.prototype.commitReplay = async function (commit) {
    const result = await commitReplay.call(this, commit)
    if (result.kind === 'conflict') throw new Error(result.error)
    if (commit.step.stepNo === 0) previous = null
    previous = decodeReplayFrame(previous, commit.step)
    appendFileSync(tracePath, JSON.stringify({ kind: 'commit', iteration,
      stepNo: commit.step.stepNo, roomVersion: commit.step.roomVersion,
      checkpointStepNo: commit.step.checkpointStepNo, payloadKind: commit.step.payloadKind,
      frameHash: commit.step.frameHash, frame: canonicalJson(previous),
      cursor: canonicalJson(commit.serialized.sessionCursor),
    }) + '\n')
    return result
  }
}

for (let index = 0; index < warmups; index += 1) await runRoomWorkload(workload, { nameMode })
for (const phase of ['rules', 'commit', 'broadcast'] as const) { phaseCpuMs[phase] = 0; phaseCalls[phase] = 0 }
const runs = []
for (iteration = 0; iteration < repeats; iteration += 1) {
  const run = await runRoomWorkload(workload, { nameMode, ...(tracePath ? { onPacket: packet => {
    appendFileSync(tracePath, JSON.stringify({ kind: 'packet', iteration, commandIndex: packet.commandIndex,
      viewer: packet.playerIndex, envelope: canonicalJson(JSON.parse(packet.data)),
    }) + '\n')
  } } : {}) })
  assert.equal(run.commandSamples.length, workload.commands.filter(command => command.type !== 'restart').length)
  for (const sample of run.commandSamples) {
    assert.equal(sample.sentPackets, sample.classification === 'committed' ? workload.players : 0,
      `Command ${sample.commandIndex} did not publish to all seats after commit`)
  }
  if (tracePath) appendFileSync(tracePath, JSON.stringify({ kind: 'classification', iteration, values: run.classifications }) + '\n')
  runs.push(run)
}

const percentile = (values: number[], quantile: number) => {
  const sorted = values.toSorted((left, right) => left - right)
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * quantile) - 1)] ?? 0
}
const samples = runs.flatMap(run => run.commandSamples)
const summary = (selected: typeof samples) => {
  const broadcast = selected.filter(sample => sample.sentPackets > 0).map(sample => sample.elapsedMs)
  return { commands: selected.length, broadcasts: broadcast.length,
    p50Ms: percentile(broadcast, 0.5), p95Ms: percentile(broadcast, 0.95), p99Ms: percentile(broadcast, 0.99), maxMs: Math.max(0, ...broadcast),
    roundTransitions: selected.filter(sample => sample.roundBefore !== sample.roundAfter).length,
    byType: Object.fromEntries([...new Set(selected.map(sample => sample.type))].map(type => [type, selected.filter(sample => sample.type === type).length])),
  }
}
const sourceFiles = ['scripts/bench/room-performance.ts', 'scripts/bench/broadcast-performance.ts',
  'server/connection/broadcaster.ts', 'server/connection/envelope-builder.ts', 'server/connection/room-router.ts',
  'server/game/custom-session-executor.ts', 'server/game/custom-session-worker.ts', 'server/game/room-committer.ts',
  'server/game/authoritative-session.ts', 'server/connection/history-presentation.ts',
  'shared/session/sync-payload.ts', 'shared/session/session-core.ts', 'shared/session/history-window.ts',
  'shared/projections/serialized-state.ts', 'shared/projections/history-names.ts',
  'shared/projections/history-record-identity.ts']
writeFileSync(outputPath, JSON.stringify({
  node: process.version, ...limits, commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  fixture: resolve(fixturePath), fixtureSha256: sha256(fixtureText), preparation: workload.preparation,
  sourceSha256: Object.fromEntries(sourceFiles.map(path => [path, sha256(readFileSync(path, 'utf8'))])),
  mode: tracePath ? 'exact' : attributed ? 'attribution' : 'timing', nameMode, warmups, repeats,
  measurement: 'Server command entry through PostgreSQL durable commit (database service CPU excluded) and last synchronous four-seat socket sink send; excludes routing, queueing, network and client rendering. Per-round p99 near max with small n.',
  aggregate: { ...summary(samples), cpuMs: runs.reduce((total, run) => total + run.cpuMs, 0),
    rssBytes: Math.max(...runs.map(run => run.rssBytes)), processPeakRssBytes: process.resourceUsage().maxRSS * 1024,
    byRound: Object.fromEntries([...new Set(samples.map(sample => sample.roundBefore))].map(round => [round, summary(samples.filter(sample => sample.roundBefore === round))])),
  },
  ...(attributed ? { phaseCpuMs, phaseCalls } : {}),
  runs,
}, null, 2) + '\n')
console.log(`Saved ${tracePath ? 'exact comparison' : attributed ? 'CPU attribution' : 'timing'}: ${outputPath}`)
