import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setActiveWorkerCount, setWorkersAtHome } from '../../shared/domain/player'

import '../../shared/cards/C/C168_AnimalCatcher'
import assert from 'node:assert/strict'
import { assertRuleOutcome, assertUndoRestored, undoRuleSnapshot } from './_helpers/negative-rule-audit'
import * as auditC168 from './_helpers/audit/ae-negative-C168'

const CARD_ID = 'C168_AnimalCatcher'
const ANIMALS = ['sheep', 'boar', 'cattle'] as const

const setup = ({ round = 1, food = 10, fireplace = false } = {}) => {
  const session = new GameSession(168, undefined, { playerCount: 2 })
  const state = session.state
  state.round = round
  state.roundPhase = 'work'
  state.currentPlayerIndex = 0
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  for (const player of state.players) {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
    player.minorPlayed = []
    player.occupationPlayed = []
    player.improvements = []
    player.cardStates = {}
    player.houseAnimals = {};
    player.stableAnimals = {}
    player.resources = { ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0, food: 0, sheep: 0, boar: 0, cattle: 0 }
    setActiveWorkerCount(player, 2)
    setWorkersAtHome(state, player, 2)
  }
  const player = state.players[0]!
  player.occupationPlayed = [CARD_ID]
  player.resources.food = food
  player.improvements = fireplace ? ['Major_Fireplace1'] : []
  player.pastures = [{ row: 0, col: 2 }, { row: 0, col: 4 }, { row: 2, col: 4 }].map((tile, index) => ({
    id: `pasture-${index}`, tiles: [tile], size: 1, stables: 0, animalType: null, animalCount: 0,
  }))
  session.loadState(state)
  return session
}

const chooseAnimals = (session: GameSession) => {
  const offered = session.takeAction(0, 'day-laborer')
  expect(offered.ok, offered.error).toBe(true)
  expect(offered.interaction.promptKey).toBe('ui.interactionSelectReplacement')
  expect(offered.state.players[0]!.resources).toMatchObject({ sheep: 0, boar: 0, cattle: 0 })
  const choice = offered.interaction.request.options!.find((option) => option.sourceCard === CARD_ID)!
  return session.resolveChoice(0, choice.value)
}

const houseAnimals = (session: GameSession, response: SessionResponse) => {
  if (response.interaction.request.kind !== 'animal-reorg') return response
  const zones = ANIMALS.flatMap((animalType, index) => response.state.players[0]!.resources[animalType] > 0
    ? [{ id: `pasture-${index}`, zoneType: 'pasture', animalType, animalCount: 1 }] : [])
  return session.resolveChoice(0, 'confirm', { zones })
}

