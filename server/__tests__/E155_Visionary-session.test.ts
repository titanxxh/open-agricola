import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'

import { E155_Visionary_impl } from '../../shared/cards/E/E155_Visionary'
import {
  setActiveWorkerCount,
  setNewbornCount,
  familySize,
} from '../../shared/domain/player'
import type { ActionHookPhase, ActionHookResult } from '../../shared/actions/hooks'
import type { CardListenerContext } from '../../shared/cards/card-listeners'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit56Family from './_helpers/audit/ae-negative-56-family'

const CARD_ID = 'E155_Visionary'

const setup = (round: number) => {
  const session = new GameSession(42)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = round

  const owner = state.players[0]!
  const opponent = state.players[1]!
  owner.occupationPlayed.push(CARD_ID)
  return { session, state, owner, opponent }
}

const findIsDoableListener = () =>
  E155_Visionary_impl.listeners.find((l) => l.phases?.includes('isDoable' as ActionHookPhase))

describe('E155 Visionary — isDoable listener', () => {
  it('blocks family-growth in round 5 when opponent has not grown (familySize === 2)', () => {
    const { state, owner, opponent } = setup(5)
    expect(familySize(opponent)).toBe(2) // initial / not grown

    const listener = findIsDoableListener()
    expect(listener).toBeDefined()
    const ctx = {
      state,
      player: owner,
      actionId: 'family-growth',
      phase: 'isDoable' as ActionHookPhase,
    } as unknown as CardListenerContext
    const result = listener!.handler(ctx) as ActionHookResult | undefined
    expect(result).toEqual({ doable: false })
  })

  it('allows family-growth in round 5 when opponent has grown (familySize === 3)', () => {
    const { state, owner, opponent } = setup(5)
    setActiveWorkerCount(opponent, 3)
    setNewbornCount(opponent, 0)
    expect(familySize(opponent)).toBe(3)

    const listener = findIsDoableListener()!
    const ctx = {
      state,
      player: owner,
      actionId: 'family-growth',
      phase: 'isDoable' as ActionHookPhase,
    } as unknown as CardListenerContext
    expect(listener.handler(ctx)).toBeUndefined()
  })

  it('allows family-growth in round 11 even when opponent has not grown', () => {
    const { state, owner, opponent } = setup(11)
    expect(familySize(opponent)).toBe(2)

    const listener = findIsDoableListener()!
    const ctx = {
      state,
      player: owner,
      actionId: 'family-growth',
      phase: 'isDoable' as ActionHookPhase,
    } as unknown as CardListenerContext
    expect(listener.handler(ctx)).toBeUndefined()
  })
})

describe('E155 Visionary — onBuy effect', () => {
  it('grants 1 stone + 1 vegetable + 2 boar when bought in round <= 4', () => {
    const { state } = setup(4)
    const onBuy = E155_Visionary_impl.effect.onBuy!
    const result = onBuy(state)
    expect(result).toBeTruthy()
    expect(result?.type).toBe('leaf')
    expect(result?.actionId).toBe('gain')
    expect(result?.params).toEqual({ stone: 1, vegetable: 1, boar: 2 })
    expect(result?.sourceCard).toBe(CARD_ID)
  })

  it('grants nothing when bought in round 5+', () => {
    const { state } = setup(5)
    const onBuy = E155_Visionary_impl.effect.onBuy!
    expect(onBuy(state)).toBeUndefined()
  })
})

describe('ae-negative-56-family', () => {
  const { sessions, ok, save, make, finish, play, people, pasture } = audit56Family
  afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
  it('E155 N1 real Visionary purchase by round four gains one stone one vegetable two pigs but round five gains none',()=>{for(const round of[4,5]){const s=make('E155_Visionary',st=>pasture(st.players[0]!),false,round),r=finish(s,play(s,'E155_Visionary'));assert.deepEqual([r.state.players[0]!.resources.stone,r.state.players[0]!.resources.vegetable,r.state.players[0]!.resources.boar],round===4?[1,1,2]:[0,0,0]);save(`E155-N1-${round}`,r)}})
  it('E155 N2 before round eleven one ungrown opponent rejects growth while all grown opponents and round eleven permit it',()=>{for(const[round,all]of[[10,false],[10,true],[11,false]]as const){const s=make('E155_Visionary',st=>{people(st.players[0]!,3);setActiveWorkerCount(st.players[0]!,2);if(all)st.players.slice(1).forEach(p=>people(p,3));},true,round);if(round===10&&!all){const rejected=assertRejectedUnchanged(s,()=>s.takeAction(0,'wish-children')),r=finish(s,ok(s.takeAction(0,'grain-seeds')));assert.equal(familySize(r.state.players[0]!),2);save(`E155-N2-${round}-${all}`,{rejected,r})}else{const r=finish(s,ok(s.takeAction(0,'wish-children')),true);assert.equal(familySize(r.state.players[0]!),3);save(`E155-N2-${round}-${all}`,r)}}})
  it('E155 N3 held Visionary cannot block ordinary growth or grant early purchase gifts on unrelated placement',()=>{for(const mode of['growth','unrelated']){const s=make('E155_Visionary',st=>{people(st.players[0]!,3);setActiveWorkerCount(st.players[0]!,2);},false,mode==='growth'?10:4),r=finish(s,ok(s.takeAction(0,mode==='growth'?'wish-children':'grain-seeds')),true);assert.equal(familySize(r.state.players[0]!),mode==='growth'?3:2);assert.deepEqual([r.state.players[0]!.resources.stone,r.state.players[0]!.resources.vegetable,r.state.players[0]!.resources.boar],[0,0,0]);save(`E155-N3-${mode}`,r)}})
})
