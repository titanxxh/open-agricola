import { captureStateWithHistory } from '../../shared/session/history-streams'
import { assertUndoRestored, undoRuleSnapshot, assertEmptyAccumulationRejected } from './_helpers/session-assertions'
import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setActiveWorkerCount, setWorkersAtHome } from '../../shared/domain/player'
import { recordRoundPlacement, getRoundPersonPlacementOrder } from '../../shared/cards/helpers/round-placement'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import '../../shared/cards/A/A134_FullFarmer'
import '../../shared/cards/A/A135_AnimalReeve'
import '../../shared/cards/A/A140_ShovelBearer'
import '../../shared/cards/A/A146_StorehouseSteward'
import '../../shared/cards/A/A155_Conjurer'
import '../../shared/cards/A/A163_BuildingExpert'
import assert from 'node:assert/strict'
import { type GameState, type FarmTilePosition } from '../../shared/contract/types'
import { createWorkSession } from './_helpers/session-fixtures'
import { takeMajorImprovementFromSupply } from '../../shared/cards/major/supply'
import { createScenarioEvidence } from './_helpers/scenario-evidence'
import { assertRejectedUnchanged, confirmNext, getChoiceOptions } from './_helpers/session-assertions'

const sessionEvidence = createScenarioEvidence(import.meta.url)

function assertTurnFinished(response: SessionResponse, actor: number) {
  assert.equal(response.ok, true, response.error)
  assert.equal(response.state.players.length, 4)
  assert.ok(response.interaction.stateId === 'wait', JSON.stringify(response.interaction))
  assert.deepEqual(response.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: (actor + 1) % 4 })
  assert.equal(response.interaction.playerIndex, actor)
  assert.equal(response.state.currentPlayerIndex, actor)
  assert.equal(response.state.roundPhase, 'work')
}

const FILLER = '__test_placeholder__'

const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? getChoiceOptions(response) ?? []
  : []

const setup = ({
  cardId, played = true, playerCount = 3, round = 5, resources = {},
}: {
  cardId: string
  played?: boolean
  playerCount?: number
  round?: number
  resources?: Record<string, number>
}) => {
  const session = sessionEvidence.track(createWorkSession({ seed: 7134 + round, options: { playerCount } }))
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = round
  state.roundPhase = 'work'
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.cardStates = {}
    player.pastures = []
    player.stableTiles = []
    player.resources = {
      ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0,
      vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    }
  })
  const owner = state.players[0]!
  owner.occupationHand = played ? [FILLER] : [cardId]
  owner.occupationPlayed = played ? [cardId] : []
  Object.assign(owner.resources, resources)
  session.loadState(state)
  return session
}

const playOccupation = (session: GameSession, cardId: string) => {
  let response = session.takeAction(0, 'lessons')
  if (response.interaction.stateId === 'wait' && response.state.players[0]!.occupationHand.includes(cardId)) {
    const card = options(response).find((option) => option.value === cardId)
    expect(card).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, card!.value)
  }
  return response
}

const bonusScore = (response: SessionResponse, cardId: string, playerIndex = 0) => requiredScores(response)[playerIndex]!.categories
  .find((category) => category.key === 'cardBonusVp')?.entries
  .find((entry) => entry.type === 'bonus' && entry.cardId === cardId)?.score ?? 0

describe('A134 Full Farmer parity', () => {
  const CARD_ID = 'A134_FullFarmer'

  it('A134 S1: playing Full Farmer immediately gains one wood and one clay', () => {
    const response = playOccupation(setup({ cardId: CARD_ID, played: false }), CARD_ID)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 1, clay: 1 })
  })

  const scorePasture = (animalCount: number) => {
    const session = setup({ cardId: CARD_ID, round: 14, resources: { sheep: animalCount } })
    const state = session.getState().state
    state.players[0]!.pastures = [{ id: 'full', tiles: [{ row: 0, col: 2 }], animalType: 'sheep', animalCount }]
    state.players[0]!.stableTiles = [{ row: 0, col: 2 }]
    state.players[0]!.fenceSegments = ['H-0-2', 'H-1-2', 'V-0-2', 'V-0-3'].map(edge => ({ edge, type: 'fence', source: { kind: 'own', ownerPlayerId: state.players[0]!.id } }))
    session.loadState(state)
    return bonusScore(session.getState(), CARD_ID)
  }

  it('A134 S2: each pasture filled to capacity scores one Full Farmer point', () => {
    expect(scorePasture(4)).toBe(1)
  })

  it('A134 S3: a pasture below capacity scores no Full Farmer point', () => {
    expect(scorePasture(3)).toBe(0)
  })
})

describe('A135 Animal Reeve parity', () => {
  const CARD_ID = 'A135_AnimalReeve'

  for (const { scenario, round, wood } of [
    { scenario: 'S1', round: 5, wood: 4 },
    { scenario: 'S2', round: 8, wood: 3 },
    { scenario: 'S3', round: 11, wood: 2 },
    { scenario: 'S4', round: 13, wood: 1 },
    { scenario: 'S5', round: 14, wood: 0 },
  ]) {
    it(`A135 ${scenario}: playing Animal Reeve in round ${round} gains ${wood} wood`, () => {
      const response = playOccupation(setup({ cardId: CARD_ID, played: false, round }), CARD_ID)
      expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
      expect(response.state.players[0]!.resources.wood).toBe(wood)
    })
  }

  it('A135 S6: Animal Reeve scores every player at the two three and four animal-set thresholds', () => {
    const session = setup({ cardId: CARD_ID, round: 14 })
    const state = session.getState().state
    ;[4, 3, 2].forEach((count, index) => {
      Object.assign(state.players[index]!.resources, { sheep: count, boar: count, cattle: count })
    })
    session.loadState(state)
    const response = session.getState()
    expect(bonusScore(response, CARD_ID, 0)).toBe(5)
    expect(bonusScore(response, CARD_ID, 1)).toBe(3)
    expect(bonusScore(response, CARD_ID, 2)).toBe(1)
  })
})

