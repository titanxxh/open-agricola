import { describe, expect, it } from 'vitest'
import { type GameSession, type SessionResponse } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { createPlayerActionSpaces } from '../../shared/cards/player-action-space'
import { markAllWorkersUsed, setActiveWorkerCount, setWorkersAtHome } from '../../shared/domain/player'
import { type GameState, type Resource } from '../../shared/contract/types'
import '../../shared/cards/A/A125_Priest'
import '../../shared/cards/A/A141_TurnipFarmer'
import '../../shared/cards/A/A157_Bohemian'
import '../../shared/cards/A/A162_ForestTallyman'
import '../../shared/cards/A/A165_PigBreeder'
import assert from 'node:assert/strict'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, confirmNext, getChoiceOptions } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'

const sessionEvidence = createScenarioEvidence(import.meta.url)

type CardId =
  | 'A125_Priest'
  | 'A141_TurnipFarmer'
  | 'A157_Bohemian'
  | 'A162_ForestTallyman'
  | 'A165_PigBreeder'

const FILLER = '__test_placeholder__'

const setupOccupation = (cardId: CardId, {
  playerCount = 2,
  played = false,
  round = 14,
  resources = {},
}: {
  playerCount?: number
  played?: boolean
  round?: number
  resources?: Partial<Resource>
} = {}) => {
  const session = sessionEvidence.track(createWorkSession({ seed: 4042, options: { playerCount } }))
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = round
  state.roundPhase = 'work'
  state.players.forEach((player) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    setWorkersAtHome(state, player, 2)
  })
  const player = state.players[0]!
  player.occupationHand = played ? [FILLER] : [cardId]
  player.occupationPlayed = played ? [cardId] : []
  player.resources = {
    ...player.resources,
    wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0,
    sheep: 0, boar: 0, cattle: 0,
    ...resources,
  }
  session.loadState(state)
  return session
}

const playOccupation = (session: GameSession, cardId: CardId) => {
  let response = session.takeAction(0, 'lessons')
  if (response.interaction.stateId !== 'wait') return response
  const option = getChoiceOptions(response)?.find((candidate) => candidate.value === cardId)
  if (option) response = session.resolveChoice(0, option.value)
  return response
}

const occupy = (state: GameState, actionId: string, playerIndex: number) => {
  const space = state.actionSpaces.find((candidate) => candidate.id === actionId)
  if (!space) throw new Error(`${actionId} missing`)
  const player = state.players[playerIndex]!
  space.takenBy = [{ playerId: player.id, workerId: player.workers[0]!.id }]
}

const setupReturnHome = (cardId: CardId, playerCount: number, occupied: string[]) => {
  const session = setupOccupation(cardId, { playerCount, played: true, round: 3 })
  const state = session.getState().state
  state.players.forEach((player) => {
    markAllWorkersUsed(state, player)
    setActiveWorkerCount(player, 2)
    player.resources.food = 20
  })
  occupied.forEach((actionId, index) => occupy(state, actionId, Math.min(index + 1, playerCount - 1)))
  session.loadState(state)
  return session
}

describe('A125 Priest parity', () => {
  it('A125 S1: playing Priest in a two-room clay house gains three clay, two reed, and two stone', () => {
    const session = setupOccupation('A125_Priest')
    session.state.players[0]!.houseType = 'clay'
    session.loadState(session.state)

    const response = playOccupation(session, 'A125_Priest')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain('A125_Priest')
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 3, reed: 2, stone: 2 })
  })

  it('A125 S2: playing Priest in a wooden house gains no building resources', () => {
    const response = playOccupation(setupOccupation('A125_Priest'), 'A125_Priest')

    expect(response.state.players[0]!.resources).toMatchObject({ clay: 0, reed: 0, stone: 0 })
  })

  it('A125 S3: playing Priest in a three-room clay house gains no building resources', () => {
    const session = setupOccupation('A125_Priest')
    const player = session.state.players[0]!
    player.houseType = 'clay'
    player.rooms = 3
    player.roomTiles.push({ row: 0, col: 2 })
    session.loadState(session.state)

    const response = playOccupation(session, 'A125_Priest')

    expect(response.state.players[0]!.resources).toMatchObject({ clay: 0, reed: 0, stone: 0 })
  })
})

describe('A141 Turnip Farmer parity', () => {
  it('A141 S1: occupied Day Laborer and Grain Seeds grant one vegetable at return home', () => {
    const response = setupReturnHome(
      'A141_TurnipFarmer', 3, ['day-laborer', 'grain-seeds'],
    ).performRoundEnd()

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.vegetable).toBe(1)
  })

  it('A141 S2: an unoccupied Grain Seeds space prevents the return-home vegetable', () => {
    const response = setupReturnHome('A141_TurnipFarmer', 3, ['day-laborer']).performRoundEnd()

    expect(response.state.players[0]!.resources.vegetable).toBe(0)
  })
})

