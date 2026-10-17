// Helpers of ae-negative-57-phase-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import fs from '../audit-evidence-fs'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import type { ActionChoiceOption, GameState } from '../../../../shared/contract/types'
import { createWorkSession } from '../session-fixtures'
import { confirmNext, passPreparationExchanges } from '../negative-rule-audit'

export const sessions: GameSession[] = []
export const output = process.env.AGRICOLA_NEGATIVE_ARTIFACT_DIR ?? 'output/ae-negative/57/phase-oa-probes'
export const animals = ['sheep', 'boar', 'cattle'] as const
export function ok(response: SessionResponse): SessionResponse {
  assert.equal(response.ok, true, `${response.error} ${JSON.stringify(response.interaction)}`)
  return JSON.parse(JSON.stringify(response))
}
export function save(id: string, value: unknown) {
  fs.mkdirSync(output, { recursive: true })
  fs.writeFileSync(`${output}/${id}.json`, JSON.stringify(value, null, 2))
}
export function make(card: string, configure: (state: GameState) => void = () => {}, played = true, round = 5) {
  const session = createWorkSession({ seed: 4257, options: { playerCount: 4 }, configure(state) {
    state.round = round
    for (const player of state.players) {
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
      player.occupationPlayed = []
      player.minorPlayed = []
      player.improvements = []
      player.cardStates = {}
      Object.assign(player.resources, { wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0, food: 100, sheep: 0, boar: 0, cattle: 0, begging: 0 })
    }
    state.players[0]!.occupationPlayed = played ? [card] : []
    state.players[0]!.occupationHand = played ? ['__test_placeholder__'] : [card, 'A110_Roughcaster']
    configure(state)
  } })
  sessions.push(session)
  return session
}
export function finish(session: GameSession, initial: SessionResponse, accept = false): SessionResponse {
  let response = ok(initial)
  for (let step = 0; step < 80 && response.interaction.stateId === 'wait'; step++) {
    response = passPreparationExchanges(session, response)
    const interaction = response.interaction
    if (interaction.stateId !== 'wait' || interaction.request.kind === 'confirm-next-player') return ok(response)
    const request = interaction.request
    if (request.kind === 'confirm-player-switch') response = ok(session.resolveChoice(request.fromPlayerIndex, 'confirm'))
    else if (request.kind === 'select-trigger') {
      const option = request.options.find(option => !('disabled' in option && option.disabled) && option.value !== '__pass__' && option.labelKey !== 'actions.exchange.name')
      assert.ok(option, JSON.stringify(interaction))
      response = ok(session.resolveChoice(interaction.playerIndex, option.value))
    } else if (request.kind === 'choice') {
      const option = (accept ? request.options.find(option => !option.disabled && !['__skip__', '__done__', '__pass__'].includes(option.value) && option.labelKey !== 'actions.exchange.name') : undefined)
        ?? request.options.find(option => !option.disabled && ['__skip__', '__done__', '__pass__'].includes(option.value))
      assert.ok(option, JSON.stringify(interaction))
      response = ok(session.resolveChoice(interaction.playerIndex, option.value))
    } else if (request.kind === 'animal-reorg') response = ok(session.resolveChoice(interaction.playerIndex, 'confirm', { zones: request.zones }))
    else if (request.kind === 'feed') response = ok(session.resolveChoice(interaction.playerIndex, 'confirm', { selections: [] }))
    else assert.fail(`Unexpected pending ${JSON.stringify(interaction)}`)
  }
  assert.notEqual(response.interaction.stateId, 'wait', 'Pending resolution exceeded safety limit')
  return ok(response)
}
export function transition(session: GameSession, target: number, accept = false) {
  for (let step = 0; step < 32; step++) {
    let response = session.getState()
    if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'confirm-next-player') response = confirmNext(session, response)
    response = finish(session, response, accept)
    if (response.state.round === target) return response
    assert.equal(response.state.round, target - 1)
    const actor = response.state.currentPlayerIndex
    const available = session.getActionAvailability(actor)
    const space = ['grain-seeds', 'day-laborer', 'forest', 'reed-bank', 'clay-pit', 'fishing', 'resource-market', 'copse', 'grove', 'hollow', 'traveling-players', 'eastern-quarry', 'western-quarry'].find(id => available[id])
    assert.ok(space, JSON.stringify(available))
    finish(session, ok(session.takeAction(actor, space)), accept)
  }
  assert.fail('Natural round transition did not complete')
}
export function play(session: GameSession, card: string) {
  let response = ok(session.takeAction(0, 'lessons'))
  if (response.state.players[0]!.occupationHand.includes(card)) {
    assert.ok(response.interaction.stateId === 'wait' && response.interaction.request.kind === 'choice')
    const choice = response.interaction.request.options.find(option => option.value === card)
    assert.ok(choice)
    response = ok(session.resolveChoice(response.interaction.playerIndex, choice.value))
  }
  assert.ok(response.state.players[0]!.occupationPlayed.includes(card))
  return response
}
export function enter(session: GameSession, initial: SessionResponse, predicate: (option: ActionChoiceOption) => boolean) {
  let response = ok(initial)
  for (let step = 0; step < 16; step++) {
    const interaction = response.interaction
    assert.ok(interaction.stateId === 'wait', JSON.stringify(interaction))
    const request = interaction.request
    if (request.kind === 'confirm-player-switch') response = ok(session.resolveChoice(request.fromPlayerIndex, 'confirm'))
    else if (request.kind === 'select-trigger') {
      const option = request.options.find(option => option.value !== '__pass__' && option.labelKey !== 'actions.exchange.name')
      assert.ok(option)
      response = ok(session.resolveChoice(interaction.playerIndex, option.value))
    } else {
      assert.equal(request.kind, 'choice')
      assert.ok(request.kind === 'choice')
      if (request.options.some(predicate)) return response
      const option = request.options.find(option => !option.disabled && !['__skip__', '__done__', '__pass__'].includes(option.value))
      assert.ok(option, JSON.stringify(request))
      response = ok(session.resolveChoice(interaction.playerIndex, option.value))
    }
  }
  assert.fail('Card decision was not reached')
}
export function choose(session: GameSession, response: SessionResponse, predicate: (option: ActionChoiceOption) => boolean) {
  const pending = enter(session, response, predicate)
  assert.ok(pending.interaction.stateId === 'wait' && pending.interaction.request.kind === 'choice')
  const option = pending.interaction.request.options.find(predicate)
  assert.ok(option)
  return ok(session.resolveChoice(pending.interaction.playerIndex, option.value))
}
export const counts = (response: SessionResponse) => animals.map(animal => response.state.players[0]!.resources[animal])
export function renovation(session: GameSession, actor: number, improvement: 'none' | 'minor' | 'major', accept = true) {
  let pending = ok(session.takeAction(actor, 'house-redevelopment'))
  if (improvement === 'none') {
    const declinedImprovement = choose(session, pending, option => option.value === '__skip__')
    return { pending, response: finish(session, declinedImprovement, accept) }
  }
  for (let step = 0; step < 8; step++) {
    assert.ok(pending.interaction.stateId === 'wait' && pending.interaction.request.kind === 'choice', JSON.stringify(pending.interaction))
    if (pending.interaction.request.options.some(option => option.value === 'B004_WoodPile') || pending.interaction.request.options.some(option => option.value === 'Major_Fireplace1')) break
    pending = choose(session, pending, option => option.value !== '__skip__')
  }
  const built = choose(session, pending, option => option.value === (improvement === 'minor' ? 'B004_WoodPile' : 'Major_Fireplace1'))
  return { pending, response: finish(session, built, accept) }
}
export function cabbage(actor = 0, food = 10, played = true) {
  return make('D161_CabbageBuyer', state => { state.currentPlayerIndex = actor; state.players[0]!.resources.food = food; Object.assign(state.players[actor]!.resources, { clay: 4, reed: 1 }); state.players[actor]!.minorHand = ['B004_WoodPile', 'A006_StorageBarn'] }, played, 14)
}