describe('A140 Shovel Bearer parity', () => {
  const CARD_ID = 'A140_ShovelBearer'

  it('A140 S1: Shovel Bearer is played as the first occupation in a three-player game', () => {
    expect(playOccupation(setup({ cardId: CARD_ID, played: false }), CARD_ID)
      .state.players[0]!.occupationPlayed).toContain(CARD_ID)
  })

  const collect = (action: 'clay-pit' | 'hollow', taken: number, other: number) => {
    const session = setup({ cardId: CARD_ID })
    const state = session.getState().state
    state.actionSpaces.find((space) => space.id === 'clay-pit')!.resources.clay = action === 'clay-pit' ? taken : other
    state.actionSpaces.find((space) => space.id === 'hollow')!.resources.clay = action === 'hollow' ? taken : other
    session.loadState(state)
    return session.takeAction(0, action)
  }

  it('A140 S2: using Clay Pit gains food equal to clay on Hollow', () => {
    const response = collect('clay-pit', 2, 4)
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 2, food: 4 })
  })

  it('A140 S3: using Hollow gains food equal to clay on Clay Pit', () => {
    const response = collect('hollow', 3, 5)
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 3, food: 5 })
  })

  it('A140 S4: a non-target action or empty other clay space grants no Shovel Bearer food', () => {
    expect(collect('clay-pit', 2, 0).state.players[0]!.resources.food).toBe(0)
    expect(setup({ cardId: CARD_ID }).takeAction(0, 'day-laborer').state.players[0]!.resources.food).toBe(2)
  })
})

describe('A146 Storehouse Steward parity', () => {
  const CARD_ID = 'A146_StorehouseSteward'

  it('A146 S1: Storehouse Steward is played as the first occupation in a three-player game', () => {
    expect(playOccupation(setup({ cardId: CARD_ID, played: false }), CARD_ID)
      .state.players[0]!.occupationPlayed).toContain(CARD_ID)
  })

  for (const { scenario, food, resource } of [
    { scenario: 'S2', food: 2, resource: 'stone' },
    { scenario: 'S3', food: 3, resource: 'reed' },
    { scenario: 'S4', food: 4, resource: 'clay' },
    { scenario: 'S5', food: 5, resource: 'wood' },
  ] as const) {
    it(`A146 ${scenario}: taking exactly ${food} food gains one ${resource}`, () => {
      const session = setup({ cardId: CARD_ID })
      const state = session.getState().state
      state.actionSpaces.find((space) => space.id === 'fishing')!.resources.food = food
      session.loadState(state)
      const response = session.takeAction(0, 'fishing')
      expect(response.state.players[0]!.resources.food).toBe(food)
      expect(response.state.players[0]!.resources[resource]).toBe(1)
    })
  }

  it('A146 S6: taking one or six food grants no Storehouse Steward resource', () => {
    for (const food of [1, 6]) {
      const session = setup({ cardId: CARD_ID })
      const state = session.getState().state
      state.actionSpaces.find((space) => space.id === 'fishing')!.resources.food = food
      session.loadState(state)
      const response = session.takeAction(0, 'fishing')
      expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, clay: 0, reed: 0, stone: 0 })
    }
  })
})

describe('A155 Conjurer parity', () => {
  const CARD_ID = 'A155_Conjurer'

  it('A155 S1: Conjurer is played as the first occupation in a four-player game', () => {
    expect(playOccupation(setup({ cardId: CARD_ID, played: false, playerCount: 4 }), CARD_ID)
      .state.players[0]!.occupationPlayed).toContain(CARD_ID)
  })

  it('A155 S2: Traveling Players gains accumulated food plus one wood and one grain', () => {
    const session = setup({ cardId: CARD_ID, playerCount: 4 })
    const state = session.getState().state
    state.actionSpaces.find((space) => space.id === 'traveling-players')!.resources.food = 3
    session.loadState(state)
    const response = session.takeAction(0, 'traveling-players')
    expect(response.state.players[0]!.resources).toMatchObject({ food: 3, wood: 1, grain: 1 })
  })

  it('A155 S3: non-Traveling-Players actions grant no Conjurer goods', () => {
    const response = setup({ cardId: CARD_ID, playerCount: 4 }).takeAction(0, 'day-laborer')
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, grain: 0 })
  })
})

