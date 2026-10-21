import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'

import '../../shared/cards/C/C147_Cowherd'
import assert from 'node:assert/strict'
import * as audit54Resources from './_helpers/audit/ae-negative-54-resources'
import { createWorkSession } from './_helpers/session-fixtures'
import { expectCardEffectBeforeHostCollect } from './_helpers/space-use-order'

const CARD_ID = 'C147_Cowherd'

const setup = (currentPlayerIndex: number, played = true) => {
  const session = new GameSession(147, undefined, { playerCount: 3 })
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = currentPlayerIndex
  state.round = 14
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
    player.resources.cattle = 0
  })
  const owner = state.players[0]!
  if (played) owner.occupationPlayed = [CARD_ID]
  else owner.occupationHand = [CARD_ID]
  owner.pastures = [{
    id: 'owner-pasture',
    size: 1,
    tiles: [{ row: 0, col: 2 }],
    stables: 0,
    animalType: null,
    animalCount: 0,
  }]
  const cattleMarket = state.actionSpaces.find((space) => space.id === 'cattle-market')!
  cattleMarket.resources.cattle = 1
  session.loadState(state)
  return session
}

const useCattleMarket = (session: GameSession, playerIndex: number) => {
  let response: SessionResponse = session.takeAction(playerIndex, 'cattle-market')
  for (let step = 0; step < 5; step++) {
    if (response.interaction.stateId !== 'wait') break
    if (response.interaction.request.kind === 'select-trigger') {
      response = resolveTriggerIfPresent(session, response, CARD_ID)
      continue
    }
    if (response.interaction.request.kind !== 'animal-reorg') break
    const cattle = response.state.players[playerIndex]!.resources.cattle
    response = session.resolveChoice(playerIndex, 'confirm', {
      zones: playerIndex === 0
        ? [{ id: 'owner-pasture', zoneType: 'pasture', animalType: 'cattle', animalCount: cattle }]
        : [{ id: 'house:1-0', zoneType: 'house', animalType: 'cattle', animalCount: cattle }],
    })
  }
  return response
}

describe('C147 Cowherd parity', () => {
  it('C147 S1: playing Cowherd through Lessons keeps the occupation in play', () => {
    const response = setup(0, false).takeAction(0, 'lessons')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
  })

  it('C147 S2: the owner using Cattle Market gains one additional cattle', () => {
    const response = useCattleMarket(setup(0), 0)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.cattle).toBe(2)
    expect(response.state.players[0]!.pastures[0]).toMatchObject({ animalType: 'cattle', animalCount: 2 })
  })

  it('C147 S3: another player using Cattle Market gains no cattle for the owner', () => {
    const response = useCattleMarket(setup(1), 1)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.cattle).toBe(0)
    expect(response.state.players[1]!.resources.cattle).toBe(1)
  })

  it('C147 S4: the owner using another action gains no cattle', () => {
    const response = setup(0).takeAction(0, 'day-laborer')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.cattle).toBe(0)
  })
})

describe('ae-negative-54-resources', () => {
  const { sessions, ok, save, setup, finish, next, take, move, farm } = audit54Resources
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('C147 N1 actual owner Cattle Market adds one cattle and retains all animals in a legal farm', () => {
    const s = setup('C147_Cowherd', 14, state => { farm(state, 1); state.actionSpaces.find(a => a.id === 'cattle-market')!.resources.cattle = 2; })
    let r = take(s, 'cattle-market')
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'animal-reorg')
    for (let n = 0; n < 4 && r.interaction.stateId === 'wait' && r.interaction.request.kind === 'animal-reorg'; n++) {
      const z = r.interaction.request.zones.find(z => z.zoneType === 'pasture')!
      const count = r.state.players[0]!.resources.cattle
      r = ok(s.resolveChoice(0, 'confirm', { zones: [{ ...z, animalType: 'cattle', animalCount: count, animalCounts: { cattle: count } }] }))
    }
    assert.equal(r.state.players[0]!.resources.cattle, 3)
    assert.equal(r.state.players[0]!.pastures[0]!.animalCount, 3)
    save('C147-N1', r)
  })
  it('C147 N2 opponent Cattle Market unrelated owner action and hand-only card exclude bonus', () => {
    for (const mode of ['opponent', 'unrelated', 'hand']) {
      const s = setup('C147_Cowherd', 14, state => {
        farm(state, 1)
        state.actionSpaces.find(a => a.id === 'cattle-market')!.resources.cattle = 1
        if (mode === 'hand') {
          state.players[0]!.occupationPlayed = []
          state.players[0]!.occupationHand = ['C147_Cowherd']
        }
      })
      let r
      if (mode === 'opponent') {
        move(s, 'forest')
        next(s)
        r = finish(s, ok(s.takeAction(1, 'cattle-market')))
      }
      else
        r = finish(s, take(s, mode === 'unrelated' ? 'forest' : 'cattle-market'))
      assert.equal(r.state.players[0]!.resources.cattle, mode === 'hand' ? 1 : 0)
      save(`C147-N2-${mode}`, r)
    }
  })
})

describe('C147 before timing (#1322)', () => {
  const sessions: GameSession[] = []
  afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
  const make = (actor: number) => {
    const session = createWorkSession({ seed: 1322147, options: { playerCount: 3 }, configure: state => {
      state.round = 14
      state.currentPlayerIndex = actor
      state.players.forEach(player => { player.resources.cattle = 0 })
      const owner = state.players[0]!
      owner.occupationPlayed = [CARD_ID]
      owner.pastures = [{ id: 'owner-pasture', tiles: [{ row: 0, col: 2 }], animalType: null, animalCount: 0 }]
      state.actionSpaces.find(space => space.id === 'cattle-market')!.resources.cattle = 1
    } })
    sessions.push(session)
    return session
  }

  it('houses the bonus cattle before collecting and housing Cattle Market cattle', () => {
    const session = make(0)
    let response = session.takeAction(0, 'cattle-market')

    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.stateId === 'wait' && response.interaction.request.kind).toBe('animal-reorg')
    expect(response.state.players[0]!.resources.cattle).toBe(1)
    expect(response.state.actionSpaces.find(space => space.id === 'cattle-market')!.resources.cattle).toBe(1)
    response = session.resolveChoice(0, 'confirm', {
      zones: [{ id: 'owner-pasture', zoneType: 'pasture', animalType: 'cattle', animalCount: 1 }],
    })
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.stateId === 'wait' && response.interaction.request.kind).toBe('animal-reorg')
    expect(response.state.players[0]!.resources.cattle).toBe(2)
    expectCardEffectBeforeHostCollect(response, { cardId: CARD_ID, spaceId: 'cattle-market', type: 'resource.moved' })
    response = session.resolveChoice(0, 'confirm', {
      zones: [{ id: 'owner-pasture', zoneType: 'pasture', animalType: 'cattle', animalCount: 2 }],
    })

    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.stateId === 'wait' && response.interaction.request.kind).toBe('confirm-next-player')
    expect(response.state.players[0]!.pastures[0]).toMatchObject({ animalType: 'cattle', animalCount: 2 })
  })

  it('gives the owner nothing when an opponent uses Cattle Market', () => {
    const response = make(1).takeAction(1, 'cattle-market')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.cattle).toBe(0)
    expect(response.state.events.some(event => event.sourceCardId === CARD_ID)).toBe(false)
  })
})
