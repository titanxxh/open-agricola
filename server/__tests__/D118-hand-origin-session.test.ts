import assert from 'node:assert/strict'
import { afterEach, it } from 'vitest'
import type { GameSession, SessionResponse } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'
import { confirmNextPlayer } from './_helpers/pending-confirms'

const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))

function ok(response: SessionResponse) {
  assert.equal(response.ok, true, `${response.error}: ${JSON.stringify(response.interaction)}`)
  return response
}

function finish(session: GameSession, response: SessionResponse, card?: string): SessionResponse {
  for (let attempts = 0; attempts < 20 && response.interaction.stateId === 'wait'; attempts++) {
    const interaction = response.interaction
    if (interaction.request.kind === 'confirm-next-player') return response
    if (interaction.request.kind === 'confirm-player-switch') {
      response = ok(session.resolveChoice(interaction.request.fromPlayerIndex, 'confirm'))
      continue
    }
    assert.ok(interaction.request.kind === 'choice' || interaction.request.kind === 'select-trigger')
    const options = interaction.request.options.filter(option => !('disabled' in option && option.disabled))
    const option = options.find(option => card && (option.value === card || option.value === `major:${card}` || option.value === `minor:${card}`))
      ?? options.find(option => option.sourceCard === 'D118_Bonehead')
      ?? options.find(option => option.value.startsWith('action-improvement-'))
      ?? options.find(option => ['__skip__', '__pass__', '__done__'].includes(option.value))
    assert.ok(option, JSON.stringify(interaction))
    response = ok(session.resolveChoice(interaction.playerIndex, option.value))
  }
  return response
}

function buyBonehead(minor?: string, stone = 3) {
  const session = createWorkSession({ seed: 1174, options: { playerCount: 2 }, configure(state) {
    state.round = 14
    for (const player of state.players) {
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
      Object.assign(player.resources, { wood: 0, clay: 0, reed: 0, stone: 0, food: 20 })
    }
    state.players[0]!.occupationHand = ['D118_Bonehead']
    if (minor) state.players[0]!.minorHand = [minor]
    state.players[0]!.resources.stone = stone
    if (minor === 'D059_EarthOven') {
      state.players[0]!.improvements = ['Major_Fireplace1']
      state.availableMajorImprovements = state.availableMajorImprovements.filter(card => card !== 'Major_Fireplace1')
    }
  } })
  sessions.push(session)
  const bought = finish(session, ok(session.takeAction(0, 'lessons')), 'D118_Bonehead')
  assert.deepEqual(bought.state.players[0]!.cardStates.D118_Bonehead?.stack, ['wood', 'wood', 'wood', 'wood', 'wood'])
  assert.equal(bought.state.players[0]!.resources.wood, 1)
  ok(confirmNextPlayer(session))
  finish(session, ok(session.takeAction(1, 'forest')))
  ok(confirmNextPlayer(session))
  return session
}

it('D118 common-supply Well pays its cost without consuming hand-card wood', () => {
  const session = buyBonehead()
  const response = finish(session, ok(session.takeAction(0, 'major-improvement')), 'Major_Well')
  const player = response.state.players[0]!
  assert.ok(player.improvements.includes('Major_Well'))
  assert.equal(player.resources.stone, 0)
  assert.equal(player.resources.wood, 0)
  assert.equal(player.cardStates.D118_Bonehead?.stack?.length, 5)
  assert.ok(response.state.events?.some(event => event.type === 'card.played' && event.cardId === 'Major_Well'))
})

it('D118 hand minor pays its wood and receives one card-stack wood', () => {
  const session = buyBonehead('B081_Handcart')
  const response = finish(session, ok(session.takeAction(0, 'meeting-place')), 'B081_Handcart')
  assert.ok(response.state.players[0]!.minorPlayed.includes('B081_Handcart'))
  assert.equal(response.state.players[0]!.resources.wood, 1)
  assert.equal(response.state.players[0]!.cardStates.D118_Bonehead?.stack?.length, 4)
})

