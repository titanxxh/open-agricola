import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/C/C161_PotatoDigger'
import assert from 'node:assert/strict'
import * as audit56Purchase from './_helpers/audit/ae-negative-56-purchase'

const CARD_ID = 'C161_PotatoDigger'

const setup = (emptyFields: number, plantedFields = 0) => {
  const session = new GameSession(161, undefined, { playerCount: 4 })
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = 14
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.occupationHand = ['__test_placeholder__']
    player.minorHand = ['__test_placeholder__']
  })
  const owner = state.players[0]!
  owner.occupationHand = [CARD_ID]
  owner.resources.vegetable = 0
  owner.fields = Array.from({ length: emptyFields + plantedFields }, (_, index) => ({
    row: Math.floor(index / 5),
    col: index % 5,
    stacks: index < emptyFields ? [] : [{ kind: 'grain' as const, remaining: 1 }],
  }))
  session.loadState(state)
  return session
}

const play = (emptyFields: number, plantedFields = 0) =>
  setup(emptyFields, plantedFields).takeAction(0, 'lessons')

describe('C161 Potato Digger parity', () => {
  it('C161 S1: fewer than two empty fields grants no vegetable when Potato Digger is played', () => {
    const response = play(1)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.vegetable).toBe(0)
  })

  it('C161 S2: two empty fields grant one vegetable', () => {
    expect(play(2).state.players[0]!.resources.vegetable).toBe(1)
  })

  it('C161 S3: four empty fields grant two vegetables', () => {
    expect(play(4).state.players[0]!.resources.vegetable).toBe(2)
  })

  it('C161 S4: five empty fields grant three vegetables', () => {
    expect(play(5).state.players[0]!.resources.vegetable).toBe(3)
  })

  it('C161 S5: planted fields do not count toward the Potato Digger thresholds', () => {
    expect(play(3, 2).state.players[0]!.resources.vegetable).toBe(1)
  })
})

describe('ae-negative-56-purchase', () => {
  const { sessions, ok, save, make, finish, play, fields } = audit56Purchase
  afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
  it('C161 N1 actual purchase counts zero through six empty physical fields against exact vegetable thresholds',()=>{for(const[count,expected]of[[0,0],[1,0],[2,1],[3,1],[4,2],[5,3],[6,3]]){const s=make('C161_PotatoDigger',st=>fields(st.players[0]!,count!),false,14),r=finish(s,play(s,'C161_PotatoDigger'));assert.equal(r.state.players[0]!.resources.vegetable,expected);assert.equal(r.state.players[0]!.fields.length,count);save(`C161-N1-${count}`,r)}})
  it('C161 N2 planted fields and card in hand cannot gain vegetables while real whole purchase undo restores reward',()=>{const planted=make('C161_PotatoDigger',st=>fields(st.players[0]!,5,true),false,14),p=finish(planted,play(planted,'C161_PotatoDigger'));assert.equal(p.state.players[0]!.resources.vegetable,0);const hand=make('C161_PotatoDigger',st=>fields(st.players[0]!,5),false,14),h=finish(hand,ok(hand.takeAction(0,'grain-seeds')));assert.equal(h.state.players[0]!.resources.vegetable,0);const s=make('C161_PotatoDigger',st=>fields(st.players[0]!,5),false,14),r=finish(s,play(s,'C161_PotatoDigger')),u=ok(s.undoAction());assert.equal(r.state.players[0]!.resources.vegetable,3);assert.equal(u.state.players[0]!.resources.vegetable,0);assert.equal(u.state.players[0]!.fields.length,5);save('C161-N2',{p,h,r,u})})
})