describe('A163 Building Expert parity', () => {
  const CARD_ID = 'A163_BuildingExpert'

  it('A163 S1: Building Expert is played as the first occupation in a four-player game', () => {
    expect(playOccupation(setup({ cardId: CARD_ID, played: false, playerCount: 4 }), CARD_ID)
      .state.players[0]!.occupationPlayed).toContain(CARD_ID)
  })

  for (const { scenario, ordinal, resource } of [
    { scenario: 'S2', ordinal: 1, resource: 'wood' },
    { scenario: 'S3', ordinal: 2, resource: 'clay' },
    { scenario: 'S4', ordinal: 3, resource: 'reed' },
    { scenario: 'S5', ordinal: 4, resource: 'stone' },
    { scenario: 'S6', ordinal: 5, resource: 'stone' },
  ] as const) {
    it(`A163 ${scenario}: the ${ordinal}th person using Resource Market gains one ${resource}`, () => {
      const session = setup({ cardId: CARD_ID, playerCount: 4 })
      const state = session.getState().state
      const owner = state.players[0]!
      setActiveWorkerCount(owner, Math.max(2, ordinal))
      setWorkersAtHome(state, owner, Math.max(2, ordinal))
      const priorSpaces = ['forest', 'clay-pit', 'reed-bank', 'fishing']
      for (let index = 0; index < ordinal - 1; index++) {
        const workerId = String(index + 1)
        state.actionSpaces.find((space) => space.id === priorSpaces[index])!.takenBy = [{ playerId: owner.id, workerId }]
        recordRoundPlacement(owner, priorSpaces[index]!, workerId)
      }
      session.loadState(state)
      const before = session.getState().state.players[0]!.resources[resource]
      const response = session.takeAction(0, 'resource-market-4')
      expect(response.state.players[0]!.resources[resource]).toBe(before + 1 + (resource === 'reed' || resource === 'stone' ? 1 : 0))
    })
  }
})

