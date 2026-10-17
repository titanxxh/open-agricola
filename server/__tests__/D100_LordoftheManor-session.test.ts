import { describe, expect, it, afterEach } from 'vitest'
import type { GameState, PlayerState } from '../../shared/contract/types'
import type { ScoreCategoryResult } from '../../shared/domain/scoring'
import { D100_LordoftheManor_impl } from '../../shared/cards/D/D100_LordoftheManor'
import { D100_LordoftheManor } from '../../shared/cards/D/D100_LordoftheManor'
import assert from 'node:assert/strict'
import * as audit46Scoring from './_helpers/audit/ae-negative-46-scoring'

const makeCategory = (key: ScoreCategoryResult['key'], total: number): ScoreCategoryResult => ({
  key,
  total,
  quantity: total,
  entries: [{ type: 'quantity', quantity: total, score: total }],
})

describe('D100_LordoftheManor scoring bonus', () => {
  const compute = D100_LordoftheManor_impl.effect.computeBonusScore
  const dummyState = {} as GameState
  const dummyPlayer = {} as PlayerState

  it('awards +1 per standard category that maxes at 4', () => {
    const categories: ScoreCategoryResult[] = [
      makeCategory('fields', 4),
      makeCategory('pastures', 4),
      makeCategory('grains', 4),
      makeCategory('vegetables', 3),
    ]
    expect(compute(dummyState, dummyPlayer, { categories })).toBe(3)
  })

  it('counts 4 fenced stables as a maxed category (reference: stables in whitelist)', () => {
    const categories: ScoreCategoryResult[] = [
      makeCategory('stables', 4),
      makeCategory('fields', 1),
    ]
    expect(compute(dummyState, dummyPlayer, { categories })).toBe(1)
  })

  it('does not count 3 fenced stables', () => {
    const categories: ScoreCategoryResult[] = [makeCategory('stables', 3)]
    expect(compute(dummyState, dummyPlayer, { categories })).toBe(0)
  })

  it('counts fenced stables alongside other maxed categories', () => {
    const categories: ScoreCategoryResult[] = [
      makeCategory('fields', 5),
      makeCategory('stables', 5),
      makeCategory('grains', 4),
    ]
    expect(compute(dummyState, dummyPlayer, { categories })).toBe(3)
  })

  it('ignores non-standard categories (clayRooms / stoneRooms / empty / cards)', () => {
    const categories: ScoreCategoryResult[] = [
      makeCategory('clayRooms', 4),
      makeCategory('empty', 4),
    ]
    expect(compute(dummyState, dummyPlayer, { categories })).toBe(0)
  })

  it('has extraVp:true metadata for UI display (reference $this->extraVp = true)', () => {
    expect(D100_LordoftheManor.extraVp).toBe(true)
  })
})

describe('ae-negative-46-scoring', () => {
  const { MANOR, sessions, save, ok, make, lesson, bonus, rooms, ownerReady, animalYard } = audit46Scoring
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('D100 N1 actual Manor purchase awards only complete four point grain and vegetable categories',()=>{for(const[grain,vegetable,expected]of[[7,3,0],[8,3,1],[7,4,1],[8,4,2]] as const){const s=make(MANOR,false,state=>Object.assign(state.players[0]!.resources,{grain,vegetable})),r=lesson(s,MANOR);assert.equal(bonus(r,MANOR),expected);save(`D100-N1-${grain}-${vegetable}`,r)}})
  it('D100 N2 real animal market arrival crosses one maximum category only after successful legal housing',()=>{for(const[type,threshold,space]of[['sheep',8,'sheep-market'],['boar',7,'pig-market'],['cattle',6,'cattle-market']] as const){const s=make(MANOR,false,state=>{state.round=14;animalYard(state,type,threshold-1);state.actionSpaces.find(a=>a.id===space)!.resources[type]=1}),bought=lesson(s,MANOR);ownerReady(s);const pending=ok(s.takeAction(0,space));assert.ok(pending.interaction.stateId==='wait'&&pending.interaction.request.kind==='animal-reorg');const z=pending.interaction.request.zones.find(z=>z.zoneType==='pasture');assert.ok(z);const r=ok(s.resolveChoice(0,'confirm',{zones:[{...z,animalType:type,animalCount:threshold}]}));assert.equal(bonus(bought,MANOR),0);assert.equal(bonus(r,MANOR),1);assert.equal(r.state.players[0]!.pastures[0]!.animalCount,threshold);save(`D100-N2-${type}`,{bought,pending,r})}})
  it('D100 N3 five fields four pastures and four fenced stables qualify while their lower boundaries do not',()=>{for(const[type,count,expected]of[['fields',4,0],['fields',5,1],['pastures',3,0],['pastures',4,1],['stables',3,0],['stables',4,1]] as const){const s=make(MANOR,true,state=>{const p=state.players[0]!;if(type==='fields')p.fields=Array.from({length:count},(_,i)=>({row:0,col:i,stacks:[]}));else{const tiles=type==='pastures'?Array.from({length:count},(_,i)=>({row:0,col:i+1})):[{row:0,col:1},{row:0,col:2},{row:1,col:1},{row:1,col:2}];p.pastures=type==='pastures'?tiles.map((t,i)=>({id:`manor-${i}`,tiles:[t],animalType:null,animalCount:0})):[{id:'manor-stables',tiles,animalType:null,animalCount:0}];if(type==='stables')p.stableTiles=tiles.slice(0,count);const edges=new Set<string>();for(const t of tiles){for(const e of[`H-${t.row}-${t.col}`,`H-${t.row+1}-${t.col}`,`V-${t.row}-${t.col}`,`V-${t.row}-${t.col+1}`]){if(type==='stables'&&edges.has(e))edges.delete(e);else edges.add(e)}}p.fenceSegments=[...edges].map(edge=>({edge,type:'fence',source:{kind:'own',ownerPlayerId:p.id}}));assert.ok(p.fenceSegments.length<=15)}}),r=ok(s.takeAction(0,'day-laborer'));assert.equal(bonus(r,MANOR),expected);save(`D100-N3-${type}-${count}`,r)}})
  it('D100 N4 four clay room points and four printed card points do not add nonstandard categories to a real grain maximum',()=>{const s=make(MANOR,true,state=>{rooms(state,4);state.players[0]!.houseType='clay';state.players[0]!.resources.grain=8;state.players[0]!.improvements=['Major_Well'];state.availableMajorImprovements=[]}),r=ok(s.takeAction(0,'day-laborer'));assert.equal(bonus(r,MANOR),1);const t=make(MANOR,false,state=>state.players[0]!.resources.grain=8),hand=ok(t.takeAction(0,'day-laborer'));assert.equal(bonus(hand,MANOR),0);save('D100-N4',{r,hand})})
})
