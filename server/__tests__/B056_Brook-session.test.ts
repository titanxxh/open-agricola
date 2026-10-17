import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/B/B056_Brook'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit21Brook from './_helpers/audit/ae-negative-21-brook'

const setup = ({
  playerCount = 3, roundOne = 'grain-utilization', secondRound = 'sheep-market',
}: { playerCount?: number; roundOne?: string; secondRound?: string } = {}) => {
  const session = new GameSession(9856 + playerCount, undefined, { playerCount })
  stabilizeRandomHands(session.state.players)
  const state = session.state
  state.currentPlayerIndex = 0
  state.round = 5
  state.roundPhase = 'work'
  state.roundActionOrder = [
    roundOne,
    secondRound,
    ...state.roundActionOrder.filter((spaceId) => spaceId !== roundOne && spaceId !== secondRound),
  ]
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player, index) => {
    setWorkersAtHome(state, player, index === 0 ? 2 : 0)
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
    player.minorPlayed = []
    player.occupationPlayed = []
    player.cardStates = {}
  })
  const owner = state.players[0]!
  owner.minorPlayed = ['B056_Brook']
  owner.resources.food = 0
  owner.resources.grain = 1
  owner.fields = [{ row: 0, col: 0, stacks: [] }]
  for (const [spaceId, resource] of [
    ['forest', 'wood'], ['clay-pit', 'clay'], ['reed-bank', 'reed'], ['sheep-market', 'sheep'],
  ] as const) {
    state.actionSpaces.find((space) => space.id === spaceId)!.resources[resource] = 1
  }
  session.loadState(state)
  return session
}

const chooseSow = (session: GameSession, response: SessionResponse) => {
  if (response.interaction.stateId !== 'wait') return response
  if (response.interaction.request.kind === 'farm-select') return response
  const sow = response.interaction.request.options?.find((option) => option.labelKey === 'actions.sow.name')
  expect(sow, JSON.stringify(response.interaction)).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, sow!.value)
}

describe('B056 Brook through Session', () => {
  it.each(['forest', 'clay-pit', 'reed-bank'])('grants one food on fixed Brook space %s', (spaceId) => {
    const response = setup().takeAction(0, spaceId)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(1)
  })

  it.each([2, 4])('uses the actual round-one card in a %i-player game', (playerCount) => {
    const session = setup({ playerCount })
    chooseSow(session, session.takeAction(0, 'grain-utilization'))
    const response = session.commitSelectionChoice(0, { crops: [{ row: 0, col: 0, crop: 'grain' }] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(1)
    expect(response.state.players[0]!.fields[0]!.stacks).toEqual([{ kind: 'grain', remaining: 3 }])
  })

  it('does not treat another stage-one round card as the round-one target', () => {
    const response = setup().takeAction(0, 'sheep-market')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(0)
  })

  it('does not treat the multiplayer Hollow starting space as a Brook target', () => {
    const response = setup({ playerCount: 3 }).takeAction(0, 'hollow')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(0)
  })
})

describe('ae-negative-21-brook', () => {
  const { CARD, sessions, save, ok, setup, finish, menu, buy, reach, use, person } = audit21Brook
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('B056 N1 actual own person on Fishing permits free purchase and remains on Fishing through whole undo',()=>{const s=setup(CARD);person(s);const{pending,r}=buy(s,CARD);assert.ok(r.state.players[0]!.minorPlayed.includes(CARD));assert.equal(r.state.actionSpaces.find(a=>a.id==='fishing')!.takenBy[0]!.playerId,r.state.players[0]!.id);const undone=ok(s.undoAction());assert.ok(undone.state.players[0]!.minorHand.includes(CARD));assert.equal(undone.state.actionSpaces.find(a=>a.id==='fishing')!.takenBy[0]!.playerId,undone.state.players[0]!.id);const retry=buy(s,CARD).r;assert.ok(retry.state.players[0]!.minorPlayed.includes(CARD));save('B056-N1',{pending,r,undone,retry})})
  it('B056 N2 none or only opponent person on Fishing cannot satisfy the purchase prerequisite',()=>{for(const mode of['none','opponent']){const s=setup(CARD);if(mode==='opponent'){use(s,0,'clay-pit');use(s,1,'fishing')}const pending=menu(s);assertRejectedUnchanged(s,()=>s.resolveChoice(0,CARD));const legal=finish(s,ok(s.resolveChoice(0,'B004_WoodPile')));assert.ok(legal.state.players[0]!.minorHand.includes(CARD));assert.ok(!legal.state.players[0]!.minorPlayed.includes(CARD));save(`B056-N2-${mode}`,{pending,legal})}})
  it('B056 N3 natural next round Forest Clay Pit and Reed Bank each grant exactly one extra food',()=>{for(const space of['forest','clay-pit','reed-bank']){const s=setup(CARD),c=setup(CARD);person(s);person(c);buy(s,CARD);buy(c,'B004_WoodPile');reach(s,6);reach(c,6);const a=use(s,0,space),b=use(c,0,space);assert.equal(a.r.state.players[0]!.resources.food,b.r.state.players[0]!.resources.food+1);assert.equal(a.r.state.players[1]!.resources.food,b.r.state.players[1]!.resources.food);save(`B056-N3-${space}`,{a,b})}})
  it('B056 N4 actual first revealed round action grants one food while Fishing and later round action do not',()=>{for(const kind of['first','fishing','later']){const s=setup(CARD),c=setup(CARD);person(s);person(c);buy(s,CARD);buy(c,'B004_WoodPile');const a=reach(s,6),b=reach(c,6),id=kind==='first'?a.state.roundActionOrder[0]!:kind==='later'?a.state.roundActionOrder[1]!:'fishing';assert.equal(a.state.roundActionOrder[0],b.state.roundActionOrder[0]);const x=use(s,0,id),y=use(c,0,id);assert.equal(x.r.state.players[0]!.resources.food,y.r.state.players[0]!.resources.food+(kind==='first'?1:0));save(`B056-N4-${kind}`,{a,b,id,x,y})}})
})
