import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { confirmPlayerSwitch } from './_helpers/pending-confirms'

import '../../shared/cards/C/C164_GermanHeathKeeper'
import assert from 'node:assert/strict'
import * as audit57Livestock from './_helpers/audit/ae-negative-57-livestock'

const CARD_ID = 'C164_GermanHeathKeeper'

describe('C164_GermanHeathKeeper session', () => {
  const setup = (currentPlayerIndex: number) => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    // GermanHeathKeeper is a 4+ player card, keep all 4 players
    state.currentPlayerIndex = currentPlayerIndex

    const owner = state.players[0]!
    owner.occupationPlayed.push(CARD_ID)

    // Ensure pig-market is open and has resources
    const pigMarket = state.actionSpaces.find((s) => s.id === 'pig-market')
    if (!pigMarket) throw new Error('pig-market space missing')
    pigMarket.resources.boar = 1

    session.loadState(state)
    return session
  }

  it('owner gains 1 sheep when owner uses pig-market', () => {
    const session = setup(0)
    const sheepBefore = session.getState().state.players[0]!.resources.sheep

    let resp = session.takeAction(0, 'pig-market')
    expect(resp.ok).toBe(true)

    // Handle animalReorg for boar from pig-market
    if (resp.interaction.stateId === 'wait' && resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined === 'ui.interactionAnimalReorg') {
      resp = session.resolveChoice(0, 'confirm', [
        { id: 'house:1-0', zoneType: 'house', animalType: 'boar', animalCount: 1 },
      ])
    }

    // Handle player switch if needed (sheep gain from card)
    while (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-player-switch') {
      resp = confirmPlayerSwitch(session)
    }

    // Handle animalReorg for sheep from card
    if (resp.interaction.stateId === 'wait' && resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined === 'ui.interactionAnimalReorg') {
      resp = session.resolveChoice(0, 'confirm', [
        { id: 'house:1-0', zoneType: 'house', animalType: 'boar', animalCount: 1 },
        { id: 'house:1-0', zoneType: 'house', animalType: 'sheep', animalCount: 1 },
      ])
    }

    const after = session.getState().state
    expect(after.players[0]!.resources.sheep).toBe(sheepBefore + 1)
  })

  it('owner gains 1 sheep when opponent uses pig-market', () => {
    const session = setup(1)
    const sheepBefore = session.getState().state.players[0]!.resources.sheep

    let resp = session.takeAction(1, 'pig-market')
    expect(resp.ok).toBe(true)

    // Handle animalReorg for opponent's boar
    if (resp.interaction.stateId === 'wait' && resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined === 'ui.interactionAnimalReorg') {
      resp = session.resolveChoice(1, 'confirm', [
        { id: 'house:1-0', zoneType: 'house', animalType: 'boar', animalCount: 1 },
      ])
    }

    // Handle player switch to owner for sheep gain
    while (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-player-switch') {
      resp = confirmPlayerSwitch(session)
    }

    // Handle animalReorg for owner's sheep
    if (resp.interaction.stateId === 'wait' && resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined === 'ui.interactionAnimalReorg') {
      resp = session.resolveChoice(0, 'confirm', [
        { id: 'house:1-0', zoneType: 'house', animalType: 'sheep', animalCount: 1 },
      ])
    }

    while (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-player-switch') {
      resp = confirmPlayerSwitch(session)
    }

    const after = session.getState().state
    expect(after.players[0]!.resources.sheep).toBe(sheepBefore + 1)
  })

  it('does not trigger for non-pig-market spaces', () => {
    const session = setup(1)
    const sheepBefore = session.getState().state.players[0]!.resources.sheep

    let resp = session.takeAction(1, 'day-laborer')
    expect(resp.ok).toBe(true)

    while (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-player-switch') {
      resp = confirmPlayerSwitch(session)
    }

    const after = session.getState().state
    expect(after.players[0]!.resources.sheep).toBe(sheepBefore)
  })
})

describe('ae-negative-57-livestock', () => {
  const { sessions, ok, save, make, pasture, finish, count, collect } = audit57Livestock
  afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
  it('C164 N1 real owner or opponent Pig Market grants exactly one owner sheep while retaining the physical pig pile', () => {
    for (const actor of [0, 1]) {
      const session = make('C164_GermanHeathKeeper', state => { state.currentPlayerIndex = actor; pasture(state.players[actor]!); state.actionSpaces.find(space => space.id === 'pig-market')!.resources.boar = 2 }, true, 14)
      const response = collect(session, actor, 'pig-market')
      assert.equal(response.state.players[0]!.resources.sheep, 1)
      assert.equal(response.state.players[actor]!.resources.boar, 2)
      assert.equal(response.state.players[actor === 0 ? 1 : 0]!.resources.boar, 0)
      assert.equal(response.state.actionSpaces.find(space => space.id === 'pig-market')!.resources.boar, 0)
      save(`C164-N1-${actor}`, response)
    }
  })
  it('C164 N2 card in hand and unrelated owner Grain Seeds never grant sheep while legitimate goods are collected', () => {
    const hand = make('C164_GermanHeathKeeper', state => { pasture(state.players[0]!); state.actionSpaces.find(space => space.id === 'pig-market')!.resources.boar = 1 }, false, 14), handResponse = collect(hand, 0, 'pig-market')
    assert.deepEqual(count(handResponse), [0, 1, 0])
    const other = make('C164_GermanHeathKeeper'), response = finish(other, ok(other.takeAction(0, 'grain-seeds')))
    assert.deepEqual(count(response), [0, 0, 0]); assert.equal(response.state.players[0]!.resources.grain, 1)
    save('C164-N2', { handResponse, response })
  })
  it('C164 N3 whole owner Pig Market undo restores sheep pigs original pile and occupancy before one replay', () => {
    const session = make('C164_GermanHeathKeeper', state => { pasture(state.players[0]!); state.actionSpaces.find(space => space.id === 'pig-market')!.resources.boar = 2 }, true, 14), response = collect(session, 0, 'pig-market'), undone = ok(session.undoAction()), replay = collect(session, 0, 'pig-market')
    assert.deepEqual(count(undone), [0, 0, 0]); assert.equal(undone.state.actionSpaces.find(space => space.id === 'pig-market')!.resources.boar, 2); assert.equal(undone.state.actionSpaces.find(space => space.id === 'pig-market')!.takenBy.length, 0); assert.deepEqual(count(replay), [1, 2, 0])
    save('C164-N3', { response, undone, replay })
  })
})
