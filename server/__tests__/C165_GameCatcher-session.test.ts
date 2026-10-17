import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/C/C165_GameCatcher'
import '../../shared/cards/A/A100_Curator'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit57Phase from './_helpers/audit/ae-negative-57-phase'

const CARD_ID = 'C165_GameCatcher'
const FILLER = '__test_placeholder__'

const setup = ({ round = 1, food = 6, playerCount = 4 } = {}) => {
  const session = new GameSession(5165, undefined, { playerCount })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = round
  state.roundPhase = 'work'
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.improvements = []
    player.cardStates = {}
    player.resources = {
      ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0,
      vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    }
  })
  const owner = state.players[0]!
  owner.occupationHand = [CARD_ID]
  owner.resources.food = food
  owner.pastures = [
    {
      id: 'game-catcher-boar', size: 1, tiles: [{ row: 0, col: 2 }], stables: 0,
      animalType: null, animalCount: 0,
    },
    {
      id: 'game-catcher-cattle', size: 1, tiles: [{ row: 0, col: 3 }], stables: 0,
      animalType: null, animalCount: 0,
    },
  ]
  session.loadState(state)
  return session
}

const settleAnimals = (session: GameSession, response: SessionResponse) => {
  if (response.interaction.stateId !== 'wait'
    || response.interaction.request.kind !== 'animal-reorg') return response
  const zones = structuredClone(response.interaction.request.zones)
  const boar = zones.find((zone) => zone.id === 'game-catcher-boar')
  const cattle = zones.find((zone) => zone.id === 'game-catcher-cattle')
  expect(boar).toBeDefined()
  expect(cattle).toBeDefined()
  Object.assign(boar!, { animalType: 'boar', animalCount: 1 })
  Object.assign(cattle!, { animalType: 'cattle', animalCount: 1 })
  return session.resolveChoice(response.interaction.playerIndex, 'confirm', { zones })
}

const playGameCatcher = (session: GameSession) => {
  let response = session.takeAction(0, 'lessons')
  expect(response.ok, response.error).toBe(true)
  if (response.state.players[0]!.occupationHand.includes(CARD_ID)) {
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return response
    const card = response.interaction.request.options?.find((option) => option.value === CARD_ID)
    expect(card, JSON.stringify(response.interaction)).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, card!.value)
  }
  return settleAnimals(session, response)
}

const expectAnimals = (response: SessionResponse) => {
  const owner = response.state.players[0]!
  expect(owner.resources).toMatchObject({ boar: 1, cattle: 1 })
  expect(owner.pastures).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: 'game-catcher-boar', animalType: 'boar', animalCount: 1 }),
    expect.objectContaining({ id: 'game-catcher-cattle', animalType: 'cattle', animalCount: 1 }),
  ]))
}

