import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/A/A015_CarpentersAxe'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged, assertUndoRestored, undoRuleSnapshot } from './_helpers/negative-rule-audit'
import * as audit05Building from './_helpers/audit/ae-negative-05-building'

const CARD_ID = 'A015_CarpentersAxe'
const FILLER = '__test_placeholder__'

const setup = ({ wood = 4, forestWood = 3 } = {}) => {
  const session = new GameSession(7015, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 5
  state.roundPhase = 'work'
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.resources = {
      ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 20,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    }
  })
  const owner = state.players[0]!
  owner.minorPlayed = [CARD_ID]
  owner.resources.wood = wood
  const forest = state.actionSpaces.find((space) => space.id === 'forest')!
  forest.resources.wood = forestWood
  session.loadState(state)
  return session
}

const expectStableChoice = (response: SessionResponse) => {
  expect(response.interaction).toMatchObject({
    stateId: 'wait',
    request: { kind: 'farm-select', farm: { farmType: 'stable', maxSelections: 1 } },
  })
  if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'farm-select') {
    throw new Error('expected Carpenter Axe stable selection')
  }
  return response.interaction.request.farm.selectableTiles[0]!
}

const acceptCarpentersAxe = (session: GameSession, response: SessionResponse) => {
  expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'choice' } })
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) => candidate.value !== '__skip__')
  expect(option).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, option!.value)
}

describe("A015 Carpenter's Axe parity", () => {
  it('A015 S1: reaching seven wood from Forest may build exactly one stable for one wood', () => {
    const session = setup()
    let response = acceptCarpentersAxe(session, session.takeAction(0, 'forest'))
    const target = expectStableChoice(response)

    response = session.commitSelectionChoice(0, { stables: [target] })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(6)
    expect(response.state.players[0]!.stableTiles).toEqual([target])
  })

  it('A015 S2: the Carpenter Axe stable may be declined without paying wood', () => {
    const session = setup()
    const pending = session.takeAction(0, 'forest')
    expect(pending.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'choice' } })

    const response = session.resolveChoice(0, '__skip__')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(7)
    expect(response.state.players[0]!.stableTiles).toEqual([])
  })

  it('A015 S3: ending below seven wood offers no Carpenter Axe stable', () => {
    const response = setup({ wood: 3 }).takeAction(0, 'forest')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(6)
    expect(response.interaction).not.toMatchObject({
      stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'stable' } },
    })
    expect(response.state.players[0]!.stableTiles).toEqual([])
  })

  it('A015 S4: non-wood accumulation spaces do not trigger Carpenter Axe', () => {
    const session = setup({ wood: 7 })
    const state = session.getState().state
    state.actionSpaces.find((space) => space.id === 'clay-pit')!.resources.clay = 3
    session.loadState(state)

    const response = session.takeAction(0, 'clay-pit')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(7)
    expect(response.interaction).not.toMatchObject({
      stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'stable' } },
    })
    expect(response.state.players[0]!.stableTiles).toEqual([])
  })
})

describe('ae-negative-05-building', () => {
  const { A015, sessions, setup, ok, turn, buy, deniedCard, axe } = audit05Building
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('A015 N1 zero wood forged purchase rejects and exact one wood buys axe', () => {
    deniedCard(setup({ card: A015 }), A015)
    const s = setup({ card: A015, resources: { wood: 1 } }); const r = buy(s, A015)
    assert.ok(r.state.players[0]!.minorPlayed.includes(A015)); assert.equal(r.state.players[0]!.resources.wood, 0)
  })
  it('A015 N2 post-collection six skips while seven and eight allow one paid stable', () => {
    const six = setup({ card: A015, played: true, resources: { wood: 3 } }); const no = turn(six, 0, 'forest')
    assert.equal(no.state.players[0]!.resources.wood, 6); assert.equal(no.state.players[0]!.stableTiles.length, 0)
    assert.ok(no.interaction.stateId === 'wait' && no.interaction.request.kind === 'confirm-next-player'); assertRejectedUnchanged(six, () => six.commitSelectionChoice(0, { stables: [{ row: 0, col: 1 }] }))
    for (const initial of [4, 5]) {
      const s = setup({ card: A015, played: true, resources: { wood: initial } }); axe(s)
      const r = ok(s.commitSelectionChoice(0, { stables: [{ row: 0, col: 1 }] }))
      assert.equal(r.state.players[0]!.resources.wood, initial + 2); assert.equal(r.state.players[0]!.stableTiles.length, 1)
    }
  })
  it('A015 N3 two duplicate occupied and off-board stable targets reject before legal retry', () => {
    const s = setup({ card: A015, played: true, resources: { wood: 4 } }); const r = axe(s)
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'farm-select' && r.interaction.request.farm.farmType === 'stable'); assert.equal(r.interaction.request.farm.maxSelections, 1)
    for (const stables of [[{ row: 0, col: 1 }, { row: 0, col: 2 }], [{ row: 0, col: 1 }, { row: 0, col: 1 }], [{ row: 1, col: 0 }], [{ row: 9, col: 9 }]]) assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { stables }))
    assertRejectedUnchanged(s, () => s.commitSelectionChoice(1, { stables: [{ row: 0, col: 1 }] }))
    const done = ok(s.commitSelectionChoice(0, { stables: [{ row: 0, col: 1 }] })); assert.equal(done.state.players[0]!.resources.wood, 6); assert.equal(done.state.players[0]!.stableTiles.length, 1)
    assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { stables: [{ row: 0, col: 2 }] }))
  })
  it('A015 N4 four real stables leave no piece or legal fifth build', () => {
    const s = setup({ card: A015, played: true, stableCount: 4, resources: { wood: 4 } }); const r = turn(s, 0, 'forest')
    assert.equal(r.state.players[0]!.resources.wood, 7); assert.equal(r.state.players[0]!.stableTiles.length, 4)
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player')
    assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { stables: [{ row: 1, col: 1 }] }))
  })
  it('A015 N5 nonwood owner action and opponent wood collection do not trigger', () => {
    const s = setup({ card: A015, played: true, resources: { wood: 7 }, opponent: { wood: 4 } }); turn(s, 0, 'clay-pit')
    const r = turn(s, 1, 'forest')
    assert.equal(r.state.players[0]!.resources.wood, 7); assert.equal(r.state.players[1]!.resources.wood, 7)
    assert.equal(r.state.players[0]!.stableTiles.length, 0); assert.equal(r.state.players[1]!.stableTiles.length, 0)
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player')
  })
  it('A015 N6 decline stale requests and action undo preserve one-stable allowance', () => {
    const s = setup({ card: A015, played: true, resources: { wood: 4 } }); const before = undoRuleSnapshot(s.getState())
    turn(s, 0, 'forest'); ok(s.resolveChoice(0, '__skip__'))
    assert.equal(s.getState().state.players[0]!.resources.wood, 7); assert.equal(s.getState().state.players[0]!.stableTiles.length, 0)
    assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { stables: [{ row: 0, col: 1 }] }))
    assertUndoRestored(before, s.undoAction()); axe(s); const r = ok(s.commitSelectionChoice(0, { stables: [{ row: 0, col: 1 }] }))
    assert.equal(r.state.players[0]!.resources.wood, 6); assert.equal(r.state.players[0]!.stableTiles.length, 1); assert.equal(r.scores?.length, 2); assert.ok(r.state.log.length > 0)
  })
})
