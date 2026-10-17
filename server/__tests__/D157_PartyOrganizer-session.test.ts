import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { D157_PartyOrganizer_impl } from '../../shared/cards/D/D157_PartyOrganizer'
import {
  setActiveWorkerCount,
  setNewbornCount,
  setWorkersAtHome,
  familySize,
} from '../../shared/domain/player'
import { isCardFlagged } from '../../shared/cards/helpers/card-state'
import { specialEffectAction } from '../../shared/actions/effects/special-effect'
import type {
  ActionHookPhase,
  ActionHookResult,
} from '../../shared/actions/hooks'
import type { CardListenerContext } from '../../shared/cards/card-listeners'
import type { ActionSpace, GameState, PlayerState } from '../../shared/contract/types'
import assert from 'node:assert/strict'
import * as audit56Family from './_helpers/audit/ae-negative-56-family'

const CARD_ID = 'D157_PartyOrganizer'

const buildOpponentLikePlayer = (overrides: Partial<PlayerState>): PlayerState => {
  // Lightweight player fixture for listener handler unit calls. Family size
  // is read from the workers array, so we build workers minimally.
  const session = new GameSession(42)
  const state = session.getState().state
  const proto = state.players[1]!
  return { ...proto, ...overrides } as PlayerState
}

describe('D157 Party Organizer — listener', () => {
  it('listener handler triggers when opponent reaches family of exactly 5', () => {
    const session = new GameSession(42)
    const state = session.getState().state
    const owner = state.players[0]!
    const opponent = state.players[1]!
    owner.minorPlayed.push(CARD_ID)
    setActiveWorkerCount(opponent, 5)
    setNewbornCount(opponent, 0)
    expect(familySize(opponent)).toBe(5)

    const handler = D157_PartyOrganizer_impl.listeners[0]!.handler
    const ctx: CardListenerContext = {
      state,
      player: opponent,
      triggerPlayer: opponent,
      ownerPlayer: owner,
      effectPlayer: owner,
      actionId: 'family-growth',
      phase: 'after' as ActionHookPhase,
    } as unknown as CardListenerContext
    const result = handler(ctx) as ActionHookResult | undefined
    expect(result).toBeTruthy()
    expect(result?.sourceCard).toBe(CARD_ID)
    expect(isCardFlagged(owner, CARD_ID)).toBe(false)
    expect(result?.flow?.type).toBe('seq')
    if (result?.flow?.type !== 'seq') throw new Error('expected seq flow')
    expect(result.flow.children).toHaveLength(2)
    expect(result.flow.children[0]).toMatchObject({
      type: 'leaf',
      actionId: 'special-effect',
      sourceCard: CARD_ID,
      params: { kind: 'set-flag', flag: true },
      actionContext: { targetPlayerId: owner.id },
    })
    expect(result.flow.children[1]).toMatchObject({
      type: 'leaf',
      actionId: 'gain',
      sourceCard: CARD_ID,
      params: { food: 8 },
    })

    const flagLeaf = result.flow.children[0]
    if (flagLeaf.type !== 'leaf') throw new Error('expected flag leaf')
    specialEffectAction.execute({
      state,
      player: opponent,
      space: { id: 'special-effect' } as ActionSpace,
      sourceCard: flagLeaf.sourceCard,
      params: flagLeaf.params,
      actionContext: flagLeaf.actionContext,
    })
    expect(isCardFlagged(owner, CARD_ID)).toBe(true)

    const result2 = handler(ctx)
    expect(result2).toBeUndefined()
  })

  it('listener handler does not fire when opponent only has 4', () => {
    const session = new GameSession(42)
    const state = session.getState().state
    const owner = state.players[0]!
    const opponent = state.players[1]!
    owner.minorPlayed.push(CARD_ID)
    setActiveWorkerCount(opponent, 4)
    setNewbornCount(opponent, 0)

    const handler = D157_PartyOrganizer_impl.listeners[0]!.handler
    const ctx = {
      state,
      player: owner,
      triggerPlayer: opponent,
      actionId: 'family-growth',
      phase: 'after',
    } as unknown as CardListenerContext
    expect(handler(ctx)).toBeUndefined()
    expect(isCardFlagged(owner, CARD_ID)).toBe(false)
  })

  it('listener handler does not fire when opponent has 3 → no trigger', () => {
    const session = new GameSession(42)
    const state = session.getState().state
    const owner = state.players[0]!
    const opponent = state.players[1]!
    owner.minorPlayed.push(CARD_ID)
    setActiveWorkerCount(opponent, 3)
    setNewbornCount(opponent, 0)

    const handler = D157_PartyOrganizer_impl.listeners[0]!.handler
    const ctx = {
      state,
      player: owner,
      triggerPlayer: opponent,
      actionId: 'family-growth',
      phase: 'after',
    } as unknown as CardListenerContext
    expect(handler(ctx)).toBeUndefined()
  })

  it('computeBonusScore: +3 VP when owner has 5 + sole 5-family', () => {
    const session = new GameSession(42)
    const state = session.getState().state as GameState
    const owner = state.players[0]!
    setActiveWorkerCount(owner, 5)
    setActiveWorkerCount(state.players[1]!, 4)

    const compute = D157_PartyOrganizer_impl.effect.computeBonusScore!
    expect(compute(state, owner)).toBe(3)
  })

  it('computeBonusScore: 0 VP when multiple players have 5', () => {
    const session = new GameSession(42)
    const state = session.getState().state as GameState
    const owner = state.players[0]!
    setActiveWorkerCount(owner, 5)
    setActiveWorkerCount(state.players[1]!, 5)

    const compute = D157_PartyOrganizer_impl.effect.computeBonusScore!
    expect(compute(state, owner)).toBe(0)
  })

  it('computeBonusScore: 0 VP when owner has < 5 family', () => {
    const session = new GameSession(42)
    const state = session.getState().state as GameState
    const owner = state.players[0]!
    setActiveWorkerCount(owner, 4)

    const compute = D157_PartyOrganizer_impl.effect.computeBonusScore!
    expect(compute(state, owner)).toBe(0)
  })
})

