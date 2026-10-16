import { captureStateWithHistory } from '../../shared/session/history-streams'
import { assertUndoRestored, undoRuleSnapshot } from './_helpers/session-assertions'
import { describe, expect, it } from 'vitest'
import { type GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import '../../shared/cards/A/A126_MasterWorkman'
import assert from 'node:assert/strict'
import { type GameState } from '../../shared/contract/types'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, confirmNext, getChoiceOptions } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'

const sessionEvidence = createScenarioEvidence(import.meta.url)

const CARD_ID = 'A126_MasterWorkman'
const OTHER_OCCUPATION = 'A093_BedMaker'
const FILLER = '__test_placeholder__'

const setup = ({
  played = true, resources = {}, houseType = 'wood',
}: {
  played?: boolean
  resources?: Partial<Record<'wood' | 'clay' | 'reed' | 'stone' | 'food', number>>
  houseType?: 'wood' | 'clay'
} = {}) => {
  const session = sessionEvidence.track(createWorkSession({ seed: 6126, options: { playerCount: 2 } }))
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = 14
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.roundActionOrder = state.roundActionOrder.map(() => null)
  state.roundActionOrder[0] = 'sheep-market'
  state.roundActionOrder[1] = 'fencing'
  state.roundActionOrder[2] = 'lessons'
  state.roundActionOrder[3] = 'house-redevelopment'
  state.roundActionOrder[4] = 'pig-market'
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.improvements = []
    player.resources = {
      ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0,
      vegetable: 0, sheep: 0, boar: 0, cattle: 0,
    }
  })
  const player = state.players[0]!
  player.occupationHand = played ? [FILLER] : [CARD_ID]
  player.occupationPlayed = played ? [CARD_ID] : []
  player.houseType = houseType
  Object.assign(player.resources, resources)
  for (const id of ['sheep-market', 'fencing', 'lessons', 'house-redevelopment', 'pig-market']) {
    const space = state.actionSpaces.find((candidate) => candidate.id === id)
    if (!space) throw new Error(`missing ${id}`)
    space.roundAvailable = 1
    space.takenBy = []
  }
  state.actionSpaces.find((space) => space.id === 'sheep-market')!.resources.sheep = 1
  state.actionSpaces.find((space) => space.id === 'pig-market')!.resources.boar = 1
  session.loadState(state)
  return session
}

const playOccupation = (session: GameSession, cardId = CARD_ID) => {
  const response = session.takeAction(0, 'lessons')
  if (!response.state.players[0]!.occupationHand.includes(cardId)) return response
  if (response.interaction.stateId !== 'wait') return response
  const option = getChoiceOptions(response)?.find((candidate) => candidate.value === cardId)
  expect(option).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, option!.value)
}

const renovate = (session: GameSession): SessionResponse => {
  let response = session.takeAction(0, 'house-redevelopment')
  expect(response.ok, response.error).toBe(true)
  if (response.interaction.stateId === 'wait'
    && response.interaction.promptKey === 'ui.interactionChooseRenovationTarget') {
    response = session.resolveChoice(response.interaction.playerIndex, 'stone')
  }
  return response
}

describe('A126 Master Workman parity', () => {
  it('A126 S1: Master Workman is played as the first occupation without paying food', () => {
    const response = playOccupation(setup({ played: false }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(0)
  })

  it('A126 S2: using the round-one Sheep Market grants one wood before the action', () => {
    const response = setup().takeAction(0, 'sheep-market')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(1)
  })

  it('A126 S3: using the round-two Fencing space grants one clay before fencing', () => {
    const session = setup({ resources: { wood: 4 } })
    let response = session.takeAction(0, 'fencing')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.clay).toBe(1)
    response = session.commitSelectionChoice(0, {
      edges: ['H-2-4', 'H-3-4', 'V-2-4', 'V-2-5'], palisadeEdges: [], extraWood: 0,
    })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.fenceSegments).toHaveLength(4)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, clay: 1 })
  })

  it('A126 S4: using the round-three Lessons space grants one reed while playing an occupation', () => {
    const session = setup({ resources: { food: 1 } })
    const state = session.getState().state
    state.players[0]!.occupationHand = [OTHER_OCCUPATION]
    session.loadState(state)

    const response = playOccupation(session, OTHER_OCCUPATION)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(OTHER_OCCUPATION)
    expect(response.state.players[0]!.resources.reed).toBe(1)
  })

  it('A126 S5: one stone funds and completes clay-to-stone renovation', () => {
    const session = setup({
      houseType: 'clay', resources: { stone: 1, reed: 1 },
    })
    expect(session.getActionAvailability(0)['house-redevelopment']).toBe(true)

    const response = renovate(session)

    expect(response.state.players[0]).toMatchObject({
      houseType: 'stone', resources: { stone: 0, reed: 0 },
    })
  })

  it('A126 S6: round-five and basic action spaces grant no building resource', () => {
    const roundFive = setup().takeAction(0, 'pig-market')
    expect(roundFive.ok, roundFive.error).toBe(true)
    expect(roundFive.state.players[0]!.resources).toMatchObject({
      wood: 0, clay: 0, reed: 0, stone: 0,
    })

    const basic = setup().takeAction(0, 'day-laborer')
    expect(basic.ok, basic.error).toBe(true)
    expect(basic.state.players[0]!.resources).toMatchObject({
      wood: 0, clay: 0, reed: 0, stone: 0,
    })
  })
})

