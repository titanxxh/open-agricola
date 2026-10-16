import { collectScheduledEffectPreviews } from '../../shared/actions/scheduled-effect-preview'
import { createWorkSession } from './_helpers/session-fixtures'
import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { familySize, markAllWorkersUsed, setActiveWorkerCount, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { getRoundPersonPlacementDetails } from '../../shared/cards/helpers/round-placement'
import '../../shared/cards/A/A127_Lodger'
import '../../shared/cards/A/A129_Swagman'
import '../../shared/cards/A/A130_MummysBoy'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged, assertUndoRestored, confirmNext, undoRuleSnapshot, getChoiceOptions, expectFarmSelection, expectTileFarmSelection } from './_helpers/session-assertions'
import { findActionSpaceById } from '../../shared/domain/space'
import { createScenarioEvidence } from './_helpers/scenario-evidence'

const evidence = createScenarioEvidence(import.meta.url)

const FILLER = '__test_placeholder__'

const setup = (cardId: string, playerCount: number, round = 5, played = true) => {
  const session = evidence.track(createWorkSession({ seed: 7127 + round, options: { playerCount } }))
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = round
  state.roundPhase = 'work'
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player, index) => {
    setWorkersAtHome(state, player, index === 0 ? 2 : 0)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.cardStates = {}
    player.resources = {
      ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0,
      vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    }
  })
  const owner = state.players[0]!
  owner.occupationHand = played ? [FILLER] : [cardId]
  owner.occupationPlayed = played ? [cardId] : []
  session.loadState(state)
  return session
}

const playOccupation = (session: GameSession, cardId: string) => {
  const response = session.takeAction(0, 'lessons')
  if (!response.state.players[0]!.occupationHand.includes(cardId)) return response
  if (response.interaction.stateId !== 'wait') return response
  const option = getChoiceOptions(response)?.find((candidate) => candidate.value === cardId)
  expect(option).toBeDefined()
  return session.resolveChoice(0, option!.value)
}

const openWishChildren = (session: GameSession) => {
  const state = session.getState().state
  state.roundActionOrder = state.roundActionOrder.map((id) => id === 'wish-children' ? null : id)
  state.roundActionOrder[0] = 'wish-children'
  state.actionSpaces.find((space) => space.id === 'wish-children')!.takenBy = []
  session.loadState(state)
}

describe('A127 Lodger parity', () => {
  it('A127 S1: playing Lodger by round nine enables one room-limited family growth', () => {
    const session = setup('A127_Lodger', 2, 9, false)
    const played = playOccupation(session, 'A127_Lodger')
    expect(played.state.players[0]!.occupationPlayed).toContain('A127_Lodger')
    const state = session.getState().state
    state.currentPlayerIndex = 0
    setWorkersAtHome(state, state.players[0]!, 2)
    session.loadState(state)
    openWishChildren(session)
    const before = familySize(session.state.players[0]!)
    const response = session.takeAction(0, 'wish-children')
    expect(response.ok, response.error).toBe(true)
    expect(familySize(response.state.players[0]!)).toBe(before + 1)
  })

  it('A127 S2: playing Lodger after round nine grants no extra room', () => {
    const session = setup('A127_Lodger', 2, 10, false)
    const played = playOccupation(session, 'A127_Lodger')
    expect(played.state.players[0]!.occupationPlayed).toContain('A127_Lodger')
    const state = session.getState().state
    state.currentPlayerIndex = 0
    setWorkersAtHome(state, state.players[0]!, 2)
    session.loadState(state)
    openWishChildren(session)
    const response = session.takeAction(0, 'wish-children')
    expect(response.ok).toBe(false)
    expect(familySize(response.state.players[0]!)).toBe(2)
  })

  it.each([
    ['S3', 2, 2],
    ['S4', 3, 3],
  ] as const)('A127 %s: round nine returning home with %i rooms leaves %i people', (_scenario, rooms, expected) => {
    const session = setup('A127_Lodger', 2, 9)
    const state = session.getState().state
    const owner = state.players[0]!
    setActiveWorkerCount(owner, 3)
    setWorkersAtHome(state, owner, 3)
    owner.rooms = rooms
    owner.roomTiles = Array.from({ length: rooms }, (_, col) => ({ row: 2, col }))
    owner.cardStates.A127_Lodger = { extraData: { hasRoom: true } }
    state.players.forEach((player) => {
      markAllWorkersUsed(state, player)
      player.resources.food = 20
    })
    session.loadState(state)
    expect(session.state.players).toHaveLength(2)
    const preview = session.withCtx(() => collectScheduledEffectPreviews(session.state, session.state.players[0]!, session.actionHooks))
      .find(entry => entry.sourceCard === 'A127_Lodger')
    expect(preview?.description.kind).toBe('conditional')
    if (preview?.description.kind !== 'conditional') throw new Error('Missing room activation condition')
    expect(preview.description.condition).toEqual({ kind: 'extra-room-active', fact: 'hasRoom' })
    const response = session.performRoundEnd()
    expect(response.ok, response.error).toBe(true)
    expect(familySize(response.state.players[0]!)).toBe(expected)
    expect(response.state.players[0]!.cardStates.A127_Lodger?.extraData?.hasRoom).toBe(false)
  })
})

