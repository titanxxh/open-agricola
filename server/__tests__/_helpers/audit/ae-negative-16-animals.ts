// Helpers of ae-negative-16-animals-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import fs from '../audit-evidence-fs'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import type { GameState } from '../../../../shared/contract/types'
import { createWorkSession } from '../session-fixtures'
import { confirmNext } from '../negative-rule-audit'

export const DEALER='A147_AnimalDealer',WOOL='A148_Woolgrower',PIG='A153_PigOwner',ANY='A153-pig-owner-anytime'
export const sessions:GameSession[]=[]
export const output=process.env.AGRICOLA_NEGATIVE_ARTIFACT_DIR??'output/ae-negative/16-animals-probes'
export function save(id:string,value:unknown){fs.mkdirSync(output,{recursive:true});fs.writeFileSync(`${output}/${id}.json`,JSON.stringify(value,null,2))}
export function ok(r:SessionResponse){assert.equal(r.ok,true,r.error);return r}
export function setup(card:string,configure:(state:GameState)=>void=()=>{},played=true){const s=createWorkSession({seed:4242,options:{playerCount:card===DEALER?3:4},configure(state){state.round=14;for(const p of state.players)Object.assign(p.resources,{food:40,wood:0,clay:0,reed:0,stone:0,grain:0,vegetable:0,sheep:0,boar:0,cattle:0});const p=state.players[0]!;p.occupationPlayed=played?[card]:[];p.occupationHand=played?['__test_placeholder__']:[card,'A110_Roughcaster'];configure(state)}});sessions.push(s);return s}
export function pasture(state:GameState){const p=state.players[0]!;p.fenceSegments=['H-0-2','H-1-2','V-0-2','V-0-3'].map(edge=>({edge,type:'fence' as const,source:{kind:'own' as const,ownerPlayerId:p.id}}));p.pastures=[{id:'housing',tiles:[{row:0,col:2}],animalType:null,animalCount:0}];p.stableTiles=[{row:0,col:2}]}
export function turn(s:GameSession,actor:number,space:string){let r=s.getState();if(r.interaction.stateId==='wait'&&r.interaction.request.kind==='confirm-next-player')r=confirmNext(s,r);assert.equal(r.interaction.stateId,'idle');assert.equal(r.state.currentPlayerIndex,actor);return ok(s.takeAction(actor,space))}
export function finish(s:GameSession,r:SessionResponse,accept=true){for(let n=0;n<18&&r.interaction.stateId==='wait'&&r.interaction.request.kind!=='confirm-next-player';n++){const i=r.interaction;if(i.request.kind==='animal-reorg')r=ok(s.resolveChoice(i.playerIndex,'confirm',{zones:i.request.zones}));else if(i.request.kind==='choice'||i.request.kind==='select-trigger'){const o=i.request.options.find(o=>accept?o.value!=='__skip__'&&o.value!=='__done__':o.value==='__skip__'||o.value==='__done__');assert.ok(o,JSON.stringify(i));r=ok(s.resolveChoice(i.playerIndex,o.value))}else assert.fail(JSON.stringify(i))}return r}
export function dealer(type:'sheep'|'boar'|'cattle',count:number,food=1,played=true){return setup(DEALER,state=>{pasture(state);state.players[0]!.resources.food=food;const space={sheep:'sheep-market',boar:'pig-market',cattle:'cattle-market'}[type];state.actionSpaces.find(a=>a.id===space)!.resources[type]=count},played)}
export function wool(cap:number,type:'sheep'|'boar'|'cattle'='sheep',played=true){return setup(WOOL,state=>{state.completedFeedingPhases=cap;state.players[0]!.resources[type]=cap+1},played)}
export function menu(r:SessionResponse){assert.ok(r.interaction.stateId==='wait'&&r.interaction.request.kind==='animal-reorg');return r.interaction.request}
export function pig(count:number,played=true){return setup(PIG,state=>{pasture(state);const p=state.players[0]!;p.resources.boar=count;p.pastures[0]!.animalType='boar';p.pastures[0]!.animalCount=Math.min(count,4);p.houseAnimals = (count>=5?1:0) ? { '2-0': (count>=5?'boar':null)! } : {}},played)}
export function points(r:SessionResponse){return r.state.players[0]!.cardStates[PIG]?.counters?.bonusVp??0}