// Silence unused import warnings (kept for consistency / future tests)
void buildOpponentLikePlayer
void setWorkersAtHome

describe('ae-negative-56-family', () => {
  const { sessions, ok, save, make, finish, play, end, ready, people, bonus } = audit56Family
  afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
  it('D157 N1 actual next opponent fourth-to-fifth growth grants eight owner food exactly once across two different opponents',()=>{const s=make('D157_PartyOrganizer',st=>{st.currentPlayerIndex=1;people(st.players[1]!,4);people(st.players[2]!,5);setActiveWorkerCount(st.players[2]!,4)},true,14),first=finish(s,ok(s.takeAction(1,'urgent-wish-children')),true);assert.equal(familySize(first.state.players[1]!),5);assert.equal(first.state.players[0]!.resources.food,108);assert.equal(ready(s).state.currentPlayerIndex,2);const second=finish(s,ok(s.takeAction(2,'wish-children')),true);assert.equal(familySize(second.state.players[2]!),5);assert.equal(second.state.players[0]!.resources.food,108);save('D157-N1',{first,second})})
  it('D157 N2 own fifth opponent fourth previously existing fifth and card only in hand do not grant eight food',()=>{for(const mode of['self','fourth','retro','hand']){const actor=mode==='self'||mode==='retro'?0:1,s=make('D157_PartyOrganizer',st=>{st.currentPlayerIndex=actor;people(st.players[actor]!,mode==='fourth'?3:4);if(mode==='retro')people(st.players[1]!,5)},mode!=='hand'&&mode!=='retro',14),r=mode==='retro'?finish(s,play(s,'D157_PartyOrganizer')):finish(s,ok(s.takeAction(actor,'urgent-wish-children')),true);assert.equal(r.state.players[0]!.resources.food,100);save(`D157-N2-${mode}`,r)}})
  it('D157 N3 actual final scoring awards three bonus points only for unique owner family of five',()=>{for(const[owner,other]of[[4,2],[5,2],[5,5]]){const s=make('D157_PartyOrganizer',st=>{people(st.players[0]!,owner!);people(st.players[1]!,other!)},true,14),r=finish(s,end(s));assert.equal(r.state.gameOver,true);assert.equal(bonus(r,'D157_PartyOrganizer'),owner===5&&other<5?3:0);save(`D157-N3-${owner}-${other}`,r)}})
})
