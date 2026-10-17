import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import { setWorkersAtHome } from '../../shared/domain/player'
import { confirmPlayerSwitch } from './_helpers/pending-confirms'
import '../../shared/cards/E/E160_KelpGatherer'
import assert from 'node:assert/strict'
import { assertEmptyAccumulationRejected } from './_helpers/negative-rule-audit'
import * as audit56Purchase from './_helpers/audit/ae-negative-56-purchase'

const FIXED_HANDS = [
  { occupation: '__test_occupation_p1__', minor: '__test_minor_p1__' },
  { occupation: '__test_occupation_p2__', minor: '__test_minor_p2__' },
  { occupation: '__test_occupation_p3__', minor: '__test_minor_p3__' },
  { occupation: '__test_occupation_p4__', minor: '__test_minor_p4__' },
]

describe('E160_KelpGatherer session', () => {
  const setup = (currentPlayerIndex = 0) => {
    const session = new GameSession(160, undefined, { playerCount: 4 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = currentPlayerIndex
    state.round = 1
    state.players.forEach((player, index) => {
      player.occupationHand = [FIXED_HANDS[index]!.occupation]
      player.minorHand = [FIXED_HANDS[index]!.minor]
      player.resources.food = 0
      player.resources.vegetable = 0
    })

    const owner = state.players[0]!
    owner.occupationPlayed.push('E160_KelpGatherer')
    setWorkersAtHome(state, owner, 2)
    owner.resources.vegetable = 0

    const opponent = state.players[1]!
    setWorkersAtHome(state, opponent, 2)
    opponent.resources.food = 0

    // Ensure fishing has accumulated resources
    const fishing = state.actionSpaces.find((s) => s.id === 'fishing')
    if (fishing) fishing.resources.food = 2

    session.loadState(state)
    return session
  }

  it('opponent gets 1 extra food and owner gets 1 vegetable when opponent uses fishing', () => {
    const session = setup(1)
    const s = session.getState().state
    const vegBefore = s.players[0]!.resources.vegetable
    const opponentFoodBefore = s.players[1]!.resources.food
    const fishingFood = s.actionSpaces.find((sp) => sp.id === 'fishing')?.resources.food ?? 0

    let resp = session.takeAction(1, 'fishing')
    expect(resp.ok).toBe(true)

    // Walk through player switches for card effect
    while (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-player-switch') {
      resp = confirmPlayerSwitch(session)
    }

    const after = session.getState().state
    // Owner gets 1 vegetable
    expect(after.players[0]!.resources.vegetable).toBe(vegBefore + 1)
    // Opponent gets fishing food + 1 extra from KelpGatherer
    expect(after.players[1]!.resources.food).toBe(opponentFoodBefore + fishingFood + 1)
    expect(after.players[2]!.resources.food).toBe(0)
    expect(after.players[2]!.resources.vegetable).toBe(0)
    expect(after.players[3]!.resources.food).toBe(0)
    expect(after.players[3]!.resources.vegetable).toBe(0)
  })

  it('does not trigger when owner uses fishing', () => {
    const session = setup(0)
    const vegBefore = session.getState().state.players[0]!.resources.vegetable

    const resp = session.takeAction(0, 'fishing')
    expect(resp.ok).toBe(true)

    const after = session.getState().state
    // Owner should NOT get vegetable — scope is 'opponent'
    expect(after.players[0]!.resources.vegetable).toBe(vegBefore)
    expect(after.players[1]!.resources.vegetable).toBe(0)
    expect(after.players[2]!.resources.vegetable).toBe(0)
    expect(after.players[3]!.resources.vegetable).toBe(0)
  })

  it('does not trigger on non-fishing spaces', () => {
    const session = setup(1)
    const vegBefore = session.getState().state.players[0]!.resources.vegetable

    const resp = session.takeAction(1, 'day-laborer')
    expect(resp.ok).toBe(true)

    const after = session.getState().state
    expect(after.players[0]!.resources.vegetable).toBe(vegBefore)
    expect(after.players[2]!.resources.vegetable).toBe(0)
    expect(after.players[3]!.resources.vegetable).toBe(0)
  })
})

describe('ae-negative-56-purchase', () => {
  const { sessions, ok, save, make, finish } = audit56Purchase
  afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
  it('E160 N1 real opponent Fishing gives that collector one additional food and gives only owner one vegetable while an empty pile rejects without either reward',()=>{for(const pile of[0,2]){const s=make('E160_KelpGatherer',st=>{st.currentPlayerIndex=1;st.actionSpaces.find(a=>a.id==='fishing')!.resources.food=pile},true,14),r=pile===0?assertEmptyAccumulationRejected(s,1,'fishing'):finish(s,ok(s.takeAction(1,'fishing')));assert.equal(r.state.players[1]!.resources.food,pile===0?100:101+pile);assert.equal(r.state.players[0]!.resources.food,100);assert.equal(r.state.players[0]!.resources.vegetable,pile===0?0:1);assert.equal(r.state.players[1]!.resources.vegetable,0);assert.equal(r.state.actionSpaces.find(a=>a.id==='fishing')!.resources.food,0);save(`E160-N1-${pile}`,r)}})
  it('E160 N2 owner Fishing unrelated opponent food space and hand-only card cannot give vegetable or extra collector food',()=>{for(const mode of['self','unrelated','hand']){const actor=mode==='self'?0:1,s=make('E160_KelpGatherer',st=>{st.currentPlayerIndex=actor;st.actionSpaces.find(a=>a.id==='fishing')!.resources.food=2;st.actionSpaces.find(a=>a.id==='traveling-players')!.resources.food=2},mode!=='hand',14),r=finish(s,ok(s.takeAction(actor,mode==='unrelated'?'traveling-players':'fishing')));assert.equal(r.state.players[0]!.resources.vegetable,0);assert.equal(r.state.players[actor]!.resources.food,102);save(`E160-N2-${mode}`,r)}})
})
