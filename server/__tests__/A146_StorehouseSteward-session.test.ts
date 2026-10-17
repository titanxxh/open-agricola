import { createInitialState } from '../../shared/session/state-bootstrap'
import { ActionHookRegistry } from '../../shared/actions/hooks'
import { createEventQuery } from '../../shared/events/query'
import { invokeListenerHandlerUnderGuard } from '../../shared/cards/__tests__/listener-purity-guard'
import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { type CardListenerContext } from '../../shared/cards/card-listeners'
import { type DraftGameEvent } from '../../shared/contract/events'
import { A146_StorehouseSteward_impl } from '../../shared/cards/A/A146_StorehouseSteward'
import assert from 'node:assert/strict'
import { type GameState } from '../../shared/contract/types'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertEmptyAccumulationRejected, assertRejectedUnchanged, confirmNext , undoRuleSnapshot , assertUndoRestored } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'

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

const CARD_ID = 'A146_StorehouseSteward'

const setup = (fishingFood: number) => {
  const session = sessionEvidence.track(createWorkSession({ seed: 42 }))
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
) => {
  const state = createInitialState(42, { playerCount: 3 })
  const player = state.players[0]!
  player.id = 'p1'
  player.occupationPlayed = [CARD_ID]
  const space = state.actionSpaces.find(candidate => candidate.id === 'fishing')
  const registration = A146_StorehouseSteward_impl.listeners?.[0]
  assert.ok(space && registration)
  return invokeListenerHandlerUnderGuard(registration, {
    state, player, space, actionHooks: new ActionHookRegistry(),
    actionId: 'collect', phase: 'after', transactionEvents, actionEvents,
    eventQuery: createEventQuery(actionEvents ?? transactionEvents),
    result: { type: 'ok', resourcesGained },
  } satisfies CardListenerContext)
}

describe('A146_StorehouseSteward session', () => {
  it.each([
    { food: 2, gain: { stone: 1 } },
    { food: 3, gain: { reed: 1 } },
    { food: 4, gain: { clay: 1 } },
    { food: 5, gain: { wood: 1 } },
  ])('maps $food action-space food to $gain', ({ food, gain }) => {
    const session = setup(food)
    const foodBefore = session.getState().state.players[0]!.resources.food

    const resp = session.takeAction(0, 'fishing')

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.food).toBe(foodBefore + food)
    expect(resp.state.players[0]!.resources).toMatchObject(gain)
  })

  it.each([1, 6])('does not trigger outside the 2-5 food map for %i food', (food) => {
    const session = setup(food)
    const foodBefore = session.getState().state.players[0]!.resources.food

    const resp = session.takeAction(0, 'fishing')

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.food).toBe(foodBefore + food)
    expect(resp.state.players[0]!.resources).toMatchObject({
      wood: 0,
      clay: 0,
      reed: 0,
      stone: 0,
    })
  })
})

describe('A146_StorehouseSteward listener provenance guard', () => {
  it('ignores generic supply/cardEffect food even when result reports food gained', () => {
    const result = runListener([supplyCardEffectFood(3)], { food: 3 })

    expect(result).toBeUndefined()
  })

  it('ignores stale transaction food when current action has no food movement', () => {
    const result = runListener([fishingFood(3)], { food: 3 }, [])

    expect(result).toBeUndefined()
  })
})