describe("A126 command boundaries", () => {
  const MASTER = 'A126_MasterWorkman'
  function ok(r: SessionResponse) {
    assert.equal(r.ok, true, r.error)
    return r
  }
  function setup(configure: (state: GameState) => void = () => {
  }, played = true) {
    const players = 2
    const s = sessionEvidence.track(createWorkSession({ seed: 4242, options: { playerCount: players }, configure(state) {
        state.round = 14
        for (const p of state.players)
          Object.assign(p.resources, { food: 40, wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0 })
        state.players[0]!.occupationPlayed = played ? [MASTER] : []
        state.players[0]!.occupationHand = played ? ['__test_placeholder__'] : [MASTER, 'A110_Roughcaster']
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
  function finishAnimals(s: GameSession, r: SessionResponse) {
    for (let n = 0; n < 4 && r.interaction.stateId === 'wait' && r.interaction.request.kind === 'animal-reorg'; n++) {
      assert.equal(r.interaction.playerIndex, 0)
      r = ok(s.resolveChoice(0, 'confirm', { zones: r.interaction.request.zones }))
    }
    assert.ok(r.interaction.stateId === 'wait')
    assert.deepEqual(r.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 })
    assert.equal(r.interaction.playerIndex, 0)
    assert.equal(r.state.currentPlayerIndex, 0)
    return r
  }
  function piles(state: GameState, space: string, resource: 'wood' | 'clay' | 'reed' | 'stone' | 'sheep' | 'food', amount: number) {
    const a = state.actionSpaces.find(a => a.id === space)
    assert.ok(a)
    a.resources[resource] = amount
  }
  function mapped(state: GameState) {
    state.roundActionOrder = state.roundActionOrder.map(() => null)
    for (const [index, id] of ['sheep-market', 'grain-seeds', 'western-quarry', 'vegetable-seeds'].entries()) {
      state.roundActionOrder[index] = id
      state.actionSpaces.find(a => a.id === id)!.roundAvailable = 1
    }
    piles(state, 'sheep-market', 'sheep', 0)
    piles(state, 'western-quarry', 'stone', 0)
  }
  it("round assignment one through four gives wood clay reed stone before ordinary body", () => {
    for (const [index, space] of ['sheep-market', 'grain-seeds', 'western-quarry', 'vegetable-seeds'].entries()) {
      const s = setup(state => {
        mapped(state)
        piles(state, 'sheep-market', 'sheep', 1)
        piles(state, 'western-quarry', 'stone', 1)
      })
      const r = finishAnimals(s, turn(s, 0, space))
      assert.ok(r.interaction.stateId === 'wait')
      assert.deepEqual(r.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 })
      assert.equal(r.interaction.playerIndex, 0)
      assert.equal(r.state.currentPlayerIndex, 0)
      const res = r.state.players[0]!.resources
      assert.equal(res.wood, index === 0 ? 1 : 0)
      assert.equal(res.clay, index === 1 ? 1 : 0)
      assert.equal(res.reed, index === 2 ? 1 : 0)
      assert.equal(res.stone, (index === 3 ? 1 : 0) + (space === 'western-quarry' ? 1 : 0))
      assert.equal(res.grain, space === 'grain-seeds' ? 1 : 0)
      assert.equal(res.vegetable, space === 'vegetable-seeds' ? 1 : 0)

      sessionEvidence.record(`A126-N1-${index}`, r)
    }
  })
  it("basic and fifth round assignments cannot award mapped resources", () => {
    for (const space of ['day-laborer', 'vegetable-seeds']) {
      const s = setup(state => {
        mapped(state)
        state.roundActionOrder[3] = null
        state.roundActionOrder[4] = 'vegetable-seeds'
      })
      const r = turn(s, 0, space)
      assert.ok(r.interaction.stateId === 'wait')
      assert.deepEqual(r.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 })
      assert.equal(r.interaction.playerIndex, 0)
      assert.equal(r.state.currentPlayerIndex, 0)
      assert.deepEqual((['wood', 'clay', 'reed', 'stone'] as const).map(k => r.state.players[0]!.resources[k]), [0, 0, 0, 0])

      sessionEvidence.record(`A126-N2-${space}`, r)
    }
  })
  it("hand and actual opponent mapped use cannot reward owner", () => {
    const hand = turn(setup(mapped, false), 0, 'grain-seeds')
    assert.ok(hand.interaction.stateId === 'wait')
    assert.deepEqual(hand.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 })
    assert.equal(hand.interaction.playerIndex, 0)
    assert.equal(hand.state.currentPlayerIndex, 0)
    assert.equal(hand.state.players[0]!.resources.clay, 0)
    const s = setup(mapped)
    turn(s, 0, 'day-laborer')
    const other = turn(s, 1, 'grain-seeds')
    assert.ok(other.interaction.stateId === 'wait')
    assert.deepEqual(other.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 0 })
    assert.equal(other.interaction.playerIndex, 1)
    assert.equal(other.state.currentPlayerIndex, 1)
    assert.equal(other.state.players[0]!.resources.clay, 0)
    assert.equal(other.state.players[1]!.resources.clay, 0)

    sessionEvidence.record('A126-N3', { hand, other })
  })
  it("invalid actor and occupied action cannot duplicate before reward", () => {
    const s = setup(mapped)
    assertRejectedUnchanged(s, () => s.takeAction(1, 'grain-seeds'))
    const first = turn(s, 0, 'grain-seeds')
    assert.ok(first.interaction.stateId === 'wait')
    assert.deepEqual(first.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 })
    assert.equal(first.interaction.playerIndex, 0)
    assert.equal(first.state.currentPlayerIndex, 0)
    assertRejectedUnchanged(s, () => s.takeAction(0, 'grain-seeds'))
    assert.equal(first.state.players[0]!.resources.clay, 1)

    sessionEvidence.record('A126-N4', first)
  })
  it("whole action undo restores mapped resource and source before exactly one retry", () => {
    const occupied = setup(mapped)
    const occupiedTurn = confirmNext(occupied, turn(occupied, 0, 'grain-seeds'))
    assert.equal(occupiedTurn.interaction.stateId, 'idle')
    assert.equal(occupiedTurn.state.currentPlayerIndex, 1)
    assertRejectedUnchanged(occupied, () => occupied.takeAction(1, 'grain-seeds'))
    const legalOtherSpace = turn(occupied, 1, 'reed-bank')
    assert.ok(legalOtherSpace.interaction.stateId === 'wait')
    assert.deepEqual(legalOtherSpace.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 0 })
    assert.equal(legalOtherSpace.interaction.playerIndex, 1)
    assert.equal(legalOtherSpace.state.currentPlayerIndex, 1)
    assert.equal(legalOtherSpace.state.players[1]!.resources.reed, 1)
    const s = setup(mapped)
    const observedBeforeUndo = s.getState()
    const beforeUndo = {
      ...observedBeforeUndo,
      state: captureStateWithHistory(observedBeforeUndo.state),
      interaction: structuredClone(observedBeforeUndo.interaction),
      scores: structuredClone(observedBeforeUndo.scores),
    }
    const beforeRules = undoRuleSnapshot(beforeUndo)
    const first = turn(s, 0, 'grain-seeds')
    assert.ok(first.interaction.stateId === 'wait')
    assert.deepEqual(first.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 })
    assert.equal(first.interaction.playerIndex, 0)
    assert.equal(first.state.currentPlayerIndex, 0)
    assert.equal(first.state.players[0]!.resources.clay, 1)
    assert.equal(first.state.players[0]!.resources.grain, 1)
    const undone = ok(s.undoAction())
    assertUndoRestored(beforeRules, undone)
    const liveAfterUndo = s.getState()
    assertUndoRestored(beforeRules, liveAfterUndo)
    assert.deepEqual(liveAfterUndo.interaction, beforeUndo.interaction)
    assert.equal(liveAfterUndo.state.currentPlayerIndex, 0)
    assert.deepEqual(undone.interaction, beforeUndo.interaction)
    assert.equal(undone.interaction.stateId, 'idle')
    assert.equal(undone.state.currentPlayerIndex, 0)
    assert.equal(undone.state.players[0]!.resources.clay, 0)
    assert.equal(undone.state.players[0]!.resources.grain, 0)
    const retry = turn(s, 0, 'grain-seeds')
    assert.ok(retry.interaction.stateId === 'wait')
    assert.deepEqual(retry.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 })
    assert.equal(retry.interaction.playerIndex, 0)
    assert.equal(retry.state.currentPlayerIndex, 0)
    assert.equal(retry.state.players[0]!.resources.clay, 1)
    assert.equal(retry.state.players[0]!.resources.grain, 1)

    sessionEvidence.record('A126-N5', { first, undone, retry })
  })
})
