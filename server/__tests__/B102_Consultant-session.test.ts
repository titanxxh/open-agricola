import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/B/B102_Consultant'
import assert from 'node:assert/strict'
import { B102_Consultant_impl } from '../../shared/cards/B/B102_Consultant'
import { gainAction } from '../../shared/actions/effects/gain'
import type { DraftGameEvent, EventSink } from '../../shared/contract/events'
import { createWorkSession } from './_helpers/session-fixtures'
import * as audit25Occupations from './_helpers/audit/ae-negative-25-occupations'

const CARD_ID = 'B102_Consultant'

const play = (playerCount: number) => {
  const session = new GameSession(102, undefined, { playerCount })
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = 14
  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.occupationHand = [CARD_ID]
  player.occupationPlayed = []
  player.resources = {
    ...player.resources,
    grain: 0,
    clay: 0,
    reed: 0,
    sheep: 0,
  }
  session.loadState(state)
  let response = session.takeAction(0, 'lessons')
  if (response.interaction.stateId === 'wait') {
    const option = response.interaction.request.options?.find((entry) => entry.value === CARD_ID)
    if (option) response = session.resolveChoice(0, option.value)
  }
  return response
}

describe('B102 Consultant parity', () => {
  it('B102 S1: a one-player game has no Lessons space and cannot play Consultant', () => {
    const response = play(1)

    expect(response.ok).toBe(false)
    expect(response.error).toBe('space unavailable')
    expect(response.state.players[0]!.occupationPlayed).not.toContain(CARD_ID)
    expect(response.state.players[0]!.resources.grain).toBe(0)
  })

  it.each([
    { playerCount: 2, resource: 'clay' as const, amount: 3 },
    { playerCount: 3, resource: 'reed' as const, amount: 2 },
    { playerCount: 4, resource: 'sheep' as const, amount: 2 },
  ])('B102 S$playerCount: a $playerCount-player game grants $amount $resource', ({ playerCount, resource, amount }) => {
    const response = play(playerCount)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources[resource]).toBe(amount)
  })
})

describe('ae-negative-25-occupations', () => {
  const { CONSULTANT, sessions, save, ok, ready, finish, make, lesson } = audit25Occupations
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('B102 N1 real first Lessons in two players awards exactly three clay to owner and no other resource',()=>{const s=make(CONSULTANT,0),a=lesson(s,CONSULTANT);assert.equal(a.r.state.players[0]!.resources.clay,3);assert.equal(a.r.state.players[0]!.resources.grain,0);assert.equal(a.r.state.players[0]!.resources.reed,0);assert.equal(a.r.state.players[0]!.resources.sheep,0);assert.equal(a.r.state.players[1]!.resources.clay,7);save('B102-N1',a)})
  it('B102 N2 card in hand and opponent or unrelated owner actions cannot trigger the immediate award',()=>{const s=make(CONSULTANT);ready(s);const first=finish(s,ok(s.takeAction(0,'grain-seeds')),false);ready(s);const pending=ok(s.takeAction(1,'lessons')),r=finish(s,ok(s.resolveChoice(1,'A123_FrameBuilder')),false);assert.equal(first.state.players[0]!.resources.clay,2);assert.equal(r.state.players[0]!.resources.clay,2);assert.ok(r.state.players[0]!.occupationHand.includes(CONSULTANT));save('B102-N2',{first,pending,r})})
  it('B102 N3 whole occupation undo restores three clay award and hand before one replay',()=>{const s=make(CONSULTANT,0),a=lesson(s,CONSULTANT),undone=ok(s.undoAction());assert.equal(undone.state.players[0]!.resources.clay,0);assert.ok(undone.state.players[0]!.occupationHand.includes(CONSULTANT));const retry=lesson(s,CONSULTANT);assert.equal(retry.r.state.players[0]!.resources.clay,3);save('B102-N3',{a,undone,retry})})
  it('B102 N4 printed one three and four player branches give exactly two grain reed or legally housed sheep',()=>{for(const players of[1,3,4]){const session=createWorkSession({seed:4242,options:{playerCount:players},configure(state){state.round=8;for(const p of state.players){Object.assign(p.resources,{food:100,wood:0,clay:0,reed:0,stone:0,grain:0,vegetable:0,sheep:0,boar:0,cattle:0});p.minorHand=['B004_WoodPile','A006_StorageBarn'];p.occupationHand=['__test_placeholder__']}const p=state.players[0]!;p.occupationHand=[CONSULTANT,'A110_Roughcaster'];if(players===4){p.pastures=[{id:'consultant-sheep',tiles:[{row:0,col:1}],animalType:null,animalCount:0}];p.fenceSegments=['H-0-1','H-1-1','V-0-1','V-0-2'].map(edge=>({edge,type:'fence' as const,source:{kind:'own' as const,ownerPlayerId:p.id}}))}}});sessions.push(session);const before=ok(session.getState());if(players===1){const state=structuredClone(before.state),player=state.players[0]!,onBuy=B102_Consultant_impl.effect?.onBuy;assert.ok(onBuy);const flow=onBuy(state,player);assert.ok(flow&&flow.type==='leaf'&&flow.actionId==='gain');const events:DraftGameEvent[]=[],eventSink:EventSink={emit:event=>{events.push(event)},emitMany:items=>{events.push(...items)}};const result=gainAction.execute({state,player,space:{...gainAction,resources:{...player.resources},takenBy:[]},params:flow.params,sourceCard:flow.sourceCard,eventSink});assert.equal(result.type,'ok');assert.deepEqual(result.resourcesGained,{grain:2});assert.deepEqual(['grain','clay','reed','sheep'].map(k=>player.resources[k as 'grain']),[2,0,0,0]);assert.ok(events.some(e=>e.type==='resource.moved'&&e.sourceCardId===CONSULTANT&&'resources'in e&&JSON.stringify(e.resources)===JSON.stringify({grain:2})));save('B102-N4-1',{before,flow,result,player,events,entry:'Direct public onBuy and gain effect on fresh solo state; no legal occupation purchase/payment claim'});continue}const pending=ok(session.takeAction(0,'lessons'));let chosen=pending;if(chosen.state.players[0]!.occupationHand.includes(CONSULTANT)){assert.ok(chosen.interaction.stateId==='wait'&&chosen.interaction.request.kind==='choice');chosen=ok(session.resolveChoice(0,CONSULTANT))}assert.ok(chosen.state.players[0]!.occupationPlayed.includes(CONSULTANT));let r=chosen;if(r.interaction.stateId==='wait'&&r.interaction.request.kind==='animal-reorg'){const zones=r.interaction.request.zones.map(z=>({...z,animalType:z.zoneType==='pasture'?'sheep':null,animalCount:z.zoneType==='pasture'?2:0}));r=ok(session.resolveChoice(0,'confirm',{zones}))}r=finish(session,r,false);assert.deepEqual(['grain','clay','reed','sheep'].map(k=>r.state.players[0]!.resources[k as 'grain']),players===1?[2,0,0,0]:players===3?[0,0,2,0]:[0,0,0,2]);assert.equal(r.state.players.length,players);if(players===4)assert.equal(r.state.players[0]!.pastures[0]!.animalCount,2);assert.deepEqual(r.state.players[0]!.workers.map(w=>w.id),before.state.players[0]!.workers.map(w=>w.id));save(`B102-N4-${players}`,{before,pending,chosen,r,entry:'actual Lessons'})}})
})
