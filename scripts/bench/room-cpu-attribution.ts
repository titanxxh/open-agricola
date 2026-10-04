import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { GameSession } from '../../server/game/authoritative-session.ts'
import { RoomCommitter } from '../../server/game/room-committer.ts'
import { Broadcaster } from '../../server/connection/broadcaster.ts'
import { assertResourceLimits, readCgroupLimits } from './room-capacity.ts'
import { runRoomWorkload, type RoomWorkload } from './room-performance.ts'

type Phase = 'rules' | 'commit' | 'broadcast'
const cpuMs = { rules: 0, commit: 0, broadcast: 0 }
const calls = { rules: 0, commit: 0, broadcast: 0 }
let depth = 0

// A separate diagnostic run: instrumentation never changes the frozen timing harness.
// process.cpuUsage includes CPU used by all process threads during each synchronous call.
const measure = <This, Args extends unknown[], Result>(
  original: (this: This, ...args: Args) => Result, phase: Phase,
): (this: This, ...args: Args) => Result => function (this: This, ...args: Args): Result {
  if (depth > 0) return original.apply(this, args)
  depth++
  const before = process.cpuUsage()
  try { return original.apply(this, args) } finally {
    const cpu = process.cpuUsage(before)
    cpuMs[phase] += (cpu.user + cpu.system) / 1000
    calls[phase]++
    depth--
  }
}

GameSession.prototype.takeAction = measure(GameSession.prototype.takeAction, 'rules')
GameSession.prototype.resolveChoice = measure(GameSession.prototype.resolveChoice, 'rules')
GameSession.prototype.commitSelectionChoice = measure(GameSession.prototype.commitSelectionChoice, 'rules')
GameSession.prototype.undoStep = measure(GameSession.prototype.undoStep, 'rules')
GameSession.prototype.undoAction = measure(GameSession.prototype.undoAction, 'rules')
RoomCommitter.prototype.commit = measure(RoomCommitter.prototype.commit, 'commit')
Broadcaster.prototype.broadcastCommitted = measure(Broadcaster.prototype.broadcastCommitted, 'broadcast')

const [fixtures, output] = process.argv.slice(2)
if (!fixtures || !output) throw new Error('usage: room-cpu-attribution.ts <fixture directory> <report.json>')
const limits = readCgroupLimits()
assertResourceLimits(limits, process.argv.includes('--allow-unconstrained'))
const results = [2, 4].map(players => {
  for (const phase of ['rules', 'commit', 'broadcast'] as const) { cpuMs[phase] = 0; calls[phase] = 0 }
  const result = runRoomWorkload(JSON.parse(readFileSync(join(fixtures, `${players}p.json`), 'utf8')) as RoomWorkload)
  const attributedCpuMs = Object.values(cpuMs).reduce((sum, value) => sum + value, 0)
  return {
    players, commands: result.commands, totalCpuMs: result.cpuMs,
    phaseCpuMs: { ...cpuMs }, phaseCalls: { ...calls },
    otherCpuMs: result.cpuMs - attributedCpuMs,
    hashes: result.hashes, classifications: result.classifications,
  }
})
writeFileSync(output, JSON.stringify({
  node: process.version, ...limits,
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  measurement: 'Separate instrumented synchronous entry-point CPU attribution; not an acceptance latency run. Other includes restart/recovery and loop overhead.',
  results,
}) + '\n')
process.stdout.write(`Saved CPU attribution: ${output}\n`)
