import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import type { CardListenerContext } from '../../shared/cards/card-listeners'
import type { DraftGameEvent } from '../../shared/contract/events'
import { A146_StorehouseSteward_impl } from '../../shared/cards/A/A146_StorehouseSteward'

import '../../shared/cards/A/A146_StorehouseSteward'
import assert from 'node:assert/strict'
import { assertEmptyAccumulationRejected, assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit16Spaces from './_helpers/audit/ae-negative-16-spaces'

const CARD_ID = 'A146_StorehouseSteward'

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
) => A146_StorehouseSteward_impl.listeners![0]!.handler({
  state: { players: [{ id: 'p1', occupationPlayed: [CARD_ID] }] },
  player: { id: 'p1' },
  space: { id: 'fishing', gainPerRound: { food: 1 } },
  actionId: 'collect',
  phase: 'after',
  transactionEvents,
  actionEvents,
  result: { type: 'ok', resourcesGained },
} as unknown as CardListenerContext)

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

describe('ae-negative-16-spaces', () => {
  const { STEWARD, sessions, save, ok, setup, pile, turn, res } = audit16Spaces
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('A146 N1 exact food piles two through five give only the mapped material',()=>{for(const space of ['fishing','traveling-players'])for(const count of[2,3,4,5]){const s=setup(STEWARD,state=>pile(state,space,'food',count));const r=turn(s,0,space);assert.deepEqual(res(r),[2,3,4,5].map(n=>n===count?1:0));assert.equal(r.state.players[0]!.resources.food,40+count);assert.equal(r.state.actionSpaces.find(a=>a.id===space)!.resources.food,0);save(`A146-N1-${space}-${count}`,r)}})
  it('A146 N2 zero one six and seven food piles cannot yield any material',()=>{for(const count of[0,1,6,7]){const s=setup(STEWARD,state=>pile(state,'fishing','food',count));const r=count===0?assertEmptyAccumulationRejected(s,0,'fishing'):turn(s,0,'fishing');assert.deepEqual(res(r),[0,0,0,0]);assert.equal(r.state.players[0]!.resources.food,40+count);save(`A146-N2-${count}`,r)}})
  it('A146 N3 ordinary Day Laborer food and reserve food cannot count as accumulation',()=>{const r=turn(setup(STEWARD,state=>state.players[0]!.resources.food=3),0,'day-laborer');assert.equal(r.state.players[0]!.resources.food,5);assert.deepEqual(res(r),[0,0,0,0]);save('A146-N3',r)})
  it('A146 N4 hand and actual opponent accumulation do not reward wrong owner',()=>{const hs=setup(STEWARD,state=>pile(state,'fishing','food',2),false);const hand=turn(hs,0,'fishing');assert.deepEqual(res(hand),[0,0,0,0]);const s=setup(STEWARD,state=>pile(state,'fishing','food',2));turn(s,0,'grain-seeds');const other=turn(s,1,'fishing');assert.deepEqual(res(other),[0,0,0,0]);assert.equal(other.state.players[1]!.resources.stone,0);save('A146-N4',{hand,other})})
  it('A146 N5 occupied input and whole undo cannot duplicate mapped reward',()=>{const s=setup(STEWARD,state=>pile(state,'fishing','food',2));const first=turn(s,0,'fishing');assertRejectedUnchanged(s,()=>s.takeAction(0,'fishing'));const undone=ok(s.undoAction());assert.deepEqual(res(undone),[0,0,0,0]);assert.equal(undone.state.players[0]!.resources.food,40);assert.equal(undone.state.actionSpaces.find(a=>a.id==='fishing')!.resources.food,2);const retry=turn(s,0,'fishing');assert.deepEqual(res(retry),[1,0,0,0]);save('A146-N5',{first,undone,retry})})
})