it('D118 passing hand minor gives its reward and hand-card wood once', () => {
  const session = buyBonehead('B007_Wage')
  const response = finish(session, ok(session.takeAction(0, 'meeting-place')), 'B007_Wage')
  assert.equal(response.state.players[0]!.resources.food, 22)
  assert.equal(response.state.players[0]!.resources.wood, 2)
  assert.equal(response.state.players[0]!.cardStates.D118_Bonehead?.stack?.length, 4)
  assert.ok(!response.state.players[0]!.minorHand.includes('B007_Wage'))
  assert.ok(!response.state.players[0]!.minorPlayed.includes('B007_Wage'))
  assert.ok(response.state.players[1]!.minorHand.includes('B007_Wage'))
  assert.equal(response.state.events?.filter(event => event.type === 'card.passed' && event.cardId === 'B007_Wage').length, 1)
})

it('D118 major-counting hand minor still receives hand-card wood when replacing its Fireplace', () => {
  const session = buyBonehead('D059_EarthOven')
  const response = finish(session, ok(session.takeAction(0, 'meeting-place')), 'D059_EarthOven')
  assert.ok(response.state.players[0]!.minorPlayed.includes('D059_EarthOven'))
  assert.ok(!response.state.players[0]!.improvements.includes('Major_Fireplace1'))
  assert.ok(response.state.availableMajorImprovements.includes('Major_Fireplace1'))
  assert.equal(response.state.players[0]!.resources.wood, 2)
  assert.equal(response.state.players[0]!.cardStates.D118_Bonehead?.stack?.length, 4)
})

it('D118 Well undo and replay preserve payment and do not consume its stack', () => {
  const session = buyBonehead()
  finish(session, ok(session.takeAction(0, 'major-improvement')), 'Major_Well')
  const undone = ok(session.undoAction())
  assert.equal(undone.state.players[0]!.resources.wood, 1)
  assert.equal(undone.state.players[0]!.resources.stone, 3)
  assert.equal(undone.state.players[0]!.cardStates.D118_Bonehead?.stack?.length, 5)
  assert.ok(!undone.state.players[0]!.improvements.includes('Major_Well'))
  const replayed = finish(session, ok(session.takeAction(0, 'major-improvement')), 'Major_Well')
  assert.equal(replayed.state.players[0]!.resources.wood, 0)
  assert.equal(replayed.state.players[0]!.resources.stone, 0)
  assert.equal(replayed.state.players[0]!.cardStates.D118_Bonehead?.stack?.length, 5)
  assert.equal(replayed.state.events?.filter(event => event.type === 'card.played' && event.cardId === 'Major_Well').length, 1)
})

it('D118 rejected unaffordable Well leaves its stack before a legal hand purchase', () => {
  const session = buyBonehead('B081_Handcart', 2)
  const offered = ok(session.takeAction(0, 'major-improvement'))
  assert.ok(offered.interaction.stateId === 'wait')
  const before = structuredClone(offered.state.players[0]!)
  const rejected = session.resolveChoice(offered.interaction.playerIndex, 'major:Major_Well')
  assert.equal(rejected.ok, false)
  assert.deepEqual(rejected.state.players[0]!.resources, before.resources)
  assert.deepEqual(rejected.state.players[0]!.cardStates.D118_Bonehead, before.cardStates.D118_Bonehead)
  const accepted = finish(session, ok(session.getState()), 'B081_Handcart')
  assert.ok(accepted.state.players[0]!.minorPlayed.includes('B081_Handcart'))
  assert.equal(accepted.state.players[0]!.resources.wood, 1)
  assert.equal(accepted.state.players[0]!.resources.stone, 2)
  assert.equal(accepted.state.players[0]!.cardStates.D118_Bonehead?.stack?.length, 4)
})