describe('C168 Animal Catcher committed replacement', () => {
  it.each([[1, 6], [11, 3]])('gains three animals and pays the remaining %i round harvest cost of %i', (round, cost) => {
    const session = setup({ round })
    let response = chooseAnimals(session)
    expect(response.ok, response.error).toBe(true)
    response = houseAnimals(session, response)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 10 - cost, sheep: 1, boar: 1, cattle: 1 })
    expect(response.interaction.request.kind).toBe('confirm-next-player')
    expect(response.state.events.filter((event) => event.type === 'resource.paid' && event.resources.food === cost)).toHaveLength(1)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.flagged).not.toBe(true)
  })

  it('declines replacement to gain only the normal two food', () => {
    const session = setup({ food: 5 })
    const offered = session.takeAction(0, 'day-laborer')
    const original = offered.interaction.request.options!.find((option) => option.labelKey === 'ui.interactionDoNotReplace')!
    const response = session.resolveChoice(0, original.value)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 7, sheep: 0, boar: 0, cattle: 0 })
    expect(response.interaction.request.kind).toBe('confirm-next-player')
  })

  it('retains received animals when payment is blocked and restores them on Undo Action', () => {
    const session = setup({ food: 5 })
    const blocked = chooseAnimals(session)
    expect(blocked.interaction.request.kind).toBe('engine-blocked')
    expect(blocked.state.players[0]!.resources).toMatchObject({ food: 5, sheep: 1, boar: 1, cattle: 1 })
    const response = session.undoAction(0)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 5, sheep: 0, boar: 0, cattle: 0 })
    expect(response.state.actionSpaces.find((space) => space.id === 'day-laborer')!.takenBy).toEqual([])
  })

  it('cooks the newly received sheep to fund the required payment and continue', () => {
    const session = setup({ food: 5, fireplace: true })
    let response = chooseAnimals(session)
    expect(response.interaction.promptKey).toBe('ui.interactionBeforeAnytime')
    expect(response.state.players[0]!.resources).toMatchObject({ food: 5, sheep: 1, boar: 1, cattle: 1 })
    response = session.takeAnytimeAction(0, 'exchange')
    const cook = response.interaction.request.options!.find((option) => option.effectPreview?.resourcesPaid?.sheep === 1)!
    expect(cook, JSON.stringify(response.interaction)).toBeDefined()
    response = session.resolveChoice(0, cook.value)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 7, sheep: 0 })
    expect(response.interaction.promptKey).toBe('ui.interactionBeforeAnytime')
    response = session.resolveChoice(0, 'continue')
    response = houseAnimals(session, response)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 1, sheep: 0, boar: 1, cattle: 1 })
    expect(response.interaction.request.kind).toBe('confirm-next-player')
  })

  it('does not offer the animal replacement on Grain Seeds', () => {
    const response = setup().takeAction(0, 'grain-seeds')
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 1, food: 10, sheep: 0, boar: 0, cattle: 0 })
    expect(response.interaction.request.kind).toBe('confirm-next-player')
  })
})

describe('ae-negative-C168', () => {
  const { CARD, sessions, setup, choose, houseAnimals, totals } = auditC168
  afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
  describe('C168 negative audit: only Day Laborer base food is replaceable', () => {
    it('N1 replacing E059 extra food loses the wrong reward', () => {
      const session = setup()
      assert.equal(session.takeAction(0, 'day-laborer').ok, true)
      const replaced = choose(session, true)
      if (replaced.interaction.stateId === 'wait' && replaced.interaction.request.kind === 'choice') choose(session, false)
      const result = houseAnimals(session)
      assertRuleOutcome(totals(result), { food: 5, sheep: 1, boar: 1, cattle: 1 })
    })
    it('N2 one Day Laborer use must not offer a second animal replacement', () => {
      const session = setup()
      assert.equal(session.takeAction(0, 'day-laborer').ok, true)
      const r = choose(session, true)
      const secondOffer = r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice' && r.interaction.request.options.some(o => o.sourceCard === CARD)
      assertRuleOutcome(secondOffer, false)
    })
    it('N3 replacing the base reward preserves the independent extra food and charges once', () => {
      const session = setup()
      assert.equal(session.takeAction(0, 'day-laborer').ok, true)
      choose(session, true)
      const result = houseAnimals(session)
      assert.deepEqual(totals(result), { food: 5, sheep: 1, boar: 1, cattle: 1 })
      assert.equal(result.scores?.length, 4)
      assert.equal(result.state.events.filter(event => event.type === 'resource.paid' && event.resources.food === 6).length, 1)
    })
    it('N4 declining replacements preserves both ordinary food rewards', () => {
      const session = setup()
      session.takeAction(0, 'day-laborer')
      const r = choose(session, false)
      assert.deepEqual(totals(r), { food: 13, sheep: 0, boar: 0, cattle: 0 })
    })
    it('N5 insufficient food follows the accepted blocked path, with full undo and legal retry', () => {
      const session = setup(5, false)
      const baseline = undoRuleSnapshot(session.getState())
      session.takeAction(0, 'day-laborer')
      const blocked = choose(session, true)
      assert.ok(blocked.interaction.stateId === 'wait' && blocked.interaction.request.kind === 'engine-blocked')
      assert.equal(blocked.state.players[0]!.resources.food, 5)
      const undone = session.undoAction()
      assert.equal(undone.ok, true, undone.error)
      assertUndoRestored(baseline, undone)
      session.takeAction(0, 'day-laborer')
      const retry = choose(session, false)
      assert.deepEqual(totals(retry), { food: 7, sheep: 0, boar: 0, cattle: 0 })
    })
  })
})
