import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { gzipSync } from 'node:zlib'
import { createGardenDesignerScoringSession } from '../../server/__tests__/_helpers/garden-designer.ts'
import { serializeSessionSnapshot } from '../../shared/session/serialization.ts'

const producer = 'cabe56980e1a587a2b62efadf0413910acbd974f'
assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), producer,
  'Generate from the pinned predecessor checkout')
assert.equal(execFileSync('git', ['diff', producer, '--', 'shared', 'server/game'], { encoding: 'utf8' }).trim(), '',
  'Generate with unchanged predecessor rules and engine')
const session = createGardenDesignerScoringSession()
try {
  const interaction = session.getState().interaction
  assert.ok(interaction.stateId === 'wait' && interaction.request.kind === 'choice')
  assert.equal(interaction.request.options.length, 10)
  const pending = session.withCtx(() => serializeSessionSnapshot(session.state, session))
  const result = session.resolveChoice(0, 'C099_GardenDesigner:food:9:score:5')
  assert.ok(result.ok, result.error)
  assert.equal(result.state.gameOver, true)
  assert.equal(result.state.players[0]!.resources.food, 1)
  const settled = session.withCtx(() => serializeSessionSnapshot(session.state, session))
  const target = process.argv[2]
  assert.ok(target, 'Pass the output .json.gz path')
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, gzipSync(`${JSON.stringify({ producer, pending, settled })}\n`))
  process.stdout.write(`${target}: pending and settled\n`)
} finally { session.dispose() }