describe('C165 Game Catcher parity', () => {
  it('C165 S1: in round one Game Catcher pays six food and gains one cattle and one boar', () => {
    const response = playGameCatcher(setup())

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(0)
    expectAnimals(response)
  })

  for (const [round, cost] of [[4, 6], [5, 5], [8, 4], [10, 3], [12, 2], [14, 1]]) {
    it(`C165 S2 round ${round}: Game Catcher costs ${cost} food for the remaining harvests`, () => {
      const response = playGameCatcher(setup({ round, food: cost }))

      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
      expect(response.state.players[0]!.resources.food).toBe(0)
      expectAnimals(response)
    })
  }

  it.each([
    { food: 4, earlier: false, discount: false, allowed: false },
    { food: 5, earlier: false, discount: false, allowed: true },
    { food: 5, earlier: true, discount: false, allowed: false },
    { food: 6, earlier: true, discount: false, allowed: true },
    { food: 5, earlier: true, discount: true, allowed: true },
  ])('C165 S3: reserves the mandatory food after actual lesson costs: %j', (scenario) => {
    const session = setup({ round: 5, food: scenario.food, playerCount: 2 })
    const state = session.getState().state
    const owner = state.players[0]!
    owner.occupationHand = [CARD_ID, 'A100_Curator', 'A116_WoodCutter']
    owner.occupationPlayed = scenario.earlier ? ['__test_previous__'] : []
    if (scenario.discount) owner.activeModifiers = [{ type: 'bonus', appliesTo: ['occupation'], discount: { food: 1 } }]
    session.loadState(state)
    const offered = session.takeAction(0, 'lessons')
    expect(offered.ok, offered.error).toBe(true)
    expect(offered.interaction.request.options?.some((option) => option.value === CARD_ID)).toBe(scenario.allowed)
    const response = session.resolveChoice(0, CARD_ID)
    expect(response.ok).toBe(scenario.allowed)
    expect(response.state.players[0]!.occupationPlayed.includes(CARD_ID)).toBe(scenario.allowed)
    expect(response.state.players[0]!.resources.food).toBe(scenario.allowed ? 0 : scenario.food)
  })

  it('C165 S4: Game Catcher deducts only the current cost when extra food is available', () => {
    const response = playGameCatcher(setup({ round: 10, food: 8 }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(5)
    expectAnimals(response)
  })

  it('C165 S5: a fixed three-player hand can still play Game Catcher', () => {
    const response = playGameCatcher(setup({ playerCount: 3 }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(0)
    expectAnimals(response)
  })
})

describe('ae-negative-57-phase', () => {
  const { sessions, ok, save, make, finish, play, choose, counts } = audit57Phase
  afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
  it('C165 N1 actual purchase in rounds one four five thirteen and fourteen pays six six five two or one food for one boar and cattle', () => {
    for (const [round, food] of [[1, 6], [4, 6], [5, 5], [13, 2], [14, 1]]) {
      const session = make('C165_GameCatcher', state => { state.players[0]!.resources.food = food; state.players[0]!.stableTiles = [{ row: 0, col: 1 }] }, false, round), response = finish(session, play(session, 'C165_GameCatcher'))
      assert.equal(response.state.players[0]!.resources.food, 0); assert.deepEqual(counts(response), [0, 1, 1]); assert.deepEqual(response.state.players.slice(1).map(player => player.resources.cattle + player.resources.boar), [0, 0, 0])
      save(`C165-N1-${round}`, response)
    }
  })
  it('C165 N2 ordinary second occupation fee is additional to remaining harvest payment and combined insufficiency rejects before a legal alternative', () => {
    for (const enough of [true, false]) {
      const session = make('C165_GameCatcher', state => { const p = state.players[0]!; p.occupationPlayed = ['A110_Roughcaster']; p.occupationHand = ['C165_GameCatcher', 'A125_Priest', 'A133_Braggart']; p.resources.food = enough ? 6 : 5; p.stableTiles = [{ row: 0, col: 1 }] }, false, 5)
      if (enough) { const response = finish(session, play(session, 'C165_GameCatcher')); assert.equal(response.state.players[0]!.resources.food, 0); assert.deepEqual(counts(response), [0, 1, 1]); save('C165-N2-enough', response) }
      else { const pending = ok(session.takeAction(0, 'lessons')), rejected = assertRejectedUnchanged(session, () => session.resolveChoice(0, 'C165_GameCatcher')), response = finish(session, choose(session, pending, option => option.value === 'A125_Priest')); assert.deepEqual(counts(response), [0, 0, 0]); assert.ok(response.state.players[0]!.occupationHand.includes('C165_GameCatcher')); assert.equal(response.state.players[0]!.resources.food, 4); save('C165-N2-insufficient', { pending, rejected, response }) }
    }
  })
  it('C165 N3 whole paid purchase undo restores all food hand and animal holders before one replay', () => {
    const session = make('C165_GameCatcher', state => { state.players[0]!.resources.food = 5; state.players[0]!.stableTiles = [{ row: 0, col: 1 }] }, false, 5), response = finish(session, play(session, 'C165_GameCatcher')), undone = ok(session.undoAction()), replay = finish(session, play(session, 'C165_GameCatcher'))
    assert.equal(undone.state.players[0]!.resources.food, 5); assert.deepEqual(counts(undone), [0, 0, 0]); assert.ok(undone.state.players[0]!.occupationHand.includes('C165_GameCatcher')); assert.equal(replay.state.players[0]!.resources.food, 0); assert.deepEqual(counts(replay), [0, 1, 1])
    save('C165-N3', { response, undone, replay })
  })
})