const driveSwagman = (session: GameSession, response: SessionResponse, accept: boolean) => {
  for (let guard = 0; guard < 24 && response.interaction.stateId === 'wait'; guard += 1) {
    if (response.interaction.request.kind === 'confirm-next-player') break
    if (response.interaction.request.kind === 'farm-select') {
      const farm = expectFarmSelection(response)
      if (farm.farmType === 'sow') {
        const field = farm.selectableFields[0]!
        response = session.commitSelectionChoice(0, { crops: [{ ...field.tile, crop: 'grain' }] })
      } else if (farm.farmType === 'stable') {
        response = session.commitSelectionChoice(0, { stables: [farm.selectableTiles[0]!] })
      } else break
      continue
    }
    const options = getChoiceOptions(response) ?? []
    const card = options.find((option) => option.sourceCard === 'A129_Swagman' && option.value !== '__skip__')
    const skip = options.find((option) => option.value === '__skip__')
    const ordinary = options.find((option) => option.value !== '__skip__' && option.value !== '__pass__')
    if (card) response = session.resolveChoice(0, accept ? card.value : skip!.value)
    else if (skip) response = session.resolveChoice(0, skip.value)
    else if (ordinary) response = session.resolveChoice(0, ordinary.value)
    else break
  }
  return response
}

describe('A129 Swagman parity', () => {
  it('A129 S1: Swagman can be played as the first occupation in a three-player game', () => {
    expect(playOccupation(setup('A129_Swagman', 3, 5, false), 'A129_Swagman')
      .state.players[0]!.occupationPlayed).toContain('A129_Swagman')
  })

  it('A129 S2: after Grain Seeds the same person may move to Farm Expansion and use it', () => {
    const session = setup('A129_Swagman', 3)
    const state = session.getState().state
    state.players[0]!.resources = { ...state.players[0]!.resources, grain: 1, wood: 2 }
    state.players[0]!.fields = [{ row: 0, col: 0, stacks: [] }]
    session.loadState(state)
    const response = driveSwagman(session, session.takeAction(0, 'grain-seeds'), true)
    expect(response.state.actionSpaces.find((space) => space.id === 'grain-seeds')!.takenBy).toEqual([])
    expect(response.state.actionSpaces.find((space) => space.id === 'farm-expansion')!.takenBy).toHaveLength(1)
    expect(response.state.players[0]!.stableTiles).toHaveLength(1)
  })

  it('A129 S3: declining the Swagman jump leaves the person on Grain Seeds', () => {
    const session = setup('A129_Swagman', 3)
    const state = session.getState().state
    state.players[0]!.resources.grain = 1
    state.players[0]!.fields = [{ row: 0, col: 0, stacks: [] }]
    session.loadState(state)
    const response = driveSwagman(session, session.takeAction(0, 'grain-seeds'), false)
    expect(response.state.actionSpaces.find((space) => space.id === 'grain-seeds')!.takenBy).toHaveLength(1)
    expect(response.state.actionSpaces.find((space) => space.id === 'farm-expansion')!.takenBy).toEqual([])
  })

  it('A129 S4: after Farm Expansion the same person may move to Grain Seeds and use it', () => {
    const session = setup('A129_Swagman', 3)
    const state = session.getState().state
    state.players[0]!.resources.wood = 2
    state.players[0]!.fields = [{ row: 0, col: 0, stacks: [] }]
    session.loadState(state)
    const response = driveSwagman(session, session.takeAction(0, 'farm-expansion'), true)
    expect(response.state.actionSpaces.find((space) => space.id === 'farm-expansion')!.takenBy).toEqual([])
    expect(response.state.actionSpaces.find((space) => space.id === 'grain-seeds')!.takenBy).toHaveLength(1)
    expect(response.state.players[0]!.stableTiles).toHaveLength(1)
    expect(response.state.players[0]!.resources.grain).toBe(1)
  })
})