describe('A157 Bohemian parity', () => {
  it('A157 S1: an unoccupied Lessons space grants one food at return home', () => {
    const response = setupReturnHome('A157_Bohemian', 4, ['lessons']).performRoundEnd()

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(21)
  })

  it('A157 S2: both Lessons spaces occupied grant no food at return home', () => {
    const response = setupReturnHome('A157_Bohemian', 4, ['lessons', 'lessons-4']).performRoundEnd()

    expect(response.state.players[0]!.resources.food).toBe(20)
  })
})

const setupForestTallyman = ({ occupied = true, actor = 0 } = {}) => {
  const session = setupOccupation('A162_ForestTallyman', { playerCount: 4, played: true })
  const state = session.getState().state
  state.actionSpaces.push(...createPlayerActionSpaces(state).filter((space) =>
    !state.actionSpaces.some((existing) => existing.id === space.id),
  ))
  if (occupied) {
    occupy(state, 'forest', 1)
    occupy(state, 'clay-pit', 2)
  }
  state.currentPlayerIndex = actor
  session.loadState(state)
  return session
}

describe('A162 Forest Tallyman parity', () => {
  it('A162 S1: playing Forest Tallyman through Lessons keeps it in play', () => {
    const response = playOccupation(setupOccupation('A162_ForestTallyman', { playerCount: 4 }), 'A162_ForestTallyman')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain('A162_ForestTallyman')
    expect(response.state.actionSpaces.some((space) => space.id === 'A162_ForestTallyman')).toBe(true)
  })

  it('A162 S2: with Forest and Clay Pit occupied the owner gains two clay and three wood', () => {
    const response = setupForestTallyman().takeAction(0, 'A162_ForestTallyman')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 2, wood: 3 })
  })

  it('A162 S3: rejects Forest Tallyman while Clay Pit is unoccupied', () => {
    const session = setupForestTallyman({ occupied: false })
    expect(session.getState().actionAvailability?.A162_ForestTallyman).toBe(false)

    const response = session.takeAction(0, 'A162_ForestTallyman')

    expect(response.ok).toBe(false)
    expect(response.error).toBe('space unavailable')
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 0, wood: 0 })
    expect(response.state.actionSpaces.find((space) => space.id === 'A162_ForestTallyman')?.takenBy)
      .toHaveLength(0)
  })

  it('A162 S4: rejects a non-owner on the private Forest Tallyman space', () => {
    const session = setupForestTallyman({ actor: 3 })
    expect(session.getState().actionAvailability?.A162_ForestTallyman).toBe(false)

    const response = session.takeAction(3, 'A162_ForestTallyman')

    expect(response.ok).toBe(false)
    expect(response.error).toBe('space unavailable')
    expect(response.state.players[3]!.resources).toMatchObject({ clay: 0, wood: 0 })
    expect(response.state.actionSpaces.find((space) => space.id === 'A162_ForestTallyman')?.takenBy)
      .toEqual([])
  })
})

const setupPigBreederRound = ({ round = 12, boar = 2, capacity = true } = {}) => {
  const session = setupOccupation('A165_PigBreeder', { played: true, round })
  const state = session.getState().state
  state.players.forEach((player) => {
    markAllWorkersUsed(state, player)
    setActiveWorkerCount(player, 2)
    player.resources.food = 20
  })
  const player = state.players[0]!
  player.resources.boar = boar
  player.resources.sheep = capacity ? 0 : 1
  player.houseAnimals = Object.fromEntries(player.roomTiles.slice(0, capacity ? 0 : 1).map(tile => [`${tile.row}-${tile.col}`, 'sheep']));
  player.stableAnimals = {}
  player.pastures = capacity
    ? [{
    id: 'boar-pasture',
    tiles: [{ row: 0, col: 1 }, { row: 0, col: 2 }],
    animalType: 'boar',
    animalCount: boar
}]
    : [{
    id: 'boar-pasture',
    tiles: [{ row: 0, col: 1 }],
    animalType: 'boar',
    animalCount: boar
}]
  session.loadState(state)
  return session
}

describe('A165 Pig Breeder parity', () => {
  it('A165 S1: playing Pig Breeder immediately gains one pig', () => {
    const response = playOccupation(setupOccupation('A165_PigBreeder'), 'A165_PigBreeder')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain('A165_PigBreeder')
    expect(response.state.players[0]!.resources.boar).toBe(1)
  })

  it('A165 S2: two pigs with spare capacity breed once at the end of round 12', () => {
    const response = setupPigBreederRound().performRoundEnd()

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.boar).toBe(3)
  })

  it('A165 S3: Pig Breeder does not cause extra breeding outside round 12', () => {
    const response = setupPigBreederRound({ round: 10 }).performRoundEnd()

    expect(response.state.players[0]!.resources.boar).toBe(2)
  })

  it('A165 S4: a single pig does not breed at the end of round 12', () => {
    const response = setupPigBreederRound({ boar: 1 }).performRoundEnd()

    expect(response.state.players[0]!.resources.boar).toBe(1)
  })

  it('A165 S5: a newborn pig is discarded when no animal capacity is free', () => {
    const session = setupPigBreederRound({ capacity: false })
    let response = session.performRoundEnd()
    if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'animal-reorg') {
      response = session.resolveChoice(0, 'confirm', {
        zones: [
          { id: 'boar-pasture', zoneType: 'pasture', animalType: 'boar', animalCount: 2 },
          { id: 'house:1-0', zoneType: 'house', animalType: 'sheep', animalCount: 1 },
        ],
      })
    }

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.boar).toBe(2)
  })
})

