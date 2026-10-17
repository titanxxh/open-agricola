import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/B/B122_Mineralogist'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit27Collection from './_helpers/audit/ae-negative-27-collection'

const CARD_ID = 'B122_Mineralogist'

const setup = (inHand = false) => {
  const session = new GameSession(122, undefined, { playerCount: 2 })
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = 14
  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.occupationHand = inHand ? [CARD_ID] : ['__test_placeholder__']
  player.occupationPlayed = inHand ? [] : [CARD_ID]
  player.resources = { ...player.resources, clay: 0, stone: 0, grain: 0 }
  state.actionSpaces.find((space) => space.id === 'clay-pit')!.resources.clay = 2
  state.actionSpaces.find((space) => space.id === 'western-quarry')!.resources.stone = 2
  session.loadState(state)
  return session
}

const playOccupation = (session: GameSession) => {
  let response = session.takeAction(0, 'lessons')
  if (response.interaction.stateId === 'wait') {
    const option = response.interaction.request.options?.find((entry) => entry.value === CARD_ID)
    if (option) response = session.resolveChoice(0, option.value)
  }
  return response
}

describe('B122 Mineralogist parity', () => {
  it('B122 S1: playing Mineralogist through Lessons keeps the occupation in play', () => {
    const response = playOccupation(setup(true))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
  })

  it('B122 S2: Clay Pit grants its clay and one stone', () => {
    const response = setup().takeAction(0, 'clay-pit')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 2, stone: 1 })
  })

  it('B122 S3: Western Quarry grants its stone and one clay', () => {
    const response = setup().takeAction(0, 'western-quarry')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ stone: 2, clay: 1 })
  })

  it('B122 S4: a non-clay and non-stone space grants no opposite resource', () => {
    const response = setup().takeAction(0, 'grain-seeds')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 1, clay: 0, stone: 0 })
  })
})

describe('ae-negative-27-collection', () => {
  const { MINERAL, sessions, save, ok, ready, finish, make } = audit27Collection
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('B122 N1 actual Clay Pit or Western Quarry grants exactly one opposite stone or clay alongside full accumulation pile',()=>{for(const[space,kind,count,other]of[['clay-pit','clay',3,'stone'],['western-quarry','stone',2,'clay']]as const){const s=make(MINERAL),pending=ok(s.takeAction(0,space)),r=finish(s,pending,false);assert.equal(r.state.players[0]!.resources[kind],count);assert.equal(r.state.players[0]!.resources[other],1);assert.equal(r.state.players[1]!.resources[other],0);save(`B122-N1-${space}`,{pending,r})}})
  it('B122 N2 Forest hand and actual opponent Clay Pit never grant owner opposite good',()=>{for(const mode of['forest','hand','opponent']){const s=make(MINERAL,mode!=='hand');if(mode==='opponent'){finish(s,ok(s.takeAction(0,'grain-seeds')),false);ready(s)}const actor=mode==='opponent'?1:0,space=mode==='forest'?'forest':'clay-pit',pending=ok(s.takeAction(actor,space)),r=finish(s,pending,false);assert.equal(r.state.players[0]!.resources.stone,0);if(mode==='opponent')assert.equal(r.state.players[1]!.resources.stone,0);save(`B122-N2-${mode}`,{pending,r})}})
  it('B122 N3 unknown action and occupied accumulation reject without adding opposite good before a real unrelated turn',()=>{const s=make(MINERAL),unknown=assertRejectedUnchanged(s,()=>s.takeAction(0,'unknown-clay-space')),r=finish(s,ok(s.takeAction(0,'clay-pit')),false);ready(s);const occupied=assertRejectedUnchanged(s,()=>s.takeAction(1,'clay-pit')),other=finish(s,ok(s.takeAction(1,'grain-seeds')),false);assert.equal(other.state.players[0]!.resources.stone,1);assert.equal(other.state.players[1]!.resources.stone,0);save('B122-N3',{unknown,r,occupied,other})})
  it('B122 N4 entire Quarry undo restores original stone pile and extra clay before exactly one replay',()=>{const s=make(MINERAL),before=ok(s.getState()),r=finish(s,ok(s.takeAction(0,'western-quarry')),false),undone=ok(s.undoAction());assert.equal(undone.state.players[0]!.resources.stone,0);assert.equal(undone.state.players[0]!.resources.clay,0);assert.deepEqual(undone.state.actionSpaces,before.state.actionSpaces);const retry=finish(s,ok(s.takeAction(0,'western-quarry')),false);assert.equal(retry.state.players[0]!.resources.stone,2);assert.equal(retry.state.players[0]!.resources.clay,1);save('B122-N4',{before,r,undone,retry})})
})
