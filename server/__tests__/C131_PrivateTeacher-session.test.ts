import assert from 'node:assert/strict'
import { describe, expect, it } from 'vitest'
import type { GameSession, SessionResponse } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'
import { createScenarioEvidence } from './_helpers/scenario-evidence'
import { assertRejectedUnchanged } from './_helpers/session-assertions'

const CARD = 'C131_PrivateTeacher'
const GREENGROCER = 'B142_Greengrocer'
const evidence = createScenarioEvidence(import.meta.url)

function setup({ occupation = 'A125_Priest', food = 20, greengrocerPlayed = false } = {}) {
  // Both Private Teacher and Greengrocer have a 3+ player requirement.
  return evidence.track(createWorkSession({ seed: 4242, options: { playerCount: 3 }, configure(state) {
    state.round = 14
    for (const player of state.players) {
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
      Object.assign(player.resources, { food: 20, wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 })
    }
    const owner = state.players[0]!
    owner.occupationPlayed = greengrocerPlayed ? [GREENGROCER] : [CARD]
    owner.occupationHand = [occupation]
    owner.resources.food = food
    state.players[1]!.occupationHand = ['A143_Stonecutter']
    state.actionSpaces.find(space => space.id === 'forest')!.resources.wood = 3
  } }))
}

function confirmNext(session: GameSession, response: SessionResponse, playerIndex: number) {
  assert.equal(response.ok, true, response.error)
  assert.ok(response.interaction.stateId === 'wait' && response.interaction.request.kind === 'confirm-next-player')
  expect(response.interaction.request.nextPlayerIndex).toBe(playerIndex)
  const next = session.resolveChoice(playerIndex, 'confirm')
  expect(next.ok, next.error).toBe(true)
  expect(next.interaction.stateId).toBe('idle')
  expect(next.state.currentPlayerIndex).toBe(playerIndex)
}

function grainAfterOtherPlayers(session: GameSession, occupied = true) {
  confirmNext(session, session.takeAction(0, 'forest'), 1)
  const opponent = session.takeAction(1, occupied ? 'lessons' : 'clay-pit')
  expect(opponent.ok, opponent.error).toBe(true)
  expect(opponent.state.players[1]!.occupationPlayed).toEqual(occupied ? ['A143_Stonecutter'] : [])
  expect(opponent.state.actionSpaces.find(space => space.id === 'lessons')!.takenBy).toHaveLength(occupied ? 1 : 0)
  confirmNext(session, opponent, 2)
  confirmNext(session, session.takeAction(2, occupied ? 'clay-pit' : 'reed-bank'), 0)
  const grain = session.takeAction(0, 'grain-seeds')
  expect(grain.ok, grain.error).toBe(true)
  expect(grain.state.players[0]!.resources).toMatchObject({ wood: 3, grain: 1 })
  evidence.record('Grain Seeds after real placements', grain)
  return grain
}

function offer(response: SessionResponse) {
  assert.ok(response.interaction.stateId === 'wait' && response.interaction.request.kind === 'choice')
  expect(response.interaction.sourceCard).toBe(CARD)
  expect(response.interaction.promptKey).toBe('ui.interactionOptionalAction')
  expect(response.interaction.request.options.map(option => option.labelKey)).toEqual(['actions.lessons.name', 'ui.interactionOptionalSkip'])
  const action = response.interaction.request.options.find(option => option.labelKey === 'actions.lessons.name')
  assert.ok(action)
  expect(action.effectPreview).toMatchObject({ kind: 'payment', resourcesPaid: { food: 1 } })
  return action
}

function expectCompleted(response: SessionResponse) {
  expect(response.ok, response.error).toBe(true)
  assert.ok(response.interaction.stateId === 'wait' && response.interaction.request.kind === 'confirm-next-player')
  expect(response.interaction.request.nextPlayerIndex).toBe(1)
  expect(response.scores).toHaveLength(3)
  expect(response.state.log.length).toBeGreaterThan(0)
}

function expectOneOccupation(response: SessionResponse, occupation: string) {
  expectCompleted(response)
  const owner = response.state.players[0]!
  expect(owner.occupationPlayed.filter(card => card === occupation)).toHaveLength(1)
  expect(owner.occupationHand).not.toContain(occupation)
  expect(owner.resources).toMatchObject({ food: 19, grain: 1, wood: 3 })
  expect(response.state.events.flatMap(event => event.type === 'resource.paid' && event.sourceCardId === occupation && event.actorPlayerId === owner.id ? [event.resources] : [])).toEqual([{ food: 1 }])
  expect(response.state.events.filter(event => event.type === 'card.played' && event.cardId === occupation && event.actorPlayerId === owner.id)).toHaveLength(1)
}

describe('C131 Private Teacher', () => {
  it('plays exactly one occupation for one food after an opponent occupies Lessons', () => {
    const session = setup()
    const pending = grainAfterOtherPlayers(session)
    const action = offer(pending)
    const response = session.resolveChoice(0, action.value)
    expectOneOccupation(response, 'A125_Priest')
    assertRejectedUnchanged(session, () => session.resolveChoice(0, action.value))
  })

  it('keeps the occupation in hand for vacant Lessons, explicit decline, or no food', () => {
    for (const mode of ['vacant', 'decline', 'short']) {
      const session = setup({ food: mode === 'short' ? 0 : 20 })
      let response = grainAfterOtherPlayers(session, mode !== 'vacant')
      if (mode === 'decline') {
        offer(response)
        response = session.resolveChoice(0, '__skip__')
      }
      expectCompleted(response)
      const owner = response.state.players[0]!
      expect(owner.occupationPlayed).toEqual([CARD])
      expect(owner.occupationHand).toEqual(['A125_Priest'])
      expect(owner.resources).toMatchObject({ food: mode === 'short' ? 0 : 20, grain: 1, wood: 3 })
      expect(response.state.events.filter(event => event.type === 'card.played' && event.cardId === 'A125_Priest')).toEqual([])
      expect(response.state.events.filter(event => event.type === 'resource.paid' && event.sourceCardId === 'A125_Priest')).toEqual([])
    }
  })

  it('keeps a newly played Greengrocer outside the current Grain Seeds reaction window', () => {
    const control = setup({ greengrocerPlayed: true })
    const alreadyPlayed = control.takeAction(0, 'grain-seeds')
    expectCompleted(alreadyPlayed)
    expect(alreadyPlayed.state.players[0]!.resources).toMatchObject({ grain: 1, vegetable: 1 })

    const session = setup({ occupation: GREENGROCER })
    const pending = grainAfterOtherPlayers(session)
    const response = session.resolveChoice(0, offer(pending).value)
    expectOneOccupation(response, GREENGROCER)
    // Current OA behavior; the alternate expectation remains deferred in #1175/#1181.
    expect(response.state.players[0]!.resources.vegetable).toBe(0)
  })
})
