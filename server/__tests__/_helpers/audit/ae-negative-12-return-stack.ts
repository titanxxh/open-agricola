// Helpers of ae-negative-12-return-stack-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import fs from '../audit-evidence-fs'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import type { GameState } from '../../../../shared/contract/types'
import { setActiveWorkerCount, workersAvailable } from '../../../../shared/domain/player'
import { createWorkSession } from '../session-fixtures'
import { confirmNext } from '../negative-rule-audit'

export const CURATOR = 'A100_Curator', GROCER = 'A102_Grocer'
export const sessions: GameSession[] = []
export const output = process.env.AGRICOLA_NEGATIVE_ARTIFACT_DIR ?? 'output/ae-negative/12-return-stack-probes'
export function save(id: string, value: unknown) { fs.mkdirSync(output, { recursive: true }); fs.writeFileSync(`${output}/${id}.json`, JSON.stringify(value, null, 2)) }
export function ok(response: SessionResponse) { assert.equal(response.ok, true, response.error); return response }
export function setup(card: string, configure: (state: GameState) => void = () => {}, played = true) {
  const session = createWorkSession({ seed: 4242, configure(state) {
    state.round = 3
    for (const player of state.players) Object.assign(player.resources, { food: 20, wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0 })
    const player = state.players[0]!
    player.occupationPlayed = played ? [card] : []
    player.occupationHand = played ? ['__test_placeholder__'] : [card]
    configure(state)
  } }); sessions.push(session); return session
}
export function ready(session: GameSession, actor: number) { let response = session.getState(); if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'confirm-next-player') response = confirmNext(session, response); assert.equal(response.interaction.stateId, 'idle'); assert.equal(response.state.currentPlayerIndex, actor) }
export function turn(session: GameSession, actor: number, space: string) { ready(session, actor); return ok(session.takeAction(actor, space)) }
export function choices(response: SessionResponse) { assert.ok(response.interaction.stateId === 'wait' && response.interaction.request.kind === 'choice', JSON.stringify(response.interaction)); return response.interaction.request.options }
export function curator({ people = 3, food = 20, played = true }: { people?: number; food?: number; played?: boolean } = {}) {
  return setup(CURATOR, state => { const p = state.players[0]!; setActiveWorkerCount(p, people); p.roomTiles.push({ row: 0, col: 0 }); p.rooms = 3; p.resources.food = food }, played)
}
export function finishCurator(session: GameSession, last = 'reed-bank') {
  turn(session, 0, 'forest'); turn(session, 1, 'grain-seeds'); turn(session, 0, 'clay-pit'); turn(session, 1, 'day-laborer')
  const response = session.getState()
  if (workersAvailable(response.state, response.state.players[0]!) <= 0) return response
  let lastResponse = turn(session, 0, last)
  if (last === 'farmland') lastResponse = ok(session.commitSelectionChoice(0, { tile: { row: 0, col: 1 } }))
  return confirmNext(session, lastResponse)
}
export function curatorChoice(session: GameSession, response: SessionResponse, accept: boolean) {
  for (let n = 0; n < 4 && response.interaction.stateId === 'wait'; n++) {
    if (response.interaction.request.kind === 'select-trigger') response = ok(session.resolveChoice(0, CURATOR))
    else if (response.interaction.request.kind === 'choice') { const option = choices(response).find(o => accept ? o.value !== '__skip__' && !o.disabled : o.value === '__skip__'); assert.ok(option); response = ok(session.resolveChoice(0, option.value)) }
    else break
  }
  return response
}
export function bonus(response: SessionResponse) { return response.scores?.[0]?.categories.find(c => c.key === 'cardBonusVp')?.entries.filter(e => e.type === 'bonus' && e.cardId === CURATOR).reduce((sum, e) => sum + e.score, 0) ?? 0 }
export function grocer(food = 8) { return setup(GROCER, state => state.players[0]!.resources.food = food, false) }
export function buyGrocer(session: GameSession) {
  let response = turn(session, 0, 'lessons')
  if (response.state.players[0]!.occupationHand.includes(GROCER)) response = ok(session.resolveChoice(0, GROCER))
  assert.ok(response.state.players[0]!.occupationPlayed.includes(GROCER)); return response
}
export function enterGrocer(session: GameSession) { buyGrocer(session); turn(session, 1, 'grain-seeds'); return turn(session, 0, 'farmland') }
export function take(session: GameSession) { return ok(session.takeAnytimeAction(0, 'A102-grocer-anytime')) }