describe("A125 command boundaries", () => {
  const PRIEST = 'A125_Priest'
  function ok(r: SessionResponse) {
    assert.equal(r.ok, true, r.error)
    return r
  }
  function setup(configure: (state: GameState) => void = () => {
  }) {
    const s = sessionEvidence.track(createWorkSession({ seed: 4242, configure(state) {
        state.round = 14
        for (const p of state.players)
          Object.assign(p.resources, { wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0, food: 40 })
        state.players[0]!.occupationHand = [PRIEST, 'A110_Roughcaster']
        configure(state)
      } }))
    return s
  }
  function play(s: GameSession, card: string) {
    let r = ok(s.takeAction(0, 'lessons'))
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice')
    assertRejectedUnchanged(s, () => s.resolveChoice(1, card))
    r = ok(s.resolveChoice(0, card))
    assert(r.state.players[0]!.occupationPlayed.includes(card))
    assert(r.state.log.length > 0)
    return r
  }
  function material(state: GameState, type: 'wood' | 'clay' | 'stone', rooms = 2) {
    const p = state.players[0]!
    p.houseType = type
    for (let n = 2; n < rooms; n++)
      p.roomTiles.push({ row: n - 2, col: 0 })
    p.rooms = rooms
  }
  it("exactly two clay rooms at actual purchase give three clay two reed two stone", () => {
    const s = setup(state => material(state, 'clay'))
    const r = play(s, PRIEST)
    assert.equal(r.state.players[0]!.resources.clay, 3)
    assert.equal(r.state.players[0]!.resources.reed, 2)
    assert.equal(r.state.players[0]!.resources.stone, 2)
    assert.equal(r.state.players[0]!.resources.food, 40)
    sessionEvidence.record('A125-N1', r)
  })
  it("wood stone and three clay rooms fail the exact house predicate", () => {
    for (const [type, rooms] of [['wood', 2], ['stone', 2], ['clay', 3]] as const) {
      const s = setup(state => material(state, type, rooms))
      const r = play(s, PRIEST)
      assert.deepEqual((['clay', 'reed', 'stone'] satisfies Array<'clay' | 'reed' | 'stone'>).map(k => r.state.players[0]!.resources[k]), [0, 0, 0])
      sessionEvidence.record(`A125-N2-${type}-${rooms}`, r)
    }
  })
  it("opponent two clay rooms and later owner renovation cannot apply retroactively", () => {
    const s = setup(state => {
      state.players[1]!.houseType = 'clay'
      state.players[0]!.resources.clay = 2
      state.players[0]!.resources.reed = 1
    })
    const first = play(s, PRIEST)
    assert.equal(first.state.players[0]!.resources.clay, 2)
    assert.equal(first.state.players[1]!.resources.clay, 0)
    confirmNext(s, first)
    confirmNext(s, ok(s.takeAction(1, 'grain-seeds')))
    let r = ok(s.takeAction(0, 'house-redevelopment'))
    if (r.interaction.stateId === 'wait' && r.interaction.promptKey === 'ui.interactionChooseRenovationTarget')
      r = ok(s.resolveChoice(0, 'clay'))
    assert.equal(r.state.players[0]!.houseType, 'clay')
    assert.equal(r.state.players[0]!.resources.clay, 0)
    assert.equal(r.state.players[0]!.resources.reed, 0)
    assert.equal(r.state.players[0]!.resources.stone, 0)
    sessionEvidence.record('A125-N3', { first, r })
  })
  it("invalid choice and undo cannot retain a duplicate purchase reward", () => {
    const s = setup(state => material(state, 'clay'))
    const first = play(s, PRIEST)
    assertRejectedUnchanged(s, () => s.resolveChoice(0, PRIEST))
    const undone = ok(s.undoAction())
    assert.deepEqual((['clay', 'reed', 'stone'] satisfies Array<'clay' | 'reed' | 'stone'>).map(k => undone.state.players[0]!.resources[k]), [0, 0, 0])
    assert(undone.state.players[0]!.occupationHand.includes(PRIEST))
    const retry = play(s, PRIEST)
    assert.equal(retry.state.players[0]!.resources.clay, 3)
    sessionEvidence.record('A125-N4', { first, undone, retry })
  })
})
