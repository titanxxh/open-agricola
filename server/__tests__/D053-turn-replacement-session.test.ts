import assert from 'node:assert/strict'
import { afterEach, it } from 'vitest'
import type { GameSession, SessionResponse } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'
import { confirmNextPlayer } from './_helpers/pending-confirms'
import { workersAvailable } from '../../shared/domain/player'

const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))

function ok(response: SessionResponse) {
  assert.equal(response.ok, true, `${response.error}: ${JSON.stringify(response.interaction)}`)
  return response
}

function buyTeaHouse() {
  const session = createWorkSession({ seed: 1178, options: { playerCount: 2 }, configure(state) {
    state.round = 6
    for (const player of state.players) {
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
      Object.assign(player.resources, { food: 10, wood: 0, stone: 0, reed: 0 })
    }
    state.players[0]!.minorHand = ['D053_TeaHouse']
    Object.assign(state.players[0]!.resources, { wood: 1, stone: 1 })
    state.actionSpaces.find(space => space.id === 'reed-bank')!.resources.reed = 2
  } })
  sessions.push(session)
  let response = ok(session.takeAction(0, 'meeting-place'))
  for (let attempts = 0; attempts < 8 && response.interaction.stateId === 'wait'; attempts++) {
    const interaction = response.interaction
    if (interaction.request.kind === 'confirm-next-player') break
    assert.ok(interaction.request.kind === 'choice' || interaction.request.kind === 'select-trigger')
    const option = interaction.request.options.find(option => option.value === 'D053_TeaHouse' || option.value === 'minor:D053_TeaHouse')
      ?? interaction.request.options.find(option => option.value.startsWith('action-improvement-'))
    assert.ok(option, JSON.stringify(interaction))
    response = ok(session.resolveChoice(interaction.playerIndex, option.value))
  }
  assert.ok(response.state.players[0]!.minorPlayed.includes('D053_TeaHouse'))
  assert.equal(response.state.players[0]!.resources.wood, 0)
  assert.equal(response.state.players[0]!.resources.stone, 0)
  return session
}

function secondOpportunity(session: GameSession) {
  ok(confirmNextPlayer(session))
  ok(session.takeAction(1, 'forest'))
  const ready = ok(confirmNextPlayer(session))
  assert.equal(ready.interaction.stateId, 'idle')
  assert.equal(ready.state.currentPlayerIndex, 0)
  assert.ok(ready.interaction.anytimeActions.some(action => action.id === 'D53-tea-house-anytime'))
  return ready
}

it('D053 replaces the second-person opportunity and preserves that person for a later turn', () => {
  const session = buyTeaHouse()
  secondOpportunity(session)
  const received = ok(session.takeAnytimeAction(0, 'D53-tea-house-anytime'))
  assert.equal(received.state.players[0]!.resources.food, 11)
  assert.equal(workersAvailable(received.state, received.state.players[0]!), 1)
  const rejected = session.takeAction(0, 'reed-bank')
  assert.equal(rejected.ok, false)
  assert.equal(rejected.state.players[0]!.resources.food, 11)
  assert.equal(workersAvailable(rejected.state, rejected.state.players[0]!), 1)
  assert.equal(rejected.state.events?.filter(event => event.type === 'worker.placed' && event.actorPlayerId === rejected.state.players[0]!.id).length, 1)
  const opponent = ok(confirmNextPlayer(session))
  assert.equal(opponent.state.currentPlayerIndex, 1)
  ok(session.takeAction(1, 'clay-pit'))
  ok(confirmNextPlayer(session))
  const placed = ok(session.takeAction(0, 'reed-bank'))
  assert.equal(placed.state.players[0]!.resources.reed, 2)
  assert.equal(placed.state.players[0]!.resources.food, 11)
  assert.equal(workersAvailable(placed.state, placed.state.players[0]!), 0)
  assert.ok(!placed.interaction.anytimeActions.some(action => action.id === 'D53-tea-house-anytime'))
  const nextRound = ok(confirmNextPlayer(session))
  assert.equal(nextRound.state.round, 7)
  assert.equal(nextRound.interaction.stateId, 'idle')
  assert.ok(!nextRound.interaction.anytimeActions.some(action => action.id === 'D53-tea-house-anytime'))
  ok(session.takeAction(0, 'forest'))
  ok(confirmNextPlayer(session))
  ok(session.takeAction(1, 'clay-pit'))
  const again = ok(confirmNextPlayer(session))
  assert.ok(again.interaction.anytimeActions.some(action => action.id === 'D53-tea-house-anytime'))
  assert.equal(ok(session.takeAnytimeAction(0, 'D53-tea-house-anytime')).state.players[0]!.resources.food, 12)
})

it('D053 is unavailable inside the first action and ordinary second placement declines it', () => {
  const session = buyTeaHouse()
  const pending = session.getState()
  assert.ok(!pending.interaction.anytimeActions.some(action => action.id === 'D53-tea-house-anytime'))
  const rejected = session.takeAnytimeAction(0, 'D53-tea-house-anytime')
  assert.equal(rejected.ok, false)
  assert.equal(rejected.state.players[0]!.resources.food, 10)
  secondOpportunity(session)
  const placed = ok(session.takeAction(0, 'reed-bank'))
  assert.equal(placed.state.players[0]!.resources.food, 10)
  assert.equal(placed.state.players[0]!.resources.reed, 2)
  assert.equal(workersAvailable(placed.state, placed.state.players[0]!), 0)
})

it('D053 undo restores its replacement opportunity and replay grants one food once', () => {
  const session = buyTeaHouse()
  secondOpportunity(session)
  ok(session.takeAnytimeAction(0, 'D53-tea-house-anytime'))
  const undone = ok(session.undoAction())
  assert.equal(undone.interaction.stateId, 'idle')
  assert.equal(undone.state.currentPlayerIndex, 0)
  assert.equal(undone.state.players[0]!.resources.food, 10)
  assert.equal(workersAvailable(undone.state, undone.state.players[0]!), 1)
  assert.ok(undone.interaction.anytimeActions.some(action => action.id === 'D53-tea-house-anytime'))
  const replayed = ok(session.takeAnytimeAction(0, 'D53-tea-house-anytime'))
  assert.equal(replayed.state.players[0]!.resources.food, 11)
  assert.equal(replayed.state.events?.filter(event => event.type === 'card.triggered' && event.sourceCardId === 'D053_TeaHouse').length, 1)
  assert.equal(session.takeAction(0, 'reed-bank').ok, false)
})