describe("A155 command boundaries", () => {
  const CONJURER = 'A155_Conjurer'
  function save(id: string, value: unknown) {
    sessionEvidence.record(id, value)
  }
  function ok(r: SessionResponse) {
    assert.equal(r.ok, true, r.error)
    return r
  }
  function setup(configure: (state: GameState) => void = () => {
  }, played = true) {
    const players = 4
    const s = sessionEvidence.track(createWorkSession({ seed: 4242, options: { playerCount: players }, configure(state) {
        state.round = 14
        for (const p of state.players)
          Object.assign(p.resources, { food: 40, wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0 })
        state.players[0]!.occupationPlayed = played ? [CONJURER] : []
        state.players[0]!.occupationHand = played ? ['__test_placeholder__'] : [CONJURER, 'A110_Roughcaster']
        configure(state)
      } }))
    assert.equal(s.getState().state.players.length, players)
    return s
  }
  function pile(state: GameState, space: string, resource: 'food' | 'reed', count: number) {
    const a = state.actionSpaces.find(a => a.id === space)
    assert.ok(a, space)
    a.resources[resource] = count
  }
  const beforeAction = new WeakMap<GameSession, { rules: string; interaction: string; actor: number }>()
  function turn(s: GameSession, actor: number, space: string) {
    let r = s.getState()
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player')
      r = confirmNext(s, r)
    assert.equal(r.interaction.stateId, 'idle')
    assert.equal(r.state.currentPlayerIndex, actor)
    beforeAction.set(s, { rules: undoRuleSnapshot(r), interaction: JSON.stringify(r.interaction), actor })
    const result = ok(s.takeAction(actor, space))
    assertTurnFinished(result, actor)
    return result
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
  it("empty Traveling Players rejects while nonempty piles add one wood and grain", () => {
    for (const count of [0, 2, 5]) {
      const s = setup(state => pile(state, 'traveling-players', 'food', count))
      const r = count === 0 ? assertEmptyAccumulationRejected(s, 0, 'traveling-players') : turn(s, 0, 'traveling-players')
      assert.equal(r.state.players[0]!.resources.food, 40 + count)
      assert.equal(r.state.players[0]!.resources.wood, count === 0 ? 0 : 1)
      assert.equal(r.state.players[0]!.resources.grain, count === 0 ? 0 : 1)
      if (count === 0) {
        assert.equal(r.interaction.stateId, 'idle')
        assert.equal(r.state.currentPlayerIndex, 0)
      }
      save(`A155-N1-${count}`, r)
    }
  })
  it("unrelated Fishing and Day Laborer cannot grant wood or grain", () => {
    for (const space of ['fishing', 'day-laborer']) {
      const r = turn(setup(), 0, space)
      assert.equal(r.state.players[0]!.resources.wood, 0)
      assert.equal(r.state.players[0]!.resources.grain, 0)
      assertTurnFinished(r, 0)
      save(`A155-N2-${space}`, r)
    }
  })
  it("hand and actual opponent Traveling Players do not grant owner rewards", () => {
    const hand = turn(setup(undefined, false), 0, 'traveling-players')
    assert.equal(hand.state.players[0]!.resources.wood, 0)
    assert.equal(hand.state.players[0]!.resources.grain, 0)
    const s = setup()
    turn(s, 0, 'day-laborer')
    const other = turn(s, 1, 'traveling-players')
    assert.equal(other.state.players[0]!.resources.wood, 0)
    assert.equal(other.state.players[0]!.resources.grain, 0)
    assert.equal(other.state.players[1]!.resources.wood, 0)
    for (const actual of [other, s.getState()])
      assert.deepEqual(actual.state.players.map(player => [player.resources.wood, player.resources.grain]), [[0, 0], [0, 0], [0, 0], [0, 0]])
    assertTurnFinished(hand, 0)
    assertTurnFinished(other, 1)
    save('A155-N3', { hand, other })
  })
  it("invalid repeated input and whole undo preserve exactly one retry reward", () => {
    const s = setup(state => pile(state, 'traveling-players', 'food', 2))
    const assertOutcome = (response: SessionResponse) => {
      for (const result of [response, s.getState()]) {
        const player = result.state.players[0]!
        assert.deepEqual(player.resources, { wood: 1, clay: 0, reed: 0, stone: 0, food: 42, grain: 1, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 })
        assert.equal(result.state.actionSpaces.find(space => space.id === 'traveling-players')!.resources.food, 0)
      }
    }
    const first = turn(s, 0, 'traveling-players')
    assertOutcome(first)
    assert.equal(first.state.players[0]!.resources.food, 42)
    assert.equal(first.state.players[0]!.resources.wood, 1)
    assert.equal(first.state.players[0]!.resources.grain, 1)
    assert.equal(first.state.actionSpaces.find(a => a.id === 'traveling-players')!.resources.food, 0)
    assertRejectedUnchanged(s, () => s.takeAction(0, 'traveling-players'))
    const undone = undo(s)
    assert.equal(undone.state.players[0]!.resources.wood, 0)
    assert.equal(undone.state.players[0]!.resources.grain, 0)
    assert.equal(undone.state.players[0]!.resources.food, 40)
    const retry = turn(s, 0, 'traveling-players')
    assertOutcome(retry)
    assert.equal(retry.state.players[0]!.resources.wood, 1)
    assert.equal(retry.state.players[0]!.resources.grain, 1)
    const occupied = setup(state => pile(state, 'traveling-players', 'food', 2))
    turn(occupied, 0, 'traveling-players')
    for (const [actor, space] of [[1, 'grain-seeds'], [2, 'clay-pit'], [3, 'reed-bank']] as const)
      turn(occupied, actor, space)
    const ready = confirmNext(occupied, occupied.getState())
    assert.equal(ready.interaction.stateId, 'idle')
    assert.equal(ready.state.currentPlayerIndex, 0)
    assertRejectedUnchanged(occupied, () => occupied.takeAction(0, 'traveling-players'))
    const legal = turn(occupied, 0, 'day-laborer')
    assert.equal(legal.state.players[0]!.resources.food, 44)
    assert.equal(legal.state.players[0]!.resources.wood, 1)
    assert.equal(legal.state.players[0]!.resources.grain, 1)
    save('A155-N4', { first, undone, retry, legal })
  })
})

describe("A163 command boundaries", () => {
  const EXPERT = 'A163_BuildingExpert'
  function save(id: string, value: unknown) {
    sessionEvidence.record(id, value)
  }
  function ok(r: SessionResponse) {
    assert.equal(r.ok, true, r.error)
    return r
  }
  function setup(configure: (state: GameState) => void = () => {
  }, played = true) {
    const players = 4
    const s = sessionEvidence.track(createWorkSession({ seed: 4242, options: { playerCount: players }, configure(state) {
        state.round = 14
        for (const p of state.players)
          Object.assign(p.resources, { food: 40, wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0 })
        state.players[0]!.occupationPlayed = played ? [EXPERT] : []
        state.players[0]!.occupationHand = played ? ['__test_placeholder__'] : [EXPERT, 'A110_Roughcaster']
        configure(state)
      } }))
    assert.equal(s.getState().state.players.length, players)
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
  const FILLER = ['grain-seeds', 'day-laborer', 'forest', 'clay-pit', 'reed-bank', 'fishing', 'grove', 'hollow-4', 'copse', 'traveling-players', 'western-quarry', 'eastern-quarry', 'vegetable-seeds', 'sheep-market', 'pig-market', 'cattle-market']
  function beforeExpert(ordinal: number, played = true) {
    const s = setup(state => {
      for (const p of state.players) {
        p.workers.forEach(w => {
          w.isActive = true
          w.isNewborn = false
        })
        p.rooms = 5
        p.roomTiles = [{ row: 0, col: 0 }, { row: 1, col: 0 }, { row: 1, col: 1 }, { row: 2, col: 0 }, { row: 2, col: 1 }]
      }
      for (const [id, key] of [['western-quarry', 'stone'], ['eastern-quarry', 'stone'], ['sheep-market', 'sheep'], ['pig-market', 'boar'], ['cattle-market', 'cattle']] as const)
        state.actionSpaces.find(a => a.id === id)!.resources[key] = 1
    }, played)
    let used = 0
    const target = (ordinal - 1) * 4
    for (let n = 0; n < target; n++) {
      const actor = n % 4
      const space = FILLER[used++]
      assert.ok(space)
      let r = turn(s, actor, space)
      if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'animal-reorg')
        r = ok(s.resolveChoice(actor, 'confirm', { zones: r.interaction.request.zones }))
      assertTurnFinished(r, actor)
    }
    return s
  }
  it("first through fifth real placed person gains mapped material from Resource Market", () => {
    for (const ordinal of [1, 2, 3, 4, 5]) {
      const on = beforeExpert(ordinal), off = beforeExpert(ordinal, false)
      const a = turn(on, 0, 'resource-market-4'), b = turn(off, 0, 'resource-market-4')
      const target = ['wood', 'clay', 'reed', 'stone', 'stone'][ordinal - 1]!
      for (const type of ['wood', 'clay', 'reed', 'stone'] as const)
        assert.equal(a.state.players[0]!.resources[type] - b.state.players[0]!.resources[type], type === target ? 1 : 0)
      assert.equal(getRoundPersonPlacementOrder(a.state.players[0]!).length, ordinal)
      assertTurnFinished(a, 0)
      assertTurnFinished(b, 0)
      save(`A163-N1-${ordinal}`, { a, b })
    }
  })
  it("ordinary accumulation opponent market and hand cannot grant owner mapped resource", () => {
    const on = setup(), off = setup(undefined, false)
    const a = turn(on, 0, 'forest'), b = turn(off, 0, 'forest')
    assert.equal(a.state.players[0]!.resources.wood, b.state.players[0]!.resources.wood)
    assert.deepEqual(a.state.players[0]!.resources, b.state.players[0]!.resources)
    const s = setup()
    turn(s, 0, 'grain-seeds')
    const r = turn(s, 1, 'resource-market-4')
    assert.equal(r.state.players[0]!.resources.wood, 0)
    assert.equal(r.state.players[0]!.resources.clay, 0)
    assert.deepEqual(r.state.players[0]!.resources, { wood: 0, clay: 0, reed: 0, stone: 0, food: 40, grain: 1, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 })
    const baseline = { wood: 0, clay: 0, reed: 0, stone: 0, food: 40, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 }
    for (const actual of [r, s.getState()])
      assert.deepEqual(actual.state.players.map(player => player.resources), [
        { ...baseline, grain: 1 }, { ...baseline, reed: 1, stone: 1, food: 41 }, baseline, baseline,
      ])
    assertTurnFinished(a, 0)
    assertTurnFinished(b, 0)
    assertTurnFinished(r, 1)
    save('A163-N2', { a, b, r })
  })
  it("occupied market rejects and whole undo restores material before one retry", () => {
    const s = beforeExpert(1)
    const r = turn(s, 0, 'resource-market-4')
    assert.deepEqual(r.state.players[0]!.resources, { wood: 1, clay: 0, reed: 1, stone: 1, food: 41, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 })
    assertRejectedUnchanged(s, () => s.takeAction(0, 'resource-market-4'))
    const undone = undo(s)
    for (const type of ['wood', 'clay', 'reed', 'stone'] as const)
      assert.equal(undone.state.players[0]!.resources[type], 0)
    const retry = turn(s, 0, 'resource-market-4')
    assert.deepEqual(retry.state.players[0]!.resources, r.state.players[0]!.resources)
    assertTurnFinished(retry, 0)
    const occupied = beforeExpert(1)
    assertTurnFinished(turn(occupied, 0, 'resource-market-4'), 0)
    for (const [actor, space] of [[1, 'grain-seeds'], [2, 'clay-pit'], [3, 'reed-bank']] as const)
      assertTurnFinished(turn(occupied, actor, space), actor)
    const ready = confirmNext(occupied, occupied.getState())
    assert.equal(ready.interaction.stateId, 'idle')
    assert.equal(ready.state.currentPlayerIndex, 0)
    assertRejectedUnchanged(occupied, () => occupied.takeAction(0, 'resource-market-4'))
    const legal = turn(occupied, 0, 'day-laborer')
    assertTurnFinished(legal, 0)
    assert.equal(legal.state.players[0]!.resources.food, 43)
    assert.deepEqual((['wood', 'clay', 'reed', 'stone'] as const).map(type => legal.state.players[0]!.resources[type]), [1, 0, 1, 1])
    save('A163-N3', { r, undone, retry, legal })
  })
})

describe("A134 command boundaries", () => {
  const FULL = 'A134_FullFarmer'
  function ok(r: SessionResponse) {
    assert.equal(r.ok, true, r.error)
    return r
  }
  function setup(configure: (state: GameState) => void = () => {
  }, played = true, owner = 0, round = 14) {
    const s = sessionEvidence.track(createWorkSession({ seed: 4242, options: { playerCount: 3 }, configure(state) {
        state.round = round
        for (const p of state.players)
          Object.assign(p.resources, { food: 40, wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0 })
        state.players[owner]!.occupationPlayed = played ? [FULL] : []
        state.players[owner]!.occupationHand = played ? ['__test_placeholder__'] : [FULL, 'A110_Roughcaster']
        configure(state)
        for (const p of state.players)
          for (const id of p.improvements)
            takeMajorImprovementFromSupply(state, id)
      } }))
    assert.equal(s.getState().state.players.length, 3)
    return s
  }
  function bonus(r: SessionResponse, card: string, owner = 0) {
    assert.ok(r.scores)
    return r.scores[owner]!.categories.find(c => c.key === 'cardBonusVp')?.entries.filter(e => e.type === 'bonus' && e.cardId === card).reduce((v, e) => v + e.score, 0) ?? 0
  }
  function read(s: GameSession, card: string, expected: number, owner = 0) {
    const r = s.getState()
    assert.equal(bonus(r, card, owner), expected)
    assert.equal(bonus(s.getState(), card, owner), expected)
    return r
  }
  function play(s: GameSession, card: string) {
    let r = ok(s.takeAction(0, 'lessons'))
    for (let n = 0; n < 6 && !r.state.players[0]!.occupationPlayed.includes(card); n++) {
      assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice')
      r = ok(s.resolveChoice(0, card))
    }
    return r
  }
  function pasture(state: GameState, tiles: FarmTilePosition[], type: 'sheep' | 'boar' | 'cattle', count: number, owner = 0, stable = false) {
    const p = state.players[owner]!
    p.pastures.push({ id: `p${p.pastures.length}`, tiles, animalType: type, animalCount: count })
    p.resources[type] += count
    if (stable)
      p.stableTiles.push({ ...tiles[0]! })
    const edges = new Set<string>()
    for (const { row, col } of tiles)
      for (const e of [`H-${row}-${col}`, `H-${row + 1}-${col}`, `V-${row}-${col}`, `V-${row}-${col + 1}`]) {
        if (edges.has(e))
          edges.delete(e)
        else
          edges.add(e)
      }
    for (const edge of edges)
      if (!p.fenceSegments.some(s => s.edge === edge))
        p.fenceSegments.push({ edge, type: 'fence', source: { kind: 'own', ownerPlayerId: p.id } })
  }
  it("real Lessons purchase grants exactly one wood one clay and undo restores both", () => {
    const s = setup(undefined, false)
    const observedBeforeUndo = s.getState()
    const beforeUndo = {
      ...observedBeforeUndo,
      state: captureStateWithHistory(observedBeforeUndo.state),
      interaction: structuredClone(observedBeforeUndo.interaction),
      scores: structuredClone(observedBeforeUndo.scores),
    }
    const beforeRules = undoRuleSnapshot(beforeUndo)
    const first = play(s, FULL)
    assert.ok(first.interaction.stateId === 'wait')
    assert.deepEqual(first.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 })
    assert.equal(first.interaction.playerIndex, 0)
    assert.equal(first.state.currentPlayerIndex, 0)
    assert.equal(first.state.players[0]!.resources.wood, 1)
    assert.equal(first.state.players[0]!.resources.clay, 1)
    const undone = ok(s.undoAction())
    assertUndoRestored(beforeRules, undone)
    const liveAfterUndo = s.getState()
    assertUndoRestored(beforeRules, liveAfterUndo)
    assert.deepEqual(liveAfterUndo.interaction, beforeUndo.interaction)
    assert.equal(liveAfterUndo.state.currentPlayerIndex, 0)
    assert.deepEqual(undone.interaction, beforeUndo.interaction)
    assert.equal(undone.interaction.stateId, 'idle')
    assert.equal(undone.state.currentPlayerIndex, 0)
    assert.equal(undone.state.players[0]!.resources.wood, 0)
    assert.equal(undone.state.players[0]!.resources.clay, 0)
    const retry = play(s, FULL)
    assert.ok(retry.interaction.stateId === 'wait')
    assert.deepEqual(retry.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 })
    assert.equal(retry.interaction.playerIndex, 0)
    assert.equal(retry.state.currentPlayerIndex, 0)
    assert.equal(retry.state.players[0]!.resources.wood, 1)
    assert.equal(retry.state.players[0]!.resources.clay, 1)

    sessionEvidence.record('A134-N1', { first, undone, retry })
  })
  it("empty underfull and exactly full ordinary pasture score zero zero one", () => {
    for (const [animals, expected] of [[0, 0], [1, 0], [2, 1]]) {
      const s = setup(state => pasture(state, [{ row: 0, col: 1 }], 'sheep', animals!))
      sessionEvidence.record(`A134-N2-${animals}`, read(s, FULL, expected!))
    }
  })
  it("stable doubles capacity and two filled pastures still score one each", () => {
    for (const [animals, expected] of [[2, 0], [3, 0], [4, 1]]) {
      const s = setup(state => pasture(state, [{ row: 0, col: 1 }], 'sheep', animals!, 0, true))
      sessionEvidence.record(`A134-N3-${animals}`, read(s, FULL, expected!))
    }
    const two = setup(state => {
      pasture(state, [{ row: 0, col: 1 }], 'sheep', 2)
      pasture(state, [{ row: 0, col: 2 }], 'boar', 2)
    })
    sessionEvidence.record('A134-N3-two', read(two, FULL, 2))
  })
  it("household pet unfenced stable hand and opponent do not count full own pastures", () => {
    const pet = setup(state => {
      const p = state.players[0]!
      p.houseAnimals = { '2-0': 'sheep' }
      p.resources.sheep = 1
      p.stableTiles = [{ row: 0, col: 1 }]
      p.stableAnimals = { '0-1': 'boar' }
      p.resources.boar = 1
    })
    const a = read(pet, FULL, 0)
    const hand = read(setup(state => pasture(state, [{ row: 0, col: 1 }], 'sheep', 2), false), FULL, 0)
    const other = read(setup(state => pasture(state, [{ row: 0, col: 1 }], 'sheep', 2, 1)), FULL, 0)
    sessionEvidence.record('A134-N4', { a, hand, other })
  })
})

