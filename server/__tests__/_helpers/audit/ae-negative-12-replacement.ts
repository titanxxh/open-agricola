// Helpers of ae-negative-12-replacement-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import fs from '../audit-evidence-fs'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import type { ActionChoiceOption, GameState } from '../../../../shared/contract/types'
import { createWorkSession } from '../session-fixtures'
import { confirmNext, passPreparationExchanges } from '../negative-rule-audit'

// Design: two-player work sessions, fixed hands before loading, real placement,
// payment and preparation. Round order is controlled, not claimed opening history.
export const LAZY = 'A094_LazySowman', ANGLER = 'A095_Angler', ARTISAN = 'A096_TaskArtisan', FRESH = 'A097_Freshman'
export const MINOR = 'A030_BakingSheet', DEBT = 'A031_DebtSecurity', OCC = 'A114_SeasonalWorker'
export const sessions: GameSession[] = []
export const output = process.env.AGRICOLA_NEGATIVE_ARTIFACT_DIR ?? 'output/ae-negative/12-replacement-probes'
export function save(id: string, value: unknown) { fs.mkdirSync(output, { recursive: true }); fs.writeFileSync(`${output}/${id}.json`, JSON.stringify(value, null, 2)) }
export function ok(response: SessionResponse) { assert.equal(response.ok, true, response.error); return response }
export function setup(card: string, configure: (state: GameState) => void = () => {}, round = 14, played = true) {
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
export function options(response: SessionResponse): ActionChoiceOption[] { assert.ok(response.interaction.stateId === 'wait', JSON.stringify(response.interaction)); assert.ok('options' in response.interaction.request); return response.interaction.request.options! }
export function accept(session: GameSession, response: SessionResponse) { assert.ok(response.interaction.stateId === 'wait'); const choice = options(response).find(o => !('disabled' in o && o.disabled) && o.value !== '__skip__'); assert.ok(choice); return ok(session.resolveChoice(response.interaction.playerIndex, choice.value)) }
export function replacement(session: GameSession, response: SessionResponse, card: string) { const choice = options(response).find(o => o.sourceCard === card); assert.ok(choice, JSON.stringify(response.interaction)); return ok(session.resolveChoice(0, choice.value)) }
export function reveal(session: GameSession) {
  turn(session, 0, 'grain-seeds'); turn(session, 1, 'reed-bank'); turn(session, 0, 'day-laborer')
  let response = confirmNext(session, turn(session, 1, 'clay-pit'))
  for (let n = 0; n < 12 && response.interaction.stateId === 'wait'; n++) {
    const interaction = response.interaction
    if (interaction.request.kind === 'feed') response = ok(session.resolveChoice(interaction.playerIndex, 'confirm', { selections: [] }))
    else if (interaction.request.kind === 'confirm-player-switch') response = ok(session.resolveChoice(interaction.request.toPlayerIndex, 'confirm'))
    else break
  }
  response = passPreparationExchanges(session, response)
  if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'select-trigger' && response.interaction.request.options.some(o => o.value === ARTISAN && !('disabled' in o && o.disabled))) response = ok(session.resolveChoice(response.interaction.playerIndex, ARTISAN))
  return response
}
export function artisan(played = true, round = 6, revealed = 'western-quarry', stone = 0) { return setup(ARTISAN, state => { state.players[0]!.minorHand = [MINOR, DEBT]; state.roundActionOrder[round] = revealed; if (stone) state.actionSpaces.find(space => space.id === revealed)!.resources.stone = stone }, round, played) }
export function buyMinor(session: GameSession, response: SessionResponse) {
  response = accept(session, response)
  assert.ok(options(response).some(o => o.value === MINOR)); assert.ok(options(response).every(o => !o.value.startsWith('Major_')))
  return ok(session.resolveChoice(0, MINOR))
}
export function angler(amount = 2, food = 2, played = true) { return setup(ANGLER, state => { state.actionSpaces.find(s => s.id === 'fishing')!.resources.food = amount; state.players[0]!.resources.food = food; state.players[0]!.minorHand = [DEBT] }, 5, played) }
