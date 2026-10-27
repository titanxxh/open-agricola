import assert from 'node:assert/strict'
import { afterEach, describe, expect, it } from 'vitest'
import type { GameSession, SessionResponse } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'
import { confirmNext } from './_helpers/session-assertions'

const CARD_ID = 'A077_Hod'
const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))

const make = (playerCount: number, played = true) => {
  const session = createWorkSession({ seed: 42, options: { playerCount }, configure(state) {
    state.round = 9
    for (const player of state.players) {
      player.resources = {
        food: 0, wood: 0, clay: 0, reed: 0, stone: 0, grain: 0,
        vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
      }
    }
    if (played) state.players[0]!.minorPlayed = [CARD_ID]
    else state.players[0]!.minorHand = [CARD_ID]
    state.actionSpaces.find(space => space.id === 'pig-market')!.resources.boar = 1
  } })
  sessions.push(session)
  return session
}

const houseBoar = (session: GameSession, initial: SessionResponse) => {
  let response = initial
  for (let step = 0; step < 8; step++) {
    expect(response.ok, response.error).toBe(true)
    assert.ok(response.interaction.stateId === 'wait')
    const request = response.interaction.request
    if (request.kind === 'confirm-next-player') return response
    if (request.kind === 'confirm-player-switch') {
      response = session.resolveChoice(request.fromPlayerIndex, 'confirm')
    } else if (request.kind === 'animal-reorg') {
      const house = request.zones.find(zone => zone.zoneType === 'house')
      assert.ok(house)
      response = session.resolveChoice(response.interaction.playerIndex, 'confirm', {
        zones: request.zones.map(zone => ({
          ...zone, animalType: zone.id === house.id ? 'boar' : null,
          animalCount: zone.id === house.id ? 1 : 0,
        })),
      })
    } else {
      throw new Error(`Unexpected Pig Market request: ${request.kind}`)
    }
  }
  throw new Error('Pig Market did not reach action confirmation')
}

describe('Hod with actual participants', () => {
  it('includes the sole owner in any-player Pig Market rewards and houses the real boar', () => {
    const session = make(1)
    const score = session.getState().scores![0]!.total
    const response = houseBoar(session, session.takeAction(0, 'pig-market'))

    expect(response.state.players).toHaveLength(1)
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 2, boar: 1 })
    expect(Object.values(response.state.players[0]!.houseAnimals)).toEqual(['boar'])
    expect(response.state.actionSpaces.find(space => space.id === 'pig-market')?.takenBy)
      .toEqual([{ playerId: 'p1', workerId: '1' }])
    expect(response.state.events.filter(event => event.type === 'resource.moved' && event.sourceCardId === CARD_ID))
      .toEqual([expect.objectContaining({ to: { kind: 'player', playerId: 'p1' }, resources: { clay: 2 } })])
    expect(response.state.log).toContainEqual(expect.objectContaining({
      key: 'log.cardEffectGain', playerId: 'p1', params: expect.objectContaining({ cardId: CARD_ID, gain: { clay: 2 } }),
    }))
    expect(response.scores![0]!.categories).toContainEqual(expect.objectContaining({ key: 'boars', quantity: 1, total: 1 }))
    expect(response.scores![0]!.total - score).toBe(2)
    expect(confirmNext(session, response).state.currentPlayerIndex).toBe(0)
  })

  it.each([0, 1])('rewards the owner once when actual participant %i takes Pig Market in two players', actor => {
    const session = make(2)
    if (actor === 1) confirmNext(session, session.takeAction(0, 'day-laborer'))
    const scores = session.getState().scores!
    const response = houseBoar(session, session.takeAction(actor, 'pig-market'))
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 2, food: actor === 1 ? 2 : 0, boar: actor === 0 ? 1 : 0 })
    expect(response.state.players[1]!.resources).toMatchObject({ clay: 0, food: 0, boar: actor === 1 ? 1 : 0 })
    expect(Object.values(response.state.players[actor]!.houseAnimals)).toEqual(['boar'])
    expect(response.state.events.filter(event => event.type === 'resource.moved' && event.sourceCardId === CARD_ID))
      .toEqual([expect.objectContaining({ to: { kind: 'player', playerId: 'p1' }, resources: { clay: 2 } })])
    expect(response.state.log).toContainEqual(expect.objectContaining({
      key: 'log.cardEffectGain', playerId: 'p1', params: expect.objectContaining({ cardId: CARD_ID, gain: { clay: 2 } }),
    }))
    expect(response.scores![actor]!.total - scores[actor]!.total).toBe(2)
    expect(response.scores![1 - actor]!.total).toBe(scores[1 - actor]!.total)
    expect(confirmNext(session, response).state.currentPlayerIndex).toBe(1 - actor)
  })

  it('does not trigger a card in hand or a different action by its owner', () => {
    const inHand = make(1, false)
    const collected = houseBoar(inHand, inHand.takeAction(0, 'pig-market'))
    expect(collected.state.players[0]!.resources).toMatchObject({ boar: 1, clay: 0 })
    expect(collected.state.players[0]!.minorHand).toEqual([CARD_ID])
    expect(collected.state.events.some(event => event.sourceCardId === CARD_ID)).toBe(false)

    const played = make(1)
    const scores = played.getState().scores
    const unrelated = played.takeAction(0, 'day-laborer')
    expect(unrelated.ok, unrelated.error).toBe(true)
    expect(unrelated.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
    expect(unrelated.state.players[0]!.resources).toMatchObject({ food: 2, clay: 0, boar: 0 })
    expect(unrelated.state.events.some(event => event.sourceCardId === CARD_ID)).toBe(false)
    expect(unrelated.state.log.some(entry => entry.params?.cardId === CARD_ID)).toBe(false)
    expect(unrelated.scores).toEqual(scores)
  })
})
