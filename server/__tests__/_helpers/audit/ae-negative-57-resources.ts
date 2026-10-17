// Helpers of ae-negative-57-resources-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import fs from '../audit-evidence-fs'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import type { ActionChoiceOption, GameState } from '../../../../shared/contract/types'
import { createWorkSession } from '../session-fixtures'
import { confirmNext, passPreparationExchanges } from '../negative-rule-audit'

export const sessions: GameSession[] = []
export const output = process.env.AGRICOLA_NEGATIVE_ARTIFACT_DIR ?? 'output/ae-negative/57/resources-oa-probes'
export function ok(response: SessionResponse): SessionResponse {
  assert.equal(response.ok, true, `${response.error} ${JSON.stringify(response.interaction)}`)
  return JSON.parse(JSON.stringify(response))
}
export function gainOf(option: ActionChoiceOption) {
  const preview = option.effectPreview
  return preview && 'resourcesGained' in preview ? preview.resourcesGained : undefined
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
export function ready(session: GameSession) {
  let response = session.getState()
  if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'confirm-next-player') response = confirmNext(session, response)
  response = finish(session, response)
  assert.equal(response.interaction.stateId, 'idle', JSON.stringify(response.interaction))
  return response
}
export function cycleToOwner(session: GameSession) {
  for (const [actor, space] of [[1, 'grain-seeds'], [2, 'clay-pit'], [3, 'reed-bank']] as const) {
    const response = ready(session)
    assert.equal(response.state.currentPlayerIndex, actor)
    finish(session, ok(session.takeAction(actor, space)))
  }
  assert.equal(ready(session).state.currentPlayerIndex, 0)
}
export const buildings = (response: SessionResponse, actor = 0) => {
  const resources = response.state.players[actor]!.resources
  return { wood: resources.wood, clay: resources.clay, reed: resources.reed, stone: resources.stone }
}
export function exchange(session: GameSession, clay: number) {
  const before = session.getState()
  const anytime = before.interaction.anytimeActions.find(action => action.actionId === 'exchange' || action.labelKey === 'actions.exchange.name')
  assert.ok(anytime, JSON.stringify(before.interaction))
  const pending = ok(session.takeAnytimeAction(0, anytime.id))
  const response = choose(session, pending, option => option.sourceCard === 'D162_ClayFirer' && !!option.effectPreview && 'resourcesPaid' in option.effectPreview && option.effectPreview.resourcesPaid?.clay === clay)
  return { pending, response: finish(session, response) }
}
export function minorMenu(session: GameSession) {
  let pending = ok(session.takeAction(0, 'meeting-place'))
  for (let step = 0; step < 8; step++) {
    assert.ok(pending.interaction.stateId === 'wait' && pending.interaction.request.kind === 'choice', JSON.stringify(pending.interaction))
    if (pending.interaction.request.options.some(option => option.value === 'B004_WoodPile')) return pending
    pending = choose(session, pending, option => option.labelKey === 'actions.improvement.name' || option.value.startsWith('action-improvement-'))
  }
  assert.fail('Minor card menu not reached')
}
