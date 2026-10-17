import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { confirmPlayerSwitch } from './_helpers/pending-confirms'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/A/A050_MilkJug'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged, assertUndoRestored, undoRuleSnapshot } from './_helpers/negative-rule-audit'
import * as audit08Income from './_helpers/audit/ae-negative-08-income'

const CARD_ID = 'A050_MilkJug'

const purchaseSession = (clay: number) => {
  const session = new GameSession(50, undefined, { playerCount: 4 })
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = 1
  state.roundPhase = 'work'
  setWorkersAtHome(state, state.players[0]!, 2)
  state.players[0]!.minorHand = [CARD_ID]
  state.players[0]!.resources.clay = clay
  session.loadState(state)
  return session
}

const openMinorPrompt = (session: GameSession) => {
  let response = session.takeAction(0, 'meeting-place')
  expect(response.ok, response.error).toBe(true)
  if (response.interaction.stateId !== 'wait') return response
  if (response.interaction.request.options?.some((option) => option.value === CARD_ID)) return response
  const improvement = response.interaction.request.options?.find((option) =>
    option.value.startsWith('action-improvement-'),
  )
  if (improvement) response = session.resolveChoice(0, improvement.value)
  return response
}

const cardOption = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options?.find((option) => option.value === CARD_ID)
  : undefined

const playMinor = (session: GameSession) => {
  const response = openMinorPrompt(session)
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  const option = cardOption(response)
  expect(option).toBeDefined()
  return session.resolveChoice(0, option!.value)
}

const actionSession = (actor: number) => {
  const session = new GameSession(50, undefined, { playerCount: 4 })
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = actor
  state.round = 12
  state.roundPhase = 'work'
  state.players[0]!.minorPlayed = [CARD_ID]
  state.players.forEach((player, index) => {
    setWorkersAtHome(state, player, index === actor ? 2 : 0)
    player.resources.food = 0
    player.pastures = [{
      id: `pasture-${index}`,
      size: 1,
      tiles: [{ row: 0, col: index }],
      stables: 0,
      animalType: null,
      animalCount: 0,
    }]
  })
  state.actionSpaces.find((space) => space.id === 'cattle-market')!.resources.cattle = 1
  session.loadState(state)
  return session
}

const useCattleMarket = (session: GameSession, actor: number) => {
  let response = session.takeAction(actor, 'cattle-market')
  expect(response.ok, response.error).toBe(true)
  if (
    response.interaction.stateId === 'wait'
    && response.interaction.request.kind === 'animal-reorg'
  ) {
    response = session.resolveChoice(actor, 'confirm', [{
      id: `pasture-${actor}`,
      zoneType: 'pasture',
      animalType: 'cattle',
      animalCount: 1,
    }])
  }
  while (
    response.interaction.stateId === 'wait'
    && response.interaction.request.kind === 'confirm-player-switch'
  ) response = confirmPlayerSwitch(session)
  return response
}

describe('A050 Milk Jug parity', () => {
  it('A050 S1: playing Milk Jug costs one clay and keeps the card in play', () => {
    const response = playMinor(purchaseSession(1))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.clay).toBe(0)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
  })

  it('A050 S2: no clay keeps Milk Jug unavailable', () => {
    const session = purchaseSession(0)
    const response = openMinorPrompt(session)

    expect(cardOption(response)).toBeUndefined()
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
  })

  it('A050 S3: owner using Cattle Market gains three food and gives every other player one', () => {
    const response = useCattleMarket(actionSession(0), 0)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players.map((player) => player.resources.food)).toEqual([3, 1, 1, 1])
  })

  it('A050 S4: opponent using Cattle Market still rewards the owner and every other player', () => {
    const response = useCattleMarket(actionSession(1), 1)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players.map((player) => player.resources.food)).toEqual([3, 1, 1, 1])
  })

  it('A050 S5: a non-Cattle-Market action does not trigger Milk Jug', () => {
    const session = actionSession(1)

    const response = session.takeAction(1, 'day-laborer')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players.map((player) => player.resources.food)).toEqual([0, 2, 0, 0])
  })
})

describe('ae-negative-08-income', () => {
  const { MILK, YOUNG, sessions, setup, buy, deny, ready, turn, food, milk, settle } = audit08Income
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('A050 N1 actual Milk Jug purchase pays one clay without immediate food', () => {
    deny(setup(MILK, { resources: { clay: 0 } }), MILK); const r = buy(milk(), MILK); assert.equal(r.state.players[0]!.resources.clay, 0); assert.deepEqual(food(r), [40, 40])
  })
  it('A050 N2 real purchase then owner or opponent Cattle Market use pays owner three and opponent one', () => {
    for (const actor of [0, 1]) { const s = milk(); buy(s, MILK); if (actor === 0) turn(s, 1, 'forest'); const r = settle(s, turn(s, actor, 'cattle-market'), actor); assert.deepEqual(food(r), [43, 41]); assert.equal(r.state.players[actor]!.resources.cattle, 1); ready(s, 1 - actor); assertRejectedUnchanged(s, () => s.takeAction(1 - actor, 'cattle-market')) }
  })
  it('A050 N3 not yet played Milk Jug and actual Sheep Market do not award Cattle Market food', () => {
    const unplayed = milk(); let r = settle(unplayed, turn(unplayed, 0, 'cattle-market'), 0); assert.deepEqual(food(r), [40, 40]); assert.equal(r.state.players[0]!.resources.cattle, 1)
    const s = milk(); buy(s, MILK); turn(s, 1, 'forest'); r = settle(s, turn(s, 0, 'sheep-market'), 0); assert.deepEqual(food(r), [40, 40]); assert.equal(r.state.players[0]!.resources.sheep, 1)
  })
  it('A050 N4 actual Young Animal Market cattle acquisition without Cattle Market gives no Milk Jug food', () => {
    const s = milk({ sheep: 1, young: true }); buy(s, MILK); turn(s, 1, 'forest'); ready(s, 0); const r = settle(s, buy(s, YOUNG, 'major-improvement'), 0); assert.equal(r.state.players[0]!.resources.sheep, 0); assert.equal(r.state.players[0]!.resources.cattle, 1); assert.deepEqual(food(r), [40, 40])
  })
  it('A050 N5 whole Cattle Market action undo and retry restores both recipients and housed cow', () => {
    const s = milk({ played: true }); const before = undoRuleSnapshot(s.getState()); let r = settle(s, turn(s, 0, 'cattle-market'), 0); assert.deepEqual(food(r), [43, 41]); assertUndoRestored(before, s.undoAction()); r = settle(s, turn(s, 0, 'cattle-market'), 0); assert.deepEqual(food(r), [43, 41]); assert.equal(r.state.players[0]!.resources.cattle, 1)
  })
})
