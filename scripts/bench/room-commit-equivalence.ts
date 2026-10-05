import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PostgresRoomPersistence } from '../../server/game/persistence/postgres-adapter.ts'
import { canonicalJson, decodeReplayFrame, type JsonValue } from '../../server/game/replay-codec.ts'
import { runRoomWorkload, type RoomWorkload } from './room-performance.ts'

const [fixtures, output] = process.argv.slice(2)
if (!fixtures || !output) throw new Error('usage: room-commit-equivalence.ts <fixtures> <output.jsonl>')

// Separate correctness run: full logical values never enter acceptance timing.
writeFileSync(output, '')
let players = 0
let previous: JsonValue | null = null
const commitReplay = PostgresRoomPersistence.prototype.commitReplay
PostgresRoomPersistence.prototype.commitReplay = async function (commit) {
  const result = await commitReplay.call(this, commit)
  if (result.kind === 'conflict') throw new Error(result.error)
  previous = decodeReplayFrame(previous, commit.step)
  appendFileSync(output, `${JSON.stringify({
    players,
    stepNo: commit.step.stepNo,
    roomVersion: commit.step.roomVersion,
    checkpointStepNo: commit.step.checkpointStepNo,
    payloadKind: commit.step.payloadKind,
    frameHash: commit.step.frameHash,
    canonicalFrame: canonicalJson(previous),
    canonicalCursor: canonicalJson(commit.serialized.sessionCursor),
  })}\n`)
  return result
}

for (players of [2, 4]) {
  previous = null
  const workload = JSON.parse(readFileSync(join(fixtures, `${players}p.json`), 'utf8')) as RoomWorkload
  const result = await runRoomWorkload(workload)
  appendFileSync(output, `${JSON.stringify({ players, commands: result.commands, classifications: result.classifications })}\n`)
}
process.stdout.write(`Saved exact Frame/cursor/Step trace: ${output}\n`)
