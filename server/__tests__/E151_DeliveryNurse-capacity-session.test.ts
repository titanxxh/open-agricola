import { describe, expect, it } from 'vitest'
import { type GameSession, type SessionResponse } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'
import { positionKey } from '../../shared/domain/farm'
import { familySize, setActiveWorkerCount, setWorkersAtHome } from '../../shared/domain/player'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged, assertUndoRestored, confirmNext, undoRuleSnapshot, getChoiceOptions, expectFarmSelection, expectTileFarmSelection } from './_helpers/session-assertions'
import { findActionSpaceById } from '../../shared/domain/space'

import { createScenarioEvidence } from './_helpers/scenario-evidence'

const evidence = createScenarioEvidence(import.meta.url)

const CARD_ID = 'E151_DeliveryNurse'

// Confirmed Session seam: ordinary growth preserves the allowance, and a real
// next-round placement consumes it only after extra housing is full (#1126).
const waiting = (response: SessionResponse) => {
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') throw new Error('Expected pending interaction')
  return response.interaction
}

const choiceOptions = (response: SessionResponse) => {
  const request = waiting(response).request
  if (request.kind !== 'choice') throw new Error('Expected choice interaction')
  return request.options
}

const farmSelection = (response: SessionResponse) => {
  const request = waiting(response).request
  return request.kind === 'farm-select' ? request.farm : undefined
}

const setup = (shed = true) => {
  const session = evidence.track(createWorkSession({
    options: { playerCount: 4 }, configure: (state) => {
      state.round = 5
      state.players.forEach((player) => { player.resources.food = 20 })
      const player = state.players[0]!
      player.occupationPlayed = [CARD_ID]
      player.minorPlayed = shed ? ['A010_WoodenShed'] : []
      Object.assign(player.resources, { sheep: 1, boar: 1, cattle: 1 })
      player.houseAnimals = { [positionKey(player.roomTiles[0]!)]: 'sheep' }
      player.stableTiles = [{ row: 0, col: 2 }, { row: 1, col: 2 }]
      player.stableAnimals = { '0-2': 'boar', '1-2': 'cattle' }
    }
  }))
  return session
}

const confirm = (session: GameSession, response: SessionResponse) => {
  expect(response.ok, response.error).toBe(true)
  expect(waiting(response).request.kind).toBe('confirm-next-player')
  const confirmed = session.resolveChoice(waiting(response).playerIndex, 'confirm')
  expect(confirmed.ok, confirmed.error).toBe(true)
  return confirmed
}

