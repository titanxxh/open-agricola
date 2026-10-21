import assert from 'node:assert/strict'
import { afterEach, it, describe, expect } from 'vitest'
import * as audit51Family from './_helpers/audit/ae-negative-51-family'
import { createWorkSession } from './_helpers/session-fixtures'
import type { GameSession, SessionResponse } from '../game/authoritative-session'
import { confirmNext } from './_helpers/session-assertions'

describe('Private Teacher before Grain Seeds', () => {
  const sessions: GameSession[] = []
  afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
  function make(food = 1, occupied = true) {
    const session = createWorkSession({ options: { playerCount: 3 }, configure: state => {
      state.round = 5
      for (const player of state.players) Object.keys(player.resources).forEach(key => Reflect.set(player.resources, key, 0))
      const player = state.players[0]!
      player.occupationPlayed = ['C131_PrivateTeacher']
      player.occupationHand = ['B142_Greengrocer']
      player.resources.food = food
      if (occupied) {
        const opponent = state.players[1]!
        state.actionSpaces.find(space => space.id === 'lessons')!.takenBy = [{ playerId: opponent.id, workerId: opponent.workers[0]!.id }]
      }
    } })
    sessions.push(session)
    return session
  }
  function playHeld(session: GameSession, response: SessionResponse) {
    for (let step = 0; step < 3 && !response.state.players[0]!.occupationPlayed.includes('B142_Greengrocer'); step++) {
      expect(response.interaction.stateId).toBe('wait')
      if (response.interaction.stateId !== 'wait') throw new Error('Expected occupation choice')
      const options = response.interaction.request.options ?? []
      const option = options.find(option => option.value === 'B142_Greengrocer')
        ?? options.find(option => !['__skip__', '__pass__'].includes(option.value))
      expect(option, JSON.stringify(response.interaction)).toBeDefined()
      response = session.resolveChoice(response.interaction.playerIndex, option!.value)
      expect(response.ok, response.error).toBe(true)
    }
    return response
  }

  it('pays before collecting grain and first triggers the new Greengrocer on the next use', () => {
    const session = make()
    let response = session.takeAction(0, 'grain-seeds')
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction).toMatchObject({ stateId: 'wait', sourceCard: 'C131_PrivateTeacher' })
    expect(response.state.players[0]!.resources.grain).toBe(0)
    response = playHeld(session, response)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, grain: 1, vegetable: 0 })
    expect(response.state.players[0]!.occupationPlayed).toContain('B142_Greengrocer')
    const paid = response.state.events.findIndex(event => event.type === 'resource.paid' && event.paymentFor === 'occupation')
    const collected = response.state.events.findIndex(event => event.type === 'resource.moved' && event.sourceCardId === undefined)
    const played = response.state.events.findIndex(event => event.type === 'card.played' && event.cardId === 'B142_Greengrocer')
    expect(paid).toBeGreaterThanOrEqual(0)
    expect(played).toBeGreaterThan(paid)
    expect(collected).toBeGreaterThan(played)
    expect(response.state.log.some(entry => entry.key === 'log.playOccupation')).toBe(true)
    expect(response.scores).toHaveLength(3)

    for (let step = 0; step < 12 && response.state.round === 5; step++) {
      if (response.interaction.stateId === 'wait') response = confirmNext(session, response)
      if (response.state.round !== 5) break
      const actor = response.state.currentPlayerIndex
      const available = session.getActionAvailability(actor)
      const space = ['forest', 'clay-pit', 'reed-bank', 'fishing', 'day-laborer', 'grove', 'hollow'].find(id => available[id])
      expect(space).toBeDefined()
      response = session.takeAction(actor, space!)
      expect(response.ok, response.error).toBe(true)
    }
    expect(response.state.round).toBe(6)
    expect(response.state.currentPlayerIndex).toBe(0)
    response = session.takeAction(0, 'grain-seeds')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 2, vegetable: 1 })
  }, 30_000)

  it.each([{ food: 0, occupied: true }, { food: 1, occupied: false }])('does not play an occupation for %j', ({ food, occupied }) => {
    const response = make(food, occupied).takeAction(0, 'grain-seeds')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toEqual(['C131_PrivateTeacher'])
    expect(response.state.players[0]!.occupationHand).toContain('B142_Greengrocer')
    expect(response.state.players[0]!.resources).toMatchObject({ food, grain: 1, vegetable: 0 })
    expect(response.interaction.stateId === 'wait' && response.interaction.sourceCard).not.toBe('C131_PrivateTeacher')
  }, 30_000)
})

describe('ae-negative-51-family', () => {
  const { sessions, save, setup, choose, finish, offer, take, teacher } = audit51Family
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('C131 N1 actual opponent Lessons occupancy allows exactly one occupation for one food on Grain Seeds', () => {
    const s = setup('C131_PrivateTeacher')
    let r = offer(s, teacher(s, 'A125_Priest'), 'C131_PrivateTeacher')
    r = choose(s, r, o => o.value === 'A125_Priest' || !['__skip__', '__pass__'].includes(o.value))
    if (!r.state.players[0]!.occupationPlayed.includes('A125_Priest'))
      r = choose(s, r, o => o.value === 'A125_Priest')
    r = finish(s, r)
    assert.ok(r.state.players[0]!.occupationPlayed.includes('A125_Priest'))
    assert.equal(r.state.players[0]!.resources.food, 19)
    assert.equal(r.state.players[0]!.resources.grain, 1)
    save('C131-N1', r)
  })
  it('C131 N2 vacant Lessons optional decline and zero food do not play the held occupation', () => {
    for (const mode of ['vacant', 'decline', 'short']) {
      const s = setup('C131_PrivateTeacher'), r = finish(s, teacher(s, 'A125_Priest', mode === 'short' ? 0 : 20, mode !== 'vacant'))
      assert.ok(!r.state.players[0]!.occupationPlayed.includes('A125_Priest'))
      assert.equal(r.state.players[0]!.resources.food, mode === 'short' ? 0 : 20)
      assert.equal(r.state.players[0]!.resources.grain, 1)
      save(`C131-N2-${mode}`, r)
    }
  })
  it('C131 N3 a Grain Seeds occupation played by Private Teacher does not join the captured window', () => {
    const ctl = setup('C131_PrivateTeacher', 14, state => state.players[0]!.occupationPlayed = ['B142_Greengrocer'])
    const legal = finish(ctl, take(ctl, 'grain-seeds'))
    assert.equal(legal.state.players[0]!.resources.vegetable, 1)
    save('C131-N3-control', legal)
    const s = setup('C131_PrivateTeacher')
    let r = offer(s, teacher(s, 'B142_Greengrocer'), 'C131_PrivateTeacher')
    r = choose(s, r, o => o.value === 'B142_Greengrocer' || !['__skip__', '__pass__'].includes(o.value))
    if (!r.state.players[0]!.occupationPlayed.includes('B142_Greengrocer'))
      r = choose(s, r, o => o.value === 'B142_Greengrocer')
    r = finish(s, r)
    assert.ok(r.state.players[0]!.occupationPlayed.includes('B142_Greengrocer'))
    assert.equal(r.state.players[0]!.resources.grain, 1)
    assert.equal(r.state.players[0]!.resources.wood, 3)
    assert.equal(r.state.players[0]!.resources.food, 19)
    save('C131-N3', r)
    assert.equal(r.state.players[0]!.resources.vegetable, 0)
  })
})
