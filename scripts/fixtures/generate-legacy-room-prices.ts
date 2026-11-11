import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { execFileSync } from 'node:child_process'
import { dirname } from 'node:path'
import { createWorkSession } from '../../server/__tests__/_helpers/session-fixtures.ts'
import { serializeSessionSnapshot } from '../../shared/session/serialization.ts'
import type { GameSession, SessionResponse } from '../../server/game/authoritative-session.ts'

assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), 'f4a112409241c973c501723a6c6ac8b8537b8c85', 'Generate from the pinned predecessor checkout')

const options = (response: SessionResponse) => response.interaction.stateId === 'wait' && response.interaction.request.kind === 'choice' ? response.interaction.request.options : []
function setup(kind: 'own' | 'payment' | 'free') {
  return createWorkSession({ seed: 1636, options: {
    playerCount: 2,
  }, configure(state) {
    const player = state.players[0]!
    Object.assign(player.resources, { wood: 0, clay: 0, stone: 0, reed: 0, food: 0 })
    player.minorPlayed = kind === 'own' ? ['B013_CarpentersParlor'] : kind === 'free' ? [] : ['D015_ClaySupports']
    player.occupationPlayed = kind === 'free' ? ['C087_Mason', 'B126_Carpenter'] : ['B126_Carpenter']
    if (kind === 'own') Object.assign(player.resources, { wood: 4, reed: 4 })
    if (kind === 'payment') { player.houseType = 'clay'; Object.assign(player.resources, { wood: 1, clay: 5, reed: 2 }) }
    if (kind === 'free') {
      player.houseType = 'stone'; player.rooms = 4
      player.roomTiles = [{ row: 1, col: 0 }, { row: 2, col: 0 }, { row: 1, col: 1 }, { row: 2, col: 1 }]
      player.cardStates.C087_Mason = { extraData: { hasRoom: true } }
    }
  } })
}
function open(session: GameSession) {
  let response = session.takeAction(0, 'farm-expansion')
  assert.ok(response.ok, response.error)
  const branch = options(response).find(option => option.labelKey === 'actions.construct.name')
  if (branch) response = session.resolveChoice(0, branch.value)
  assert.ok(response.interaction.stateId === 'wait' && response.interaction.request.kind === 'farm-select')
  return response
}
const cases: Record<string, unknown> = {}
for (const kind of ['own', 'payment', 'free', 'settled'] as const) {
  const session = setup(kind === 'settled' ? 'own' : kind)
  try {
    let response = kind === 'free' ? session.takeAnytimeAction(0, 'C87-mason-anytime') : open(session)
    assert.ok(response.ok, response.error)
    if (kind === 'payment' || kind === 'settled') {
      response = session.commitSelectionChoice(0, { rooms: [{ row: 1, col: 1 }] })
      assert.ok(response.ok, response.error)
    }
    if (kind === 'settled') {
      const done = options(response).find(option => option.value === '__done__' || option.value === '__skip__')
      if (done) response = session.resolveChoice(0, done.value)
      assert.ok(response.interaction.stateId === 'wait' && response.interaction.request.kind === 'confirm-next-player')
    }
    if (kind === 'payment') assert.equal(response.interaction.promptKey, 'prompt.selectPayment')
    cases[kind] = {
      snapshot: session.withCtx(() => serializeSessionSnapshot(session.state, session)),
      interaction: response.interaction,
    }
  } finally { session.dispose() }
}
const target = process.argv[2]
assert.ok(target)
mkdirSync(dirname(target), { recursive: true })
writeFileSync(target, gzipSync(`${JSON.stringify({ producer: 'f4a112409241c973c501723a6c6ac8b8537b8c85', seed: 1636, cases })}\n`))
process.stdout.write(`${target}: ${Object.keys(cases).join(', ')}\n`)
