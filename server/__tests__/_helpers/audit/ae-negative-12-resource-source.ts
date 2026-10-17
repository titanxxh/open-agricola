// Helpers of ae-negative-12-resource-source-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import fs from '../audit-evidence-fs'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import type { GameState } from '../../../../shared/contract/types'
import { createWorkSession } from '../session-fixtures'
import { confirmNext } from '../negative-rule-audit'

// Design: fresh two-player sessions, real collect/plow/round completion. The
// controlled starting round/pile values are not a natural opening-history claim.
export const PORT = 'A103_Portmonger', WOOD = 'A104_WoodHarvester', BARROW = 'A105_BarrowPusher'
export const sessions: GameSession[] = []
export const output = process.env.AGRICOLA_NEGATIVE_ARTIFACT_DIR ?? 'output/ae-negative/12-resource-source-probes'
export function save(id: string, value: unknown) { fs.mkdirSync(output, { recursive: true }); fs.writeFileSync(`${output}/${id}.json`, JSON.stringify(value, null, 2)) }
export function ok(response: SessionResponse) { assert.equal(response.ok, true, response.error); return response }
export function setup(card: string, configure: (state: GameState) => void = () => {}, played = true, round = 5) {
  const session = createWorkSession({ seed: 4242, configure(state) {
    state.round = round
    for (const player of state.players) Object.assign(player.resources, { food: 40, wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0 })
    state.players[0]!.occupationPlayed = played ? [card] : []
    state.players[0]!.occupationHand = played ? ['__test_placeholder__'] : [card]
    configure(state)
  } }); sessions.push(session); return session
}
export function ready(session: GameSession, actor: number) {
  let response = session.getState()
  if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'confirm-next-player') response = confirmNext(session, response)
  assert.equal(response.interaction.stateId, 'idle', JSON.stringify(response.interaction)); assert.equal(response.state.currentPlayerIndex, actor)
}
export function turn(session: GameSession, actor: number, space: string) { ready(session, actor); return ok(session.takeAction(actor, space)) }
export function plowTriggers(session: GameSession, response: SessionResponse, first = BARROW) {
  for (let n = 0; n < 8 && response.interaction.stateId === 'wait'; n++) {
    const request = response.interaction.request
    if (request.kind === 'select-trigger') {
      const option = request.options.find(o => o.value === first) ?? request.options[0]
      assert.ok(option); response = ok(session.resolveChoice(0, option.value))
    } else if (request.kind === 'choice') {
      const option = request.options.find(o => o.value !== '__skip__'); assert.ok(option)
      response = ok(session.resolveChoice(0, option.value))
    } else break
  }
  return response
}
export function harvest(session: GameSession) {
  turn(session, 0, 'grain-seeds'); turn(session, 1, 'reed-bank'); turn(session, 0, 'day-laborer')
  let response = confirmNext(session, turn(session, 1, 'clay-pit'))
  for (let n = 0; n < 12 && response.interaction.stateId === 'wait'; n++) {
    const interaction = response.interaction
    if (interaction.request.kind === 'feed') response = ok(session.resolveChoice(interaction.playerIndex, 'confirm', { selections: [] }))
    else if (interaction.request.kind === 'confirm-player-switch') response = ok(session.resolveChoice(interaction.request.toPlayerIndex, 'confirm'))
    else assert.fail(JSON.stringify(interaction))
  }
  assert.equal(response.state.round, 5); assert.equal(response.interaction.stateId, 'idle'); return response
}
export function goods(response: SessionResponse, actor = 0) { const r = response.state.players[actor]!.resources; return { food: r.food, wood: r.wood, clay: r.clay, reed: r.reed, grain: r.grain, vegetable: r.vegetable } }
