// Helpers of ae-negative-13-harvest-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import fs from '../audit-evidence-fs'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import type { GameState, CropStack } from '../../../../shared/contract/types'
import { createWorkSession } from '../session-fixtures'
import { confirmNext } from '../negative-rule-audit'

export const CARD = 'A106_SlurrySpreader'
export const sessions: GameSession[] = []
export const output = process.env.AGRICOLA_NEGATIVE_ARTIFACT_DIR ?? 'output/ae-negative/13-harvest-probes'
export function save(id: string, value: unknown) { fs.mkdirSync(output, { recursive: true }); fs.writeFileSync(`${output}/${id}.json`, JSON.stringify(value, null, 2)) }
export function ok(response: SessionResponse) { assert.equal(response.ok, true, response.error); return response }
export function setup(stacks: CropStack[], configure: (state: GameState) => void = () => {}, played = true, round = 4) {
  const session = createWorkSession({ seed: 4242, configure(state) {
    state.round = round
    for (const player of state.players) Object.assign(player.resources, { food: 40, wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0 })
    const owner = state.players[0]!
    owner.occupationPlayed = played ? [CARD] : []
    owner.occupationHand = played ? ['__test_placeholder__'] : [CARD]
    owner.fields = stacks.map((stack, col) => ({ row: 0, col: col + 1, stacks: [stack] }))
    configure(state)
  } }); sessions.push(session); return session
}
export function turn(session: GameSession, actor: number, space: string) {
  let response = session.getState()
  if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'confirm-next-player') response = confirmNext(session, response)
  assert.equal(response.interaction.stateId, 'idle'); assert.equal(response.state.currentPlayerIndex, actor); return ok(session.takeAction(actor, space))
}
export function finish(session: GameSession) {
  turn(session, 0, 'grain-seeds'); turn(session, 1, 'reed-bank'); turn(session, 0, 'day-laborer')
  let response = confirmNext(session, turn(session, 1, 'clay-pit'))
  for (let n = 0; n < 15 && response.interaction.stateId === 'wait'; n++) {
    const interaction = response.interaction
    if (interaction.request.kind === 'feed') response = ok(session.resolveChoice(interaction.playerIndex, 'confirm', { selections: [] }))
    else if (interaction.request.kind === 'confirm-player-switch') response = ok(session.resolveChoice(interaction.request.toPlayerIndex, 'confirm'))
    else assert.fail(JSON.stringify(interaction))
  }
  assert.equal(response.interaction.stateId, 'idle'); return response
}