describe("A135 command boundaries", () => {
  const REEVE = 'A135_AnimalReeve'
  function ok(r: SessionResponse) {
    assert.equal(r.ok, true, r.error)
    return r
  }
  function setup(configure: (state: GameState) => void = () => {
  }, played = true, owner = 0, round = 14) {
    const s = sessionEvidence.track(createWorkSession({ seed: 4242, options: { playerCount: 3 }, configure(state) {
        state.round = round
        for (const p of state.players)
          Object.assign(p.resources, { food: 40, wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0 })
        state.players[owner]!.occupationPlayed = played ? [REEVE] : []
        state.players[owner]!.occupationHand = played ? ['__test_placeholder__'] : [REEVE, 'A110_Roughcaster']
        configure(state)
        for (const p of state.players)
          for (const id of p.improvements)
            takeMajorImprovementFromSupply(state, id)
      } }))
    assert.equal(s.getState().state.players.length, 3)
    return s
  }
  function bonus(r: SessionResponse, card: string, owner = 0) {
    assert.ok(r.scores)
    return r.scores[owner]!.categories.find(c => c.key === 'cardBonusVp')?.entries.filter(e => e.type === 'bonus' && e.cardId === card).reduce((v, e) => v + e.score, 0) ?? 0
  }
  function read(s: GameSession, card: string, expected: number, owner = 0) {
    const r = s.getState()
    assert.equal(bonus(r, card, owner), expected)
    assert.equal(bonus(s.getState(), card, owner), expected)
    return r
  }
  function play(s: GameSession, card: string) {
    let r = ok(s.takeAction(0, 'lessons'))
    for (let n = 0; n < 6 && !r.state.players[0]!.occupationPlayed.includes(card); n++) {
      assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice')
      r = ok(s.resolveChoice(0, card))
    }
    return r
  }
  function pasture(state: GameState, tiles: FarmTilePosition[], type: 'sheep' | 'boar' | 'cattle', count: number, owner = 0, stable = false) {
    const p = state.players[owner]!
    p.pastures.push({ id: `p${p.pastures.length}`, tiles, animalType: type, animalCount: count })
    p.resources[type] += count
    if (stable)
      p.stableTiles.push({ ...tiles[0]! })
    const edges = new Set<string>()
    for (const { row, col } of tiles)
      for (const e of [`H-${row}-${col}`, `H-${row + 1}-${col}`, `V-${row}-${col}`, `V-${row}-${col + 1}`]) {
        if (edges.has(e))
          edges.delete(e)
        else
          edges.add(e)
      }
    for (const edge of edges)
      if (!p.fenceSegments.some(s => s.edge === edge))
        p.fenceSegments.push({ edge, type: 'fence', source: { kind: 'own', ownerPlayerId: p.id } })
  }
  it("complete rounds left zero one two three five six eight nine yield exact wood staircase", () => {
    for (const [left, wood] of [[0, 0], [1, 1], [2, 1], [3, 2], [5, 2], [6, 3], [8, 3], [9, 4]]) {
      const s = setup(undefined, false, 0, 14 - left!)
      const r = play(s, REEVE)
      assert.ok(r.interaction.stateId === 'wait')
      assert.deepEqual(r.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 })
      assert.equal(r.interaction.playerIndex, 0)
      assert.equal(r.state.currentPlayerIndex, 0)
      assert.equal(r.state.players[0]!.resources.wood, wood)
      assertRejectedUnchanged(s, () => s.resolveChoice(0, REEVE))

      sessionEvidence.record(`A135-N1-${left}`, r)
    }
  })
  function animals(state: GameState, owner: number, n: number) {
    pasture(state, [{ row: 0, col: 1 }, { row: 0, col: 2 }], 'sheep', n, owner)
    pasture(state, [{ row: 1, col: 1 }, { row: 1, col: 2 }], 'boar', n, owner)
    pasture(state, [{ row: 2, col: 1 }, { row: 2, col: 2 }], 'cattle', n, owner)
  }
  it("each player animal sets one through four uses zero one three five bonus independently", () => {
    for (const [count, expected] of [[1, 0], [2, 1], [3, 3], [4, 5]]) {
      const s = setup(state => {
        animals(state, 0, count!)
        animals(state, 1, 2)
        animals(state, 2, 1)
      })
      const r = read(s, REEVE, expected!)
      assert.equal(bonus(r, REEVE, 1), 1)
      assert.equal(bonus(r, REEVE, 2), 0)
      sessionEvidence.record(`A135-N2-${count}`, r)
    }
  })
  it("missing animal species and unplayed Reeve cannot give shared points", () => {
    const s = setup(state => {
      pasture(state, [{ row: 0, col: 1 }, { row: 0, col: 2 }], 'sheep', 4)
      pasture(state, [{ row: 1, col: 1 }, { row: 1, col: 2 }], 'boar', 4)
    })
    const missing = read(s, REEVE, 0)
    const hand = read(setup(state => animals(state, 1, 3), false), REEVE, 0)
    assert.equal(bonus(hand, REEVE, 1), 0)
    sessionEvidence.record('A135-N3', { missing, hand })
  })
})

