import { captureStateWithHistory } from '../../shared/session/history-streams'
import { assertUndoRestored, undoRuleSnapshot } from './_helpers/session-assertions'
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
    ? [{ id: 'boar-pasture', tiles: [{ row: 0, col: 1 }, { row: 0, col: 2 }], animalType: 'boar', animalCount: boar }]
    : [{ id: 'boar-pasture', tiles: [{ row: 0, col: 1 }], animalType: 'boar', animalCount: boar }]
  const edges = capacity
    ? ['H-0-1', 'H-0-2', 'H-1-1', 'H-1-2', 'V-0-1', 'V-0-3']
    : ['H-0-1', 'H-1-1', 'V-0-1', 'V-0-2']
  player.fenceSegments = edges.map(edge => ({ edge, type: 'fence', source: { kind: 'own', ownerPlayerId: player.id } }))
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

describe("A141 command boundaries", () => {
  const TURNIP = 'A141_TurnipFarmer'
  function save(id: string, value: unknown) {
    sessionEvidence.record(id, value)
  }
  function ok(r: SessionResponse) {
    assert.equal(r.ok, true, r.error)
    return r
  }
  function setup(round = 5, configure: (state: GameState) => void = () => {
  }, played = true) {
    const s = sessionEvidence.track(createWorkSession({ seed: 4242, options: { playerCount: 3 }, configure(state) {
        state.round = round
        state.actionSpaces.find(a => a.id === 'reed-bank')!.resources.reed = 1
        for (const p of state.players)
          Object.assign(p.resources, { food: 60, wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0 })
        state.players[0]!.occupationPlayed = played ? [TURNIP] : []
        state.players[0]!.occupationHand = played ? ['__test_placeholder__'] : [TURNIP, 'A110_Roughcaster']
        configure(state)
      } }))
    return s
  }
  const beforeAction = new WeakMap<GameSession, { rules: string; interaction: string; actor: number }>()
  function turn(s: GameSession, actor: number, space: string) {
    let r = s.getState()
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player')
      r = confirmNext(s, r)
    assert.equal(r.interaction.stateId, 'idle')
    assert.equal(r.state.currentPlayerIndex, actor)
    beforeAction.set(s, { rules: undoRuleSnapshot(r), interaction: JSON.stringify(r.interaction), actor })
    return ok(s.takeAction(actor, space))
  }
  function undo(s: GameSession) {
    const before = beforeAction.get(s)
    assert.ok(before)
    const undone = s.undoAction()
    assertUndoRestored(before.rules, undone)
    assertUndoRestored(before.rules, s.getState())
    assert.equal(JSON.stringify(undone.interaction), before.interaction)
    assert.equal(JSON.stringify(s.getState().interaction), before.interaction)
    assert.equal(undone.interaction.stateId, 'idle')
    assert.equal(undone.state.currentPlayerIndex, before.actor)
    return undone
  }
  function finish(s: GameSession, r: SessionResponse) {
    for (let n = 0; n < 24 && r.interaction.stateId === 'wait' && r.interaction.request.kind !== 'confirm-next-player'; n++) {
      const i = r.interaction
      if (i.request.kind === 'confirm-player-switch')
        r = ok(s.resolveChoice(i.request.fromPlayerIndex, 'confirm'))
      else if (i.request.kind === 'feed')
        r = ok(s.resolveChoice(i.playerIndex, 'confirm', { selections: [] }))
      else if (i.request.kind === 'animal-reorg')
        r = ok(s.resolveChoice(i.playerIndex, 'confirm', { zones: i.request.zones }))
      else {
        if (i.request.kind === 'choice' && i.promptKey === 'ui.interactionChooseOccupation' && i.playerIndex !== 0) {
          const other = i.request.options.find(o => o.value === 'A110_Roughcaster')
          assert.ok(other)
          r = ok(s.resolveChoice(i.playerIndex, other.value))
          continue
        }
        assert.fail(JSON.stringify(i))
      }
    }
    assert.ok(r.interaction.stateId === 'idle' || (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player'), JSON.stringify(r.interaction))
    return r
  }
  function end(s: GameSession, spaces: string[]) {
    let r = s.getState()
    const nextRound = r.state.round + 1
    for (const [n, space] of spaces.entries()) {
      const actor = n % r.state.players.length
      r = turn(s, actor, space)
      if (n < spaces.length - 1)
        r = finish(s, r)
    }
    assert.equal(r.state.roundPhase, 'work')
    assert.equal(r.state.players[0]!.resources.vegetable, 0)
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player')
      r = confirmNext(s, r)
    save('before-phase-choice', r)
    const pending = r
    const done = finish(s, r)
    assert.equal(done.interaction.stateId, 'idle', JSON.stringify(done.interaction))
    assert.equal(done.state.currentPlayerIndex, 0)
    assert.equal(done.state.roundPhase, 'work')
    assert.equal(done.state.round, nextRound)
    return { pending, r: done }
  }
  const SIX = ['grain-seeds', 'day-laborer', 'forest', 'reed-bank', 'clay-pit', 'fishing']
  it("both own and opponent occupied spaces grant vegetable only at return home", () => {
    for (const spaces of [SIX, ['day-laborer', 'forest', 'grain-seeds', 'reed-bank', 'clay-pit', 'fishing']]) {
      const s = setup()
      turn(s, 0, spaces[0]!)
      assert.equal(s.getState().state.players[0]!.resources.vegetable, 0)
      const undone = undo(s)
      assert.equal(undone.state.players[0]!.resources.vegetable, 0)
      const { r } = end(s, spaces)
      assert.equal(r.state.round, 6)
      assert.equal(r.state.players[0]!.resources.vegetable, 1)
      assert.equal(r.state.players[1]!.resources.vegetable, 0)
      for (const actual of [r, s.getState()])
        assert.deepEqual(actual.state.players.map(player => player.resources.vegetable), [1, 0, 0])
      save(`A141-N1-${spaces[0]}`, r)
    }
  })
  it("either or both unoccupied named spaces cannot award vegetable", () => {
    for (const spaces of [['grove', 'day-laborer', 'forest', 'reed-bank', 'clay-pit', 'fishing'], ['grain-seeds', 'hollow', 'forest', 'reed-bank', 'clay-pit', 'fishing'], ['grove', 'hollow', 'forest', 'reed-bank', 'clay-pit', 'fishing']]) {
      const s = setup()
      const { r } = end(s, spaces)
      assert.equal(r.state.players[0]!.resources.vegetable, 0)
      const baseline = { wood: 0, clay: 0, reed: 0, stone: 0, food: 60, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 }
      const owner = spaces[0] === 'grain-seeds' ? { ...baseline, grain: 1, reed: 1 } : { ...baseline, wood: 2, reed: 1 }
      const opponent = spaces[1] === 'day-laborer' ? { ...baseline, clay: 1, food: 62 } : { ...baseline, clay: 2 }
      for (const actual of [r, s.getState()])
        assert.deepEqual(actual.state.players.map(player => player.resources), [owner, opponent, { ...baseline, wood: 3, food: 61 }])
      save(`A141-N2-${spaces[0]}-${spaces[1]}`, r)
    }
  })
  it("hand never grants return home reward and natural harvest does not duplicate", () => {
    const handSession = setup(5, undefined, false)
    const hand = end(handSession, SIX).r
    assert.equal(hand.state.players[0]!.resources.vegetable, 0)
    const baseline = { wood: 0, clay: 0, reed: 0, stone: 0, food: 60, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 }
    for (const actual of [hand, handSession.getState()])
      assert.deepEqual(actual.state.players.map(player => player.resources), [{ ...baseline, grain: 1, reed: 1 }, { ...baseline, clay: 1, food: 62 }, { ...baseline, wood: 3, food: 61 }])
    const harvestSession = setup(4)
    const harvested = end(harvestSession, SIX).r
    assert.equal(harvested.state.round, 5)
    assert.equal(harvested.state.players[0]!.resources.vegetable, 1)
    assert.equal(harvestSession.getState().state.players[0]!.resources.vegetable, 1)
    const feedingSession = setup(4, state => { state.players[0]!.resources.food = 0 })
    let work = ok(feedingSession.getState())
    for (const [index, space] of SIX.entries()) {
      const actor = index % 3
      work = turn(feedingSession, actor, space)
      assert.ok(work.interaction.stateId === 'wait')
      assert.deepEqual(work.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: (actor + 1) % 3 })
      assert.equal(work.interaction.playerIndex, actor)
      assert.equal(work.state.roundPhase, 'work')
      assert.equal(work.state.players[0]!.resources.vegetable, 0)
    }
    const feeding = ok(confirmNext(feedingSession, work))
    assert.ok(feeding.interaction.stateId === 'wait' && feeding.interaction.request.kind === 'feed')
    assert.equal(feeding.interaction.playerIndex, 0)
    assert.equal(feeding.state.currentPlayerIndex, 0)
    assert.equal(feeding.state.round, 4)
    assert.equal(feeding.state.roundPhase, 'feeding')
    assert.equal(feeding.state.completedFeedingPhases, 0)
    assert.equal(feeding.interaction.request.foodUsed, 0)
    assert.equal(feeding.interaction.request.remaining, 4)
    assert.deepEqual(feeding.state.players.map(player => player.resources.vegetable), [1, 0, 0])
    assert.equal(feeding.state.players[0]!.resources.grain, 1)
    const vegetable = feeding.interaction.request.exchangeCatalog?.find(exchange => exchange.sourceId === '__basic__' && exchange.from.vegetable === 1 && exchange.to.food === 1)
    assert.ok(vegetable)
    const fed = ok(feedingSession.resolveChoice(0, 'confirm', { selections: [{ sourceId: vegetable.sourceId, exchangeIndex: vegetable.exchangeIndex, count: 1 }] }))
    assert.equal(fed.interaction.stateId, 'idle')
    assert.equal(fed.state.currentPlayerIndex, 0)
    assert.equal(fed.state.round, 5)
    assert.equal(fed.state.roundPhase, 'work')
    assert.equal(fed.state.completedFeedingPhases, 1)
    assert.deepEqual([fed.state.players[0]!.resources.food, fed.state.players[0]!.resources.grain, fed.state.players[0]!.resources.vegetable, fed.state.players[0]!.resources.begging], [0, 1, 0, 3])
    assert.deepEqual(fed.state.players.slice(1).map(player => player.resources.food), [58, 57])
    const live = feedingSession.getState()
    assert.deepEqual({ state: captureStateWithHistory(live.state), interaction: live.interaction, scores: live.scores }, { state: captureStateWithHistory(fed.state), interaction: fed.interaction, scores: fed.scores })
    save('A141-N3-before-feeding', { work, feeding, fed })
    save('A141-N3', { hand, harvested })
  })
})

describe("A157 command boundaries", () => {
  const CARD = 'A157_Bohemian'
  function save(id: string, value: unknown) {
    sessionEvidence.record(id, value)
  }
  function ok(r: SessionResponse) {
    assert.equal(r.ok, true, r.error)
    return r
  }
  function setup(round = 5, configure: (state: GameState) => void = () => {
  }, played = true) {
    const s = sessionEvidence.track(createWorkSession({ seed: 4242, options: { playerCount: 4 }, configure(state) {
        state.round = round
        state.actionSpaces.find(a => a.id === 'reed-bank')!.resources.reed = 1
        for (const p of state.players)
          Object.assign(p.resources, { food: 60, wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0 })
        state.players[0]!.occupationPlayed = played ? [CARD] : []
        state.players[0]!.occupationHand = played ? ['__test_placeholder__'] : [CARD]
        for (const other of state.players.slice(1))
          other.occupationHand = ['A110_Roughcaster']
        configure(state)
      } }))
    return s
  }
  const beforeAction = new WeakMap<GameSession, { rules: string; interaction: string; actor: number }>()
  function turn(s: GameSession, actor: number, space: string) {
    let r = s.getState()
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player')
      r = confirmNext(s, r)
    assert.equal(r.interaction.stateId, 'idle')
    assert.equal(r.state.currentPlayerIndex, actor)
    beforeAction.set(s, { rules: undoRuleSnapshot(r), interaction: JSON.stringify(r.interaction), actor })
    return ok(s.takeAction(actor, space))
  }
  function undo(s: GameSession) {
    const before = beforeAction.get(s)
    assert.ok(before)
    const undone = s.undoAction()
    assertUndoRestored(before.rules, undone)
    assertUndoRestored(before.rules, s.getState())
    assert.equal(JSON.stringify(undone.interaction), before.interaction)
    assert.equal(JSON.stringify(s.getState().interaction), before.interaction)
    assert.equal(undone.interaction.stateId, 'idle')
    assert.equal(undone.state.currentPlayerIndex, before.actor)
    return undone
  }
  function finish(s: GameSession, r: SessionResponse) {
    for (let n = 0; n < 24 && r.interaction.stateId === 'wait' && r.interaction.request.kind !== 'confirm-next-player'; n++) {
      const i = r.interaction
      if (i.request.kind === 'confirm-player-switch')
        r = ok(s.resolveChoice(i.request.fromPlayerIndex, 'confirm'))
      else if (i.request.kind === 'feed')
        r = ok(s.resolveChoice(i.playerIndex, 'confirm', { selections: [] }))
      else if (i.request.kind === 'animal-reorg')
        r = ok(s.resolveChoice(i.playerIndex, 'confirm', { zones: i.request.zones }))
      else {
        if (i.request.kind === 'choice' && i.promptKey === 'ui.interactionChooseOccupation' && i.playerIndex !== 0) {
          const other = i.request.options.find(o => o.value === 'A110_Roughcaster')
          assert.ok(other)
          r = ok(s.resolveChoice(i.playerIndex, other.value))
          continue
        }
        assert.fail(JSON.stringify(i))
      }
    }
    assert.ok(r.interaction.stateId === 'idle' || (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player'), JSON.stringify(r.interaction))
    return r
  }
  function end(s: GameSession, spaces: string[]) {
    let r = s.getState()
    const nextRound = r.state.round + 1
    for (const [n, space] of spaces.entries()) {
      const actor = n % r.state.players.length
      r = turn(s, actor, space)
      if (n < spaces.length - 1)
        r = finish(s, r)
    }
    assert.equal(r.state.roundPhase, 'work')
    assert.equal(r.state.players[0]!.resources.food, 60)
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player')
      r = confirmNext(s, r)
    save('before-phase-choice', r)
    const pending = r
    const done = finish(s, r)
    assert.equal(done.interaction.stateId, 'idle', JSON.stringify(done.interaction))
    assert.equal(done.state.currentPlayerIndex, 0)
    assert.equal(done.state.roundPhase, 'work')
    assert.equal(done.state.round, nextRound)
    return { pending, r: done }
  }
  const EIGHT = ['grain-seeds', 'day-laborer', 'forest', 'reed-bank', 'clay-pit', 'fishing', 'hollow-4', 'traveling-players']
  function play(spaces: string[], played = true, round = 5) {
    const s = setup(round, undefined, played)
    const { r } = end(s, spaces)
    return { s, r }
  }
  it("actual returning home with both Lessons empty grants exactly one owner food", () => {
    const on = play(EIGHT), off = play(EIGHT, false)
    assert.equal(on.r.state.round, 6)
    assert.equal(on.r.state.players[0]!.resources.food - off.r.state.players[0]!.resources.food, 1)
    for (const actor of [1, 2, 3])
      assert.equal(on.r.state.players[actor]!.resources.food, off.r.state.players[actor]!.resources.food)
    const baseline = { wood: 0, clay: 0, reed: 0, stone: 0, food: 60, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 }
    for (const actual of [on.r, on.s.getState()])
      assert.deepEqual(actual.state.players.map(player => player.resources), [{ ...baseline, clay: 1, grain: 1, food: 61 }, { ...baseline, food: 63 }, { ...baseline, wood: 3, clay: 2 }, { ...baseline, reed: 1, food: 61 }])
    for (const actual of [off.r, off.s.getState()])
      assert.deepEqual(actual.state.players.map(player => player.resources), [{ ...baseline, clay: 1, grain: 1 }, { ...baseline, food: 63 }, { ...baseline, wood: 3, clay: 2 }, { ...baseline, reed: 1, food: 61 }])
    save('A157-N1', { on: on.r, off: off.r })
  })
  it("either empty Lessons space grants one food and both occupied grant none", () => {
    for (const mode of ['lessons', 'lessons-4', 'both']) {
      const spaces = [...EIGHT]
      spaces[1] = mode === 'lessons-4' ? 'lessons-4' : 'lessons'
      if (mode === 'both')
        spaces[2] = 'lessons-4'
      const on = play(spaces), off = play(spaces, false)
      assert.equal(on.r.state.players[0]!.resources.food - off.r.state.players[0]!.resources.food, mode === 'both' ? 0 : 1)
      const expectedOn = mode === 'lessons' ? [61, 61, 60, 61]
        : mode === 'lessons-4' ? [61, 60, 60, 61] : [60, 61, 59, 61]
      const expectedOff = mode === 'lessons' ? [60, 61, 60, 61]
        : mode === 'lessons-4' ? [60, 60, 60, 61] : [60, 61, 59, 61]
      for (const actual of [on.r, on.s.getState()])
        assert.deepEqual(actual.state.players.map(player => player.resources.food), expectedOn)
      for (const actual of [off.r, off.s.getState()])
        assert.deepEqual(actual.state.players.map(player => player.resources.food), expectedOff)
      save(`A157-N2-${mode}`, { on: on.r, off: off.r })
    }
  })
  it("work placement cannot grant early reward and normal harvest does not duplicate", () => {
    const s = setup(4)
    const early = turn(s, 0, 'grain-seeds')
    assert.equal(early.state.players[0]!.resources.food, 60)
    const undone = undo(s)
    assert.equal(undone.state.players[0]!.resources.food, 60)
    const retried = turn(s, 0, 'grain-seeds')
    assert.equal(retried.state.players[0]!.resources.food, 60)
    assert.ok(retried.interaction.stateId === 'wait', JSON.stringify(retried.interaction))
    assert.deepEqual(retried.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 })
    assert.equal(retried.interaction.playerIndex, 0)
    assert.equal(retried.state.currentPlayerIndex, 0)
    assert.equal(retried.state.roundPhase, 'work')
    const on = play(EIGHT, true, 4), off = play(EIGHT, false, 4)
    assert.equal(on.r.state.round, 5)
    assert.equal(on.r.state.players[0]!.resources.food - off.r.state.players[0]!.resources.food, 1)
    assert.equal(on.s.getState().state.players[0]!.resources.food, on.r.state.players[0]!.resources.food)
    const baseline = { wood: 0, clay: 0, reed: 0, stone: 0, food: 60, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 }
    for (const actual of [on.r, on.s.getState()])
      assert.deepEqual(actual.state.players.map(player => player.resources), [{ ...baseline, clay: 1, grain: 1, food: 57 }, { ...baseline, food: 59 }, { ...baseline, wood: 3, clay: 2, food: 56 }, { ...baseline, reed: 1, food: 57 }])
    for (const actual of [off.r, off.s.getState()])
      assert.deepEqual(actual.state.players.map(player => player.resources), [{ ...baseline, clay: 1, grain: 1, food: 56 }, { ...baseline, food: 59 }, { ...baseline, wood: 3, clay: 2, food: 56 }, { ...baseline, reed: 1, food: 57 }])
    const feedingSession = setup(4, state => { state.players[0]!.resources.food = 0 })
    let work = ok(feedingSession.getState())
    for (const [index, space] of EIGHT.entries()) {
      const actor = index % 4
      work = turn(feedingSession, actor, space)
      assert.ok(work.interaction.stateId === 'wait')
      assert.deepEqual(work.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: (actor + 1) % 4 })
      assert.equal(work.interaction.playerIndex, actor)
      assert.equal(work.state.roundPhase, 'work')
      assert.equal(work.state.players[0]!.resources.food, 0)
    }
    const feeding = ok(confirmNext(feedingSession, work))
    assert.ok(feeding.interaction.stateId === 'wait' && feeding.interaction.request.kind === 'feed')
    assert.equal(feeding.interaction.playerIndex, 0)
    assert.equal(feeding.state.currentPlayerIndex, 0)
    assert.equal(feeding.state.round, 4)
    assert.equal(feeding.state.roundPhase, 'feeding')
    assert.equal(feeding.state.completedFeedingPhases, 0)
    assert.equal(feeding.interaction.request.foodUsed, 1)
    assert.equal(feeding.interaction.request.remaining, 3)
    assert.equal(feeding.state.players[0]!.resources.food, 0)
    assert.equal(feeding.state.players[0]!.resources.grain, 1)
    const grain = feeding.interaction.request.exchangeCatalog?.find(exchange => exchange.sourceId === '__basic__' && exchange.from.grain === 1 && exchange.to.food === 1)
    assert.ok(grain)
    const fed = ok(feedingSession.resolveChoice(0, 'confirm', { selections: [{ sourceId: grain.sourceId, exchangeIndex: grain.exchangeIndex, count: 1 }] }))
    assert.equal(fed.interaction.stateId, 'idle')
    assert.equal(fed.state.currentPlayerIndex, 0)
    assert.equal(fed.state.round, 5)
    assert.equal(fed.state.roundPhase, 'work')
    assert.equal(fed.state.completedFeedingPhases, 1)
    assert.deepEqual([fed.state.players[0]!.resources.food, fed.state.players[0]!.resources.grain, fed.state.players[0]!.resources.begging], [0, 0, 2])
    assert.deepEqual(fed.state.players.slice(1).map(player => player.resources.food), [59, 56, 57])
    const live = feedingSession.getState()
    assert.deepEqual({ state: captureStateWithHistory(live.state), interaction: live.interaction, scores: live.scores }, { state: captureStateWithHistory(fed.state), interaction: fed.interaction, scores: fed.scores })
    save('A157-N3-before-feeding', { work, feeding, fed })
    save('A157-N3', { early, undone, on: on.r, off: off.r })
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
    assert.ok(r.interaction.stateId === 'wait')
    assert.deepEqual(r.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 })
    assert.equal(r.interaction.playerIndex, 0)
    assert.equal(r.state.currentPlayerIndex, 0)
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
      assert.ok(r.interaction.stateId === 'wait')
      assert.deepEqual(r.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 })
      assert.equal(r.interaction.playerIndex, 0)
      assert.equal(r.state.currentPlayerIndex, 0)
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
    assert.ok(first.interaction.stateId === 'wait')
    assert.deepEqual(first.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 })
    assert.equal(first.interaction.playerIndex, 0)
    assert.equal(first.state.currentPlayerIndex, 0)
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

    assert.ok(r.interaction.stateId === 'wait')
    assert.deepEqual(r.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 })
    assert.equal(r.interaction.playerIndex, 0)
    assert.equal(r.state.currentPlayerIndex, 0)
    sessionEvidence.record('A125-N3', { first, r })
  })
  it("invalid choice and undo cannot retain a duplicate purchase reward", () => {
    const s = setup(state => material(state, 'clay'))
    const observedBeforeUndo = s.getState()
    const beforeUndo = {
      ...observedBeforeUndo,
      state: captureStateWithHistory(observedBeforeUndo.state),
      interaction: structuredClone(observedBeforeUndo.interaction),
      scores: structuredClone(observedBeforeUndo.scores),
    }
    const beforeRules = undoRuleSnapshot(beforeUndo)
    const first = play(s, PRIEST)
    assert.ok(first.interaction.stateId === 'wait')
    assert.deepEqual(first.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 })
    assert.equal(first.interaction.playerIndex, 0)
    assert.equal(first.state.currentPlayerIndex, 0)
    assertRejectedUnchanged(s, () => s.resolveChoice(0, PRIEST))
    assert.equal(first.state.players[0]!.resources.clay, 3)
    assert.ok(first.state.players[0]!.occupationPlayed.includes(PRIEST))
    const undone = ok(s.undoAction())
    assertUndoRestored(beforeRules, undone)
    const liveAfterUndo = s.getState()
    assertUndoRestored(beforeRules, liveAfterUndo)
    assert.deepEqual(liveAfterUndo.interaction, beforeUndo.interaction)
    assert.equal(liveAfterUndo.state.currentPlayerIndex, 0)
    assert.deepEqual(undone.interaction, beforeUndo.interaction)
    assert.equal(undone.interaction.stateId, 'idle')
    assert.equal(undone.state.currentPlayerIndex, 0)
    assert.deepEqual((['clay', 'reed', 'stone'] satisfies Array<'clay' | 'reed' | 'stone'>).map(k => undone.state.players[0]!.resources[k]), [0, 0, 0])
    assert(undone.state.players[0]!.occupationHand.includes(PRIEST))
    const retry = play(s, PRIEST)
    assert.ok(retry.interaction.stateId === 'wait')
    assert.deepEqual(retry.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 })
    assert.equal(retry.interaction.playerIndex, 0)
    assert.equal(retry.state.currentPlayerIndex, 0)
    assert.equal(retry.state.players[0]!.resources.clay, 3)

    sessionEvidence.record('A125-N4', { first, undone, retry })
  })
})