describe('E151 Delivery Nurse extra housing', () => {
  it.each(['absent', 'opponent', 'missing-animal', 'used'] as const)('does not admit no-room growth when %s', (control) => {
    const session = setup(false)
    const state = session.getState().state
    const player = state.players[0]!
    if (control === 'absent' || control === 'opponent') player.occupationPlayed = []
    if (control === 'opponent') state.players[1]!.occupationPlayed = [CARD_ID]
    if (control === 'missing-animal') {
      player.resources.boar = 0
      delete player.stableAnimals['0-2']
    }
    if (control === 'used') player.cardStates[CARD_ID] = { flagged: true }
    session.loadState(state)
    const response = session.takeAction(0, 'wish-children')
    expect(response.ok).toBe(false)
    expect(familySize(response.state.players[0]!)).toBe(2)
    expect(response.state.actionSpaces.find((space) => space.id === 'wish-children')!.takenBy).toHaveLength(0)
    expect(response.state.events.some((event) => event.type === 'card.triggered' && event.sourceCardId === CARD_ID)).toBe(false)
  })

  it('preserves its allowance when the player cancels before accepting its sole legal replacement', () => {
    const session = setup(false)
    const offered = session.takeAction(0, 'wish-children')
    expect(choiceOptions(offered)).toHaveLength(1)
    expect(choiceOptions(offered)[0]!.sourceCard).toBe(CARD_ID)
    expect(familySize(offered.state.players[0]!)).toBe(2)
    const response = session.undoAction()
    expect(response.ok, response.error).toBe(true)
    expect(familySize(response.state.players[0]!)).toBe(2)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.flagged).not.toBe(true)
    expect(response.state.actionSpaces.find((space) => space.id === 'wish-children')!.takenBy).toHaveLength(0)
  })

  it('restores its allowance and growth when the player undoes an accepted replacement', () => {
    const session = setup(false)
    let response = session.takeAction(0, 'wish-children')
    const replacement = choiceOptions(response).find((option) => option.sourceCard === CARD_ID)
    expect(replacement).toBeDefined()
    response = session.resolveChoice(0, replacement!.value)
    expect(response.ok, response.error).toBe(true)
    expect(familySize(response.state.players[0]!)).toBe(3)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.flagged).toBe(true)
    response = session.undoAction()
    expect(response.ok, response.error).toBe(true)
    expect(familySize(response.state.players[0]!)).toBe(2)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.flagged).not.toBe(true)
    expect(response.state.actionSpaces.find((space) => space.id === 'wish-children')!.takenBy).toHaveLength(0)
  })

  it('preserves the allowance for a real next-round growth after Wooden Shed fills', () => {
    const session = setup()
    let response = session.takeAction(0, 'wish-children')
    expect(response.ok, response.error).toBe(true)
    expect(familySize(response.state.players[0]!)).toBe(3)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.flagged).not.toBe(true)
    expect(waiting(response).request.kind).toBe('confirm-next-player')
    response = confirm(session, response)

    for (const [actor, space] of [[1, 'forest'], [2, 'clay-pit'], [3, 'reed-bank'],
    [0, 'grain-seeds'], [1, 'day-laborer'], [2, 'fishing']] as const) {
      expect(response.state.currentPlayerIndex).toBe(actor)
      response = confirm(session, session.takeAction(actor, space))
    }
    response = session.takeAction(3, 'farmland')
    expect(response.ok, response.error).toBe(true)
    const farm = farmSelection(response)
    expect(farm?.farmType).toBe('plow')
    if (farm?.farmType !== 'plow') throw new Error('Expected plow selection')
    response = session.commitSelectionChoice(3, { tile: farm.selectableTiles[0]! })
    response = confirm(session, response)
    expect(response.state.round).toBe(6)
    expect(response.state.currentPlayerIndex).toBe(0)

    response = session.takeAction(0, 'wish-children')
    expect(response.ok, response.error).toBe(true)
    expect(waiting(response).promptKey).toBe('ui.interactionSelectReplacement')
    const replacement = choiceOptions(response).find((option) => option.sourceCard === CARD_ID)
    expect(replacement).toBeDefined()
    response = session.resolveChoice(0, replacement!.value)
    expect(response.ok, response.error).toBe(true)
    expect(familySize(response.state.players[0]!)).toBe(4)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.flagged).toBe(true)
    expect(waiting(response).request.kind).toBe('confirm-next-player')
    expect(response.state.events.filter((event) => event.type === 'card.triggered' && event.sourceCardId === CARD_ID)).toHaveLength(1)
    expect(response.state.log.length).toBeGreaterThan(0)
    expect(response.scores).toHaveLength(4)
  })
})