describe("A140 command boundaries", () => {
  const SHOVEL = 'A140_ShovelBearer'
  function ok(r: SessionResponse) {
    assert.equal(r.ok, true, r.error)
    return r
  }
  function setup(configure: (state: GameState) => void = () => {
  }, played = true) {
    const players = 3
    const s = sessionEvidence.track(createWorkSession({ seed: 4242, options: { playerCount: players }, configure(state) {
        state.round = 14
        for (const p of state.players)
          Object.assign(p.resources, { food: 40, wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0 })
        state.players[0]!.occupationPlayed = played ? [SHOVEL] : []
        state.players[0]!.occupationHand = played ? ['__test_placeholder__'] : [SHOVEL, 'A110_Roughcaster']
        configure(state)
      } }))
    assert.equal(s.getState().state.players.length, players)
    return s
  }
  function turn(s: GameSession, actor: number, space: string) {
    let r = s.getState()
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player')
      r = confirmNext(s, r)
    assert.equal(r.interaction.stateId, 'idle')
    assert.equal(r.state.currentPlayerIndex, actor)
    return ok(s.takeAction(actor, space))
  }
  function piles(state: GameState, space: string, resource: 'wood' | 'clay' | 'reed' | 'stone' | 'sheep' | 'food', amount: number) {
    const a = state.actionSpaces.find(a => a.id === space)
    assert.ok(a)
    a.resources[resource] = amount
  }
  function shovel(used: number, other: number, played = true) {
    return setup(state => {
      piles(state, 'clay-pit', 'clay', used)
      piles(state, 'hollow', 'clay', other)
    }, played)
  }
  it("Clay Pit food equals other Hollow pile zero one or four and leaves it unchanged", () => {
    for (const other of [0, 1, 4]) {
      const s = shovel(2, other)
      const r = turn(s, 0, 'clay-pit')
      assert.ok(r.interaction.stateId === 'wait')
      assert.deepEqual(r.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 })
      assert.equal(r.interaction.playerIndex, 0)
      assert.equal(r.state.currentPlayerIndex, 0)
      assert.equal(r.state.players[0]!.resources.clay, 2)
      assert.equal(r.state.players[0]!.resources.food, 40 + other)
      assert.equal(r.state.actionSpaces.find(a => a.id === 'hollow')!.resources.clay, other)

      sessionEvidence.record(`A140-N1-${other}`, r)
    }
  })
  it("Hollow food equals Clay Pit pile and ignores reserve clay", () => {
    const s = setup(state => {
      piles(state, 'clay-pit', 'clay', 4)
      piles(state, 'hollow', 'clay', 2)
      state.players[0]!.resources.clay = 7
    })
    const r = turn(s, 0, 'hollow')
    assert.ok(r.interaction.stateId === 'wait')
    assert.deepEqual(r.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 })
    assert.equal(r.interaction.playerIndex, 0)
    assert.equal(r.state.currentPlayerIndex, 0)
    assert.equal(r.state.players[0]!.resources.food, 44)
    assert.equal(r.state.players[0]!.resources.clay, 9)
    assert.equal(r.state.actionSpaces.find(a => a.id === 'clay-pit')!.resources.clay, 4)

    sessionEvidence.record('A140-N2', r)
  })
  it("hand unrelated and actual opponent cannot award owner food", () => {
    const hs = shovel(2, 4, false)
    const hand = turn(hs, 0, 'clay-pit')
    assert.ok(hand.interaction.stateId === 'wait')
    assert.deepEqual(hand.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 })
    assert.equal(hand.interaction.playerIndex, 0)
    assert.equal(hand.state.currentPlayerIndex, 0)
    assert.equal(hand.state.players[0]!.resources.food, 40)
    const s = shovel(2, 4)
    const unrelated = turn(s, 0, 'grain-seeds')
    assert.ok(unrelated.interaction.stateId === 'wait')
    assert.deepEqual(unrelated.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 })
    assert.equal(unrelated.interaction.playerIndex, 0)
    assert.equal(unrelated.state.currentPlayerIndex, 0)
    const other = turn(s, 1, 'clay-pit')
    assert.ok(other.interaction.stateId === 'wait')
    assert.deepEqual(other.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 2 })
    assert.equal(other.interaction.playerIndex, 1)
    assert.equal(other.state.currentPlayerIndex, 1)
    assert.equal(other.state.players[0]!.resources.food, 40)
    assert.equal(other.state.players[1]!.resources.food, 40)

    sessionEvidence.record('A140-N3', { hand, unrelated, other })
  })
  it("whole action undo restores collected pile and food before retry", () => {
    const occupied = shovel(2, 4)
    const occupiedTurn = confirmNext(occupied, turn(occupied, 0, 'clay-pit'))
    assert.equal(occupiedTurn.interaction.stateId, 'idle')
    assert.equal(occupiedTurn.state.currentPlayerIndex, 1)
    assertRejectedUnchanged(occupied, () => occupied.takeAction(1, 'clay-pit'))
    const legalOtherSpace = turn(occupied, 1, 'grain-seeds')
    assert.ok(legalOtherSpace.interaction.stateId === 'wait')
    assert.deepEqual(legalOtherSpace.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 2 })
    assert.equal(legalOtherSpace.interaction.playerIndex, 1)
    assert.equal(legalOtherSpace.state.currentPlayerIndex, 1)
    assert.equal(legalOtherSpace.state.players[1]!.resources.grain, 1)
    const s = shovel(2, 4)
    const observedBeforeUndo = s.getState()
    const beforeUndo = {
      ...observedBeforeUndo,
      state: captureStateWithHistory(observedBeforeUndo.state),
      interaction: structuredClone(observedBeforeUndo.interaction),
      scores: structuredClone(observedBeforeUndo.scores),
    }
    const beforeRules = undoRuleSnapshot(beforeUndo)
    const first = turn(s, 0, 'clay-pit')
    assert.ok(first.interaction.stateId === 'wait')
    assert.deepEqual(first.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 })
    assert.equal(first.interaction.playerIndex, 0)
    assert.equal(first.state.currentPlayerIndex, 0)
    assertRejectedUnchanged(s, () => s.takeAction(0, 'clay-pit'))
    assert.equal(first.state.players[0]!.resources.clay, 2)
    assert.equal(first.state.players[0]!.resources.food, 44)
    assert.equal(first.state.actionSpaces.find(space => space.id === 'clay-pit')!.resources.clay, 0)
    const undone = ok(s.undoAction())
    assertUndoRestored(beforeRules, undone)
    const liveAfterUndo = s.getState()
    assertUndoRestored(beforeRules, liveAfterUndo)
    assert.deepEqual(liveAfterUndo.interaction, beforeUndo.interaction)
    assert.equal(liveAfterUndo.state.currentPlayerIndex, 0)
    assert.deepEqual(undone.interaction, beforeUndo.interaction)
    assert.equal(undone.interaction.stateId, 'idle')
    assert.equal(undone.state.currentPlayerIndex, 0)
    assert.equal(undone.state.players[0]!.resources.food, 40)
    assert.equal(undone.state.players[0]!.resources.clay, 0)
    assert.equal(undone.state.actionSpaces.find(a => a.id === 'clay-pit')!.resources.clay, 2)
    const retry = turn(s, 0, 'clay-pit')
    assert.ok(retry.interaction.stateId === 'wait')
    assert.deepEqual(retry.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 })
    assert.equal(retry.interaction.playerIndex, 0)
    assert.equal(retry.state.currentPlayerIndex, 0)
    assert.equal(retry.state.players[0]!.resources.food, 44)

    sessionEvidence.record('A140-N4', { first, undone, retry })
  })
})

function requiredScores(response: SessionResponse) {
  assert.ok(response.scores)
  return response.scores
}
