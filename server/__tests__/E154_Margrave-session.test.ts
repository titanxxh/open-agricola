import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import * as audit55Phase from './_helpers/audit/ae-negative-55-phase'
import { assertRuleOutcome } from './_helpers/negative-rule-audit'
import * as audit55Renovation from './_helpers/audit/ae-negative-55-renovation'

describe('ae-negative-55-phase', () => {
  const { sessions, save, make, finish, score, end } = audit55Phase
  afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
  it('E154 N3 real final scoring counts zero through three wood or clay opponents only when owner lives in stone',()=>{for(const count of[0,1,2,3])for(const stone of[true,false]){const s=make('E154_Margrave',st=>{st.players[0]!.houseType=stone?'stone':'clay';st.players.slice(1).forEach((p,i)=>p.houseType=i<count?(i%2?'wood':'clay'):'stone')},true,14),r=finish(s,end(s));assert.equal(r.state.gameOver,true);assert.equal(score(r,'E154_Margrave'),stone?count:0);save(`E154-N3-${count}-${stone}`,r)}})
})

describe('ae-negative-55-renovation', () => {
  const { sessions, save, make, renovate } = audit55Renovation
  afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
  it('E154 N1 actual opponent renovation rewards only owner already in stone with exactly two food',()=>{for(const house of['wood','clay','stone']as const){const s=make('E154_Margrave',st=>{st.currentPlayerIndex=1;st.players[0]!.houseType=house;Object.assign(st.players[1]!.resources,{clay:2,reed:1});},true,14),r=renovate(s,1,false);assertRuleOutcome({ownerHouse:r.state.players[0]!.houseType,opponentHouse:r.state.players[1]!.houseType,food:r.state.players[0]!.resources.food},{ownerHouse:house,opponentHouse:'clay',food:house==='stone'?102:100});assert.equal(r.state.players[1]!.houseType,'clay');save(`E154-N1-${house}`,r)}})
  it('E154 N2 card only in hand cannot reward a real opponent renovation even when owner already in stone',()=>{const s=make('E154_Margrave',st=>{st.currentPlayerIndex=1;st.players[0]!.houseType='stone';Object.assign(st.players[1]!.resources,{clay:2,reed:1});},false,14),r=renovate(s,1,false);assert.equal(r.state.players[0]!.resources.food,100);save('E154-N2',r)})
})