describe('E151 rule boundaries', () => {

  const E151 = 'E151_DeliveryNurse'

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

  function occupants(r: SessionResponse, space: string) {
    return findActionSpaceById(r.state, space)!.takenBy.filter(w => w.playerId === r.state.players[0]!.id)
  }

  function nurseSetup({ family = 2, missing = false, shed = false, round = 10 } = {}) {
    const session = evidence.track(createWorkSession({
      seed: 42, options: { playerCount: 4 }, configure: state => {
        state.round = round
        state.players.forEach(p => { p.resources.food = 20 })
        const p = state.players[0]!
        p.occupationPlayed = [E151]
        p.minorPlayed = shed ? ['A010_WoodenShed'] : []
        p.resources.food = 0
        p.resources.sheep = 1
        p.resources.boar = 1
        p.resources.cattle = missing ? 0 : 1
        p.stableTiles = [{ row: 0, col: 1 }, { row: 0, col: 2 }, { row: 0, col: 3 }]
        p.stableAnimals = { '0-1': 'sheep', '0-2': 'boar', '0-3': missing ? null : 'cattle' }
        setActiveWorkerCount(p, family)
        setWorkersAtHome(state, p, family)
      }
    }))
    assert.equal(familySize(session.state.players[0]!), family)
    assert.equal(session.state.players[0]!.rooms, 2)
    assert.deepEqual(session.state.players[0]!.resources.sheep, 1)
    assert.equal(session.state.players[0]!.stableTiles.length, 3)
    return session
  }

  function nurseGrowth(session: GameSession, space = 'wish-children') {
    let r = ok(session.takeAction(0, space))
    let offer = false
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice') {
      const option = getChoiceOptions(r).find(o => o.sourceCard === E151)
      if (option) {
        offer = true
        r = ok(session.resolveChoice(0, option.value))
      }
    }
    assert.equal(familySize(r.state.players[0]!), 3)
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player', JSON.stringify(r.interaction))
    return { r, offer }
  }

  function nurseTotals(r: SessionResponse) {
    const p = r.state.players[0]!
    return { family: familySize(p), sheep: p.resources.sheep, boar: p.resources.boar, cattle: p.resources.cattle, food: p.resources.food, used: p.cardStates[E151]?.flagged === true }
  }

  function finishNurseRound(s: GameSession) {
    turn(s, 1, 'forest')
    turn(s, 2, 'clay-pit')
    turn(s, 3, 'reed-bank')
    turn(s, 0, 'grain-seeds')
    turn(s, 1, 'day-laborer')
    turn(s, 2, 'fishing')
    const r = turn(s, 3, 'farmland')
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'farm-select' && expectFarmSelection(r).farmType === 'plow')
    ok(s.commitSelectionChoice(3, { tile: expectTileFarmSelection(r, 'plow').selectableTiles[0]! }))
    ready(s, 0)
  }

  it("no-room growth consumes once and undo restores animals worker and flag", () => {
    const s = nurseSetup()
    const before = undoRuleSnapshot(s.getState())
    const { r, offer } = nurseGrowth(s)
    assert.equal(offer, true)
    assert.deepEqual(nurseTotals(r), { family: 3, sheep: 1, boar: 1, cattle: 1, food: 0, used: true })
    assert.equal(occupants(r, 'wish-children').length, 2)
    assert.ok(r.scores)
    assert.equal(r.scores.length, 4)
    assert.ok(r.state.events.some(e => e.type === 'card.triggered' && e.sourceCardId === E151))
    assertUndoRestored(before, s.undoAction())
    const retry = nurseGrowth(s).r
    assert.deepEqual(nurseTotals(retry), { family: 3, sheep: 1, boar: 1, cattle: 1, food: 0, used: true })
  })

  it("missing cattle cannot bypass room and normal placement remains legal", () => {
    const s = nurseSetup({ missing: true })
    assertRejectedUnchanged(s, () => s.takeAction(0, 'wish-children'))
    const r = ok(s.takeAction(0, 'grain-seeds'))
    assert.equal(familySize(r.state.players[0]!), 2)
    assert.equal(r.state.players[0]!.resources.grain, 1)
    assert.equal(nurseTotals(r).used, false)
  })

  it("a real prior use never bypasses room again next round", () => {
    const s = nurseSetup()
    nurseGrowth(s)
    finishNurseRound(s)
    assert.equal(s.state.round, 11)
    assert.equal(familySize(s.state.players[0]!), 3)
    assertRejectedUnchanged(s, () => s.takeAction(0, 'wish-children'))
    const r = ok(s.takeAction(0, 'grain-seeds'))
    assert.equal(nurseTotals(r).used, true)
    assert.equal(familySize(r.state.players[0]!), 3)
    assert.equal(r.state.players[0]!.resources.grain, 2)
  })



  it("intrinsic no-room Urgent Wish never consumes the card allowance", () => {
    const s = nurseSetup({ round: 14 })
    const { r, offer } = nurseGrowth(s, 'urgent-wish-children')
    assert.equal(offer, false)
    assert.deepEqual(nurseTotals(r), { family: 3, sheep: 1, boar: 1, cattle: 1, food: 0, used: false })
  })
})