describe('A130 rule boundaries', () => {

  const A130 = 'A130_MummysBoy'

  function setup(card: string, { family = 2, players = 3, round = 5 } = {}) {
    const session = evidence.track(createWorkSession({
      seed: 42, options: { playerCount: players }, configure: state => {
        state.round = round
        state.players.forEach(p => { p.resources.food = 20 })
        const p = state.players[0]!
        p.occupationPlayed = [card]
        p.resources.food = 0
        setActiveWorkerCount(p, family)
        setWorkersAtHome(state, p, family)
        if (family > 2 && card === A130) {
          p.rooms = family
          p.roomTiles = [{ row: 1, col: 0 }, { row: 2, col: 0 }, { row: 1, col: 1 }, { row: 2, col: 1 }].slice(0, family)
        }
      }
    }))
    return session
  }

  function ok(r: SessionResponse) { assert.equal(r.ok, true, r.error); return r }

  function ready(session: GameSession, actor: number) {
    let r = session.getState()
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player')
      r = confirmNext(session, r)
    assert.equal(r.interaction.stateId, 'idle')
    assert.equal(r.state.currentPlayerIndex, actor)
    return r
  }

  function turn(session: GameSession, actor: number, space: string) {
    ready(session, actor)
    let r = ok(session.takeAction(actor, space))
    if (space === 'meeting-place' && r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice') {
      const skip = getChoiceOptions(r).find(o => o.value === '__skip__' || o.value === '__done__')
      assert.ok(skip)
      r = ok(session.resolveChoice(actor, skip.value))
    }
    return r
  }

  function secondPerson(session: GameSession, target = 'day-laborer') {
    turn(session, 0, 'forest')
    turn(session, 1, 'clay-pit')
    turn(session, 2, 'reed-bank')
    ready(session, 0)
    assertRejectedUnchanged(session, () => session.takeAction(0, 'forest'))
    turn(session, 0, target)
    turn(session, 1, 'grain-seeds')
    turn(session, 2, 'fishing')
    ready(session, 0)
    assert.equal(getRoundPersonPlacementDetails(session.state.players[0]!).length, 2)
  }

  function occupants(r: SessionResponse, space: string) {
    return findActionSpaceById(r.state, space)!.takenBy.filter(w => w.playerId === r.state.players[0]!.id)
  }

  it("third reuse rejects first and opponent targets and undo restores quota", () => {
    const s = setup(A130, { family: 4 })
    secondPerson(s)
    assertRejectedUnchanged(s, () => s.takeAction(0, 'forest'))
    assertRejectedUnchanged(s, () => s.takeAction(0, 'clay-pit'))
    const before = undoRuleSnapshot(s.getState())
    const r = ok(s.takeAction(0, 'day-laborer'))
    assert.equal(r.state.players[0]!.resources.food, 4)
    assert.equal(occupants(r, 'day-laborer').length, 2)
    assert.equal(r.state.players[0]!.cardStates[A130]?.flagged, true)
    assert.equal(getRoundPersonPlacementDetails(r.state.players[0]!).length, 3)
    assert.ok(r.scores)
    assert.equal(r.scores.length, 3)
    assert.ok(r.state.log.some(l => l.key === 'log.placeFarmer'))
    const undone = s.undoAction()
    assertUndoRestored(before, undone)
    assert.equal(undone.interaction.stateId, 'idle')
    assert.equal(undone.state.currentPlayerIndex, 0)
    const retried = ok(s.takeAction(0, 'day-laborer'))
    assert.equal(retried.state.players[0]!.resources.food, 4)
    assert.equal(occupants(retried, 'day-laborer').length, 2)
    assert.ok(retried.interaction.stateId === 'wait' && retried.interaction.request.kind === 'confirm-next-player')
    assert.equal(retried.interaction.playerIndex, 0)

    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player', JSON.stringify(r.interaction))
    assert.equal(r.interaction.playerIndex, 0)
    assert.equal(r.state.currentPlayerIndex, 0)
  })

  it("Meeting Place second person cannot be reused and legal placement remains", () => {
    const s = setup(A130, { family: 3 })
    secondPerson(s, 'meeting-place')
    assertRejectedUnchanged(s, () => s.takeAction(0, 'meeting-place'))
    let r = ok(s.takeAction(0, 'farmland'))
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'farm-select' && expectFarmSelection(r).farmType === 'plow')
    r = ok(s.commitSelectionChoice(0, { tile: expectTileFarmSelection(r, 'plow').selectableTiles[0]! }))
    assert.equal(occupants(r, 'meeting-place').length, 1)
    assert.equal(r.state.players[0]!.cardStates[A130]?.flagged, undefined)
    assert.equal(occupants(r, 'farmland').length, 1)

    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player', JSON.stringify(r.interaction))
    assert.equal(r.interaction.playerIndex, 0)
    assert.equal(r.state.currentPlayerIndex, 0)
  })

  it("fourth reuse is rejected and a new round renews the allowance", () => {
    const s = setup(A130, { family: 4 })
    secondPerson(s)
    ok(s.takeAction(0, 'day-laborer'))
    ready(s, 0)
    assertRejectedUnchanged(s, () => s.takeAction(0, 'day-laborer'))
    let r = ok(s.takeAction(0, 'farmland'))
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'farm-select' && expectFarmSelection(r).farmType === 'plow')
    r = ok(s.commitSelectionChoice(0, { tile: expectTileFarmSelection(r, 'plow').selectableTiles[0]! }))
    assert.equal(r.state.players[0]!.resources.food, 4)
    ready(s, 0)
    assert.equal(s.state.round, 6)
    assert.equal(s.state.players[0]!.cardStates[A130]?.flagged, false)
    secondPerson(s)
    const next = ok(s.takeAction(0, 'day-laborer'))
    assert.equal(next.state.players[0]!.resources.food, 8)
    assert.equal(occupants(next, 'day-laborer').length, 2)

    assert.ok(next.interaction.stateId === 'wait' && next.interaction.request.kind === 'confirm-next-player', JSON.stringify(next.interaction))
    assert.equal(next.interaction.playerIndex, 0)
    assert.equal(next.state.currentPlayerIndex, 0)
  })
})
