import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import * as audit46Harvest from './_helpers/audit/ae-negative-46-harvest'

describe('ae-negative-46-harvest', () => {
  const { PARENTS, sessions, save, ok, make, finish, nextRound, lesson, bonus } = audit46Harvest
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('E099 N1 actual purchase and ordinary work award no point before the harvest and only stone houses qualify at its end',()=>{const a=lesson(make(PARENTS,false,state=>state.players[0]!.houseType='stone'),PARENTS);assert.equal(bonus(a,PARENTS),0);for(const house of['wood','clay','stone'] as const){const s=make(PARENTS,true,state=>state.players[0]!.houseType=house),mid=ok(s.takeAction(0,'reed-bank')),r=nextRound(s,8,false);assert.equal(bonus(mid,PARENTS),0);assert.equal(bonus(r,PARENTS),house==='stone'?1:0);assert.equal(bonus(r,PARENTS,1),0);save(`E099-N1-${house}`,{a,mid,r})}})
  it('E099 N2 an actual round seven stone renovation becomes eligible before harvest and a hand card cannot award points',()=>{const s=make(PARENTS,true,state=>{state.players[0]!.houseType='clay';Object.assign(state.players[0]!.resources,{stone:2,reed:1})}),renovated=finish(s,ok(s.takeAction(0,'house-redevelopment')),false),r=nextRound(s,8,false);assert.equal(renovated.state.players[0]!.houseType,'stone');assert.equal(bonus(renovated,PARENTS),0);assert.equal(bonus(r,PARENTS),1);const t=make(PARENTS,false,state=>state.players[0]!.houseType='stone'),hand=nextRound(t,8,false);assert.equal(bonus(hand,PARENTS),0);save('E099-N2',{renovated,r,hand})})
  it('E099 N3 two distinct natural harvest endings grant exactly two points with no intermediate round reward',()=>{const s=make(PARENTS,true,state=>state.players[0]!.houseType='stone'),eight=nextRound(s,8,false),nine=nextRound(s,9,false),ten=nextRound(s,10,false);assert.equal(bonus(eight,PARENTS),1);assert.equal(bonus(nine,PARENTS),1);assert.equal(bonus(ten,PARENTS),2);save('E099-N3',{eight,nine,ten})})
})