describe("A146 command boundaries", () => {
  const STEWARD = 'A146_StorehouseSteward'
  function save(id: string, value: unknown) {
    sessionEvidence.record(id, value)
  }
  function ok(r: SessionResponse) {
    assert.equal(r.ok, true, r.error)
    return r
  }
  function setup(configure: (state: GameState) => void = () => {
  }, played = true) {
    // Traveling Players is a four-player accumulation space in this matrix.
    const players = 4
    const s = sessionEvidence.track(createWorkSession({ seed: 4242, options: { playerCount: players }, configure(state) {
        state.round = 14
        for (const p of state.players)
          Object.assign(p.resources, { food: 40, wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0 })
        state.players[0]!.occupationPlayed = played ? [STEWARD] : []
        state.players[0]!.occupationHand = played ? ['__test_placeholder__'] : [STEWARD, 'A110_Roughcaster']
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
  function res(r: SessionResponse) {
    return (['stone', 'reed', 'clay', 'wood'] as const).map(k => r.state.players[0]!.resources[k])
  }
  it("exact food piles two through five give only the mapped material", () => {
    for (const space of ['fishing', 'traveling-players'])
      for (const count of [2, 3, 4, 5]) {
        const s = setup(state => pile(state, space, 'food', count))
        const r = turn(s, 0, space)
        assert.deepEqual(res(r), [2, 3, 4, 5].map(n => n === count ? 1 : 0))
        assert.equal(r.state.players[0]!.resources.food, 40 + count)
        assert.equal(r.state.actionSpaces.find(a => a.id === space)!.resources.food, 0)
        save(`A146-N1-${space}-${count}`, r)
      }
  })
  it("zero one six and seven food piles cannot yield any material", () => {
    for (const space of ['fishing', 'traveling-players'])
      for (const count of [0, 1, 6, 7]) {
        const s = setup(state => pile(state, space, 'food', count))
        const r = count === 0 ? assertEmptyAccumulationRejected(s, 0, space) : turn(s, 0, space)
        assert.deepEqual(res(r), [0, 0, 0, 0])
        if (count === 0) {
          assert.equal(r.interaction.stateId, 'idle')
          assert.equal(r.state.currentPlayerIndex, 0)
        }
        assert.equal(r.state.players[0]!.resources.food, 40 + count)
        for (const actual of [r, s.getState()]) {
          assert.deepEqual(actual.state.players.map(player => player.resources), [0, 1, 2, 3].map(actor => ({
            wood: 0, clay: 0, reed: 0, stone: 0, food: actor === 0 ? 40 + count : 40,
            grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
          })))
          assert.equal(actual.state.actionSpaces.find(candidate => candidate.id === space)!.resources.food, 0)
          if (count === 0) {
            assert.equal(actual.interaction.stateId, 'idle')
            assert.equal(actual.state.currentPlayerIndex, 0)
          } else
            assertTurnFinished(actual, 0)
        }
        save(`A146-N2-${space}-${count}`, r)
      }
  })
  it("ordinary Day Laborer food and reserve food cannot count as accumulation", () => {
    const s = setup(state => state.players[0]!.resources.food = 3)
    const r = turn(s, 0, 'day-laborer')
    assert.equal(r.state.players[0]!.resources.food, 5)
    assert.deepEqual(res(r), [0, 0, 0, 0])
    const baseline = { wood: 0, clay: 0, reed: 0, stone: 0, food: 40, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 }
    for (const actual of [r, s.getState()])
      assert.deepEqual(actual.state.players.map(player => player.resources), [{ ...baseline, food: 5 }, baseline, baseline, baseline])
    save('A146-N3', r)
  })
  it("hand and actual opponent accumulation do not reward wrong owner", () => {
    const baseline = { wood: 0, clay: 0, reed: 0, stone: 0, food: 40, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 }
    for (const space of ['fishing', 'traveling-players']) {
      const hs = setup(state => pile(state, space, 'food', 2), false)
      const hand = turn(hs, 0, space)
      assert.deepEqual(res(hand), [0, 0, 0, 0])
      for (const actual of [hand, hs.getState()]) {
        assert.deepEqual(actual.state.players.map(player => player.resources), [{ ...baseline, food: 42 }, baseline, baseline, baseline])
        assert.equal(actual.state.actionSpaces.find(candidate => candidate.id === space)!.resources.food, 0)
      }
      const s = setup(state => pile(state, space, 'food', 2))
      turn(s, 0, 'grain-seeds')
      const other = turn(s, 1, space)
      assert.deepEqual(res(other), [0, 0, 0, 0])
      assert.equal(other.state.players[1]!.resources.stone, 0)
      for (const actual of [other, s.getState()]) {
        assert.deepEqual(actual.state.players.map(player => player.resources), [{ ...baseline, grain: 1 }, { ...baseline, food: 42 }, baseline, baseline])
        assert.equal(actual.state.actionSpaces.find(candidate => candidate.id === space)!.resources.food, 0)
      }
      save(`A146-N4-${space}`, { hand, other })
    }
  })
  it("occupied input and whole undo cannot duplicate mapped reward", () => {
    const s = setup(state => pile(state, 'fishing', 'food', 2))
    const assertOutcome = (response: SessionResponse) => {
      for (const result of [response, s.getState()]) {
        const player = result.state.players[0]!
        assert.deepEqual(player.resources, { wood: 0, clay: 0, reed: 0, stone: 1, food: 42, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 })
        assert.equal(result.state.actionSpaces.find(space => space.id === 'fishing')!.resources.food, 0)
      }
    }
    const first = turn(s, 0, 'fishing')
    assertOutcome(first)
    assert.deepEqual(res(first), [1, 0, 0, 0])
    assert.equal(first.state.players[0]!.resources.food, 42)
    assert.equal(first.state.actionSpaces.find(a => a.id === 'fishing')!.resources.food, 0)
    assertRejectedUnchanged(s, () => s.takeAction(0, 'fishing'))
    const undone = undo(s)
    assert.deepEqual(res(undone), [0, 0, 0, 0])
    assert.equal(undone.state.players[0]!.resources.food, 40)
    assert.equal(undone.state.actionSpaces.find(a => a.id === 'fishing')!.resources.food, 2)
    const retry = turn(s, 0, 'fishing')
    assertOutcome(retry)
    assert.deepEqual(res(retry), [1, 0, 0, 0])
    const occupied = setup(state => pile(state, 'fishing', 'food', 2))
    turn(occupied, 0, 'fishing')
    for (const [actor, space] of [[1, 'grain-seeds'], [2, 'clay-pit'], [3, 'reed-bank']] as const)
      turn(occupied, actor, space)
    const ready = confirmNext(occupied, occupied.getState())
    assert.equal(ready.interaction.stateId, 'idle')
    assert.equal(ready.state.currentPlayerIndex, 0)
    assertRejectedUnchanged(occupied, () => occupied.takeAction(0, 'fishing'))
    const legal = turn(occupied, 0, 'day-laborer')
    assert.equal(legal.state.players[0]!.resources.food, 44)
    assert.deepEqual(res(legal), [1, 0, 0, 0])
    save('A146-N5', { first, undone, retry, legal })
  })
})
