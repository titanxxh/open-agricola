import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import type { CardListenerContext } from '../../shared/cards/card-listeners'
import type { DraftGameEvent } from '../../shared/contract/events'
import { A103_Portmonger_impl } from '../../shared/cards/A/A103_Portmonger'

import '../../shared/cards/A/A103_Portmonger'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit12ResourceSource from './_helpers/audit/ae-negative-12-resource-source'

const CARD_ID = 'A103_Portmonger'

const setup = (fishingFood: number) => {
  const session = new GameSession(42)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0

  const player = state.players[0]!
  player.occupationPlayed.push(CARD_ID)
  player.minorHand = ['__test_placeholder__']
  player.occupationHand = ['__test_placeholder__']
  state.players[1]!.minorHand = ['__test_placeholder__']
  state.players[1]!.occupationHand = ['__test_placeholder__']

  const fishing = state.actionSpaces.find((space) => space.id === 'fishing')
  if (!fishing) throw new Error('fishing space missing')
  fishing.resources.food = fishingFood

  session.loadState(state)
  return session
}

const supplyCardEffectFood = (food: number): DraftGameEvent<'resource.moved'> => ({
  type: 'resource.moved',
  resources: { food },
  from: { kind: 'supply' },
  to: { kind: 'player', playerId: 'p1' },
  reason: 'cardEffect',
})

const fishingFood = (food: number): DraftGameEvent<'resource.moved'> => ({
  type: 'resource.moved',
  resources: { food },
  from: { kind: 'actionSpace', spaceId: 'fishing' },
  to: { kind: 'player', playerId: 'p1' },
  reason: 'collect',
})

const runListener = (
  transactionEvents: DraftGameEvent[],
  resourcesGained: { food?: number },
  actionEvents?: DraftGameEvent[],
) => A103_Portmonger_impl.listeners![0]!.handler({
  state: { players: [{ id: 'p1', occupationPlayed: [CARD_ID] }] },
  player: { id: 'p1' },
  space: { id: 'fishing', gainPerRound: { food: 1 } },
  actionId: 'collect',
  phase: 'after',
  transactionEvents,
  actionEvents,
  result: { type: 'ok', resourcesGained },
} as unknown as CardListenerContext)

describe('A103_Portmonger session', () => {
  it.each([
    { food: 1, gain: { vegetable: 1 } },
    { food: 2, gain: { grain: 1 } },
    { food: 3, gain: { reed: 1 } },
  ])('maps $food action-space food to $gain', ({ food, gain }) => {
    const session = setup(food)
    const foodBefore = session.getState().state.players[0]!.resources.food

    const resp = session.takeAction(0, 'fishing')

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.food).toBe(foodBefore + food)
    expect(resp.state.players[0]!.resources).toMatchObject(gain)
  })
})

describe('A103_Portmonger listener provenance guard', () => {
  it('ignores generic supply/cardEffect food even when result reports food gained', () => {
    const result = runListener([supplyCardEffectFood(3)], { food: 3 })

    expect(result).toBeUndefined()
  })

  it('ignores stale transaction food when current action has no food movement', () => {
    const result = runListener([fishingFood(3)], { food: 3 }, [])

    expect(result).toBeUndefined()
  })
})

describe('ae-negative-12-resource-source', () => {
  const { PORT, sessions, save, ok, setup, ready, turn, goods } = audit12ResourceSource
  afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
  it('A103 N1 original one two three and five food piles give vegetable grain and reed respectively', () => {
    for (const [amount, resource] of [[1, 'vegetable'], [2, 'grain'], [3, 'reed'], [5, 'reed']] as const) {
      const session = setup(PORT, state => state.actionSpaces.find(s => s.id === 'fishing')!.resources.food = amount)
      const response = turn(session, 0, 'fishing'); assert.equal(response.state.players[0]!.resources[resource], 1); assert.equal(response.state.players[0]!.resources.food, 40 + amount)
      assert.equal(response.state.actionSpaces.find(s => s.id === 'fishing')!.resources.food, 0); save(`A103-N1-${amount}`, response)
    }
  })
  it('A103 N2 Day Laborer food and nonfood collection cannot grant accumulation bonuses', () => {
    const response = turn(setup(PORT), 0, 'day-laborer'); assert.deepEqual(goods(response), { food: 42, wood: 0, clay: 0, reed: 0, grain: 0, vegetable: 0 })
    const forest = turn(setup(PORT), 0, 'forest'); assert.equal(forest.state.players[0]!.resources.wood, 3); assert.equal(forest.state.players[0]!.resources.reed, 0); assert.equal(forest.state.players[0]!.resources.grain, 0); save('A103-N2', { response, forest })
  })
  it('A103 N3 unplayed card and actual opponent Fishing cannot reward the owner', () => {
    const unplayed = turn(setup(PORT, state => state.actionSpaces.find(s => s.id === 'fishing')!.resources.food = 1, false), 0, 'fishing'); assert.equal(unplayed.state.players[0]!.resources.vegetable, 0)
    const session = setup(PORT, state => state.actionSpaces.find(s => s.id === 'fishing')!.resources.food = 1); turn(session, 0, 'grain-seeds'); const response = turn(session, 1, 'fishing')
    assert.equal(response.state.players[0]!.resources.vegetable, 0); assert.equal(response.state.players[1]!.resources.vegetable, 0); assert.equal(response.state.players[1]!.resources.food, 41); save('A103-N3', response)
  })
  it('A103 N4 occupied source rejects and whole undo restores pile and exactly one bonus', () => {
    const session = setup(PORT, state => state.actionSpaces.find(s => s.id === 'fishing')!.resources.food = 2)
    let response = turn(session, 0, 'fishing'); assert.equal(response.state.players[0]!.resources.grain, 1)
    const undone = ok(session.undoAction()); assert.equal(undone.state.players[0]!.resources.grain, 0); assert.equal(undone.state.players[0]!.resources.food, 40); assert.equal(undone.state.actionSpaces.find(s => s.id === 'fishing')!.resources.food, 2)
    response = turn(session, 0, 'fishing'); turn(session, 1, 'day-laborer'); ready(session, 0); assertRejectedUnchanged(session, () => session.takeAction(0, 'fishing')); assert.equal(session.getState().state.players[0]!.resources.grain, 1); save('A103-N4', { response, undone })
  })
})
