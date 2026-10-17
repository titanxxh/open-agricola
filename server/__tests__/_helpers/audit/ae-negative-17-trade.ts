// Helpers of ae-negative-17-trade-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import fs from '../audit-evidence-fs'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import type { GameState } from '../../../../shared/contract/types'
import { createWorkSession } from '../session-fixtures'
import { descriptionEffects } from '../choice-description'
import { confirmNext } from '../negative-rule-audit'

export const BUYER='A156_Buyer',CULINARY='A158_CulinaryArtist',JOINER='A159_JoineroftheSea',LUTE='A160_Lutenist'
export const sessions:GameSession[]=[]
export const output=process.env.AGRICOLA_NEGATIVE_ARTIFACT_DIR??'output/ae-negative/17-trade-probes'
export function save(id:string,value:unknown){fs.mkdirSync(output,{recursive:true});fs.writeFileSync(`${output}/${id}.json`,JSON.stringify(value,null,2))}
export function ok(r:SessionResponse){assert.equal(r.ok,true,r.error);return r}
export function setup(card:string,resources:Partial<GameState['players'][number]['resources']>={},played=true,configure:(state:GameState)=>void=()=>{}){const s=createWorkSession({seed:4242,options:{playerCount:4},configure(state){state.round=14;for(const p of state.players)Object.assign(p.resources,{food:20,wood:0,clay:0,reed:0,stone:0,grain:0,vegetable:0,sheep:0,boar:0,cattle:0});const p=state.players[0]!;Object.assign(p.resources,resources);p.occupationPlayed=played?[card]:[];p.occupationHand=played?['__test_placeholder__']:[card,'A110_Roughcaster'];configure(state)}});sessions.push(s);return s}
export function turn(s:GameSession,actor:number,space:string){let r=s.getState();if(r.interaction.stateId==='wait'&&r.interaction.request.kind==='confirm-next-player')r=confirmNext(s,r);assert.equal(r.interaction.stateId,'idle');assert.equal(r.state.currentPlayerIndex,actor);return ok(s.takeAction(actor,space))}
export function finish(s:GameSession,r:SessionResponse,accept=true,crop:string|null=null){for(let n=0;n<24&&r.interaction.stateId==='wait'&&r.interaction.request.kind!=='confirm-next-player';n++){const i=r.interaction;if(i.request.kind==='confirm-player-switch')r=ok(s.resolveChoice(i.request.fromPlayerIndex,'confirm'));else if(i.request.kind==='animal-reorg')r=ok(s.resolveChoice(i.playerIndex,'confirm',{zones:i.request.zones}));else {if(i.request.kind==='select-trigger'){const trigger=i.request.options[0];assert.ok(trigger);r=ok(s.resolveChoice(i.playerIndex,trigger.value));continue}assert.ok(i.request.kind==='choice',JSON.stringify(i));const o=i.request.options.find(o=>accept? !o.disabled&&o.value!=='__skip__'&&o.value!=='__done__'&&(!crop||descriptionEffects(o.descriptionPreview).some(e=>(e.kind==='payment'||e.kind==='resourceExchange')&&e.resourcesPaid?.[crop as 'grain'|'sheep'|'vegetable']===1)):o.value==='__skip__'||o.value==='__done__');assert.ok(o,JSON.stringify(i));r=ok(s.resolveChoice(i.playerIndex,o.value));}}return r}
export function offer(s:GameSession,space:string){finish(s,turn(s,0,'day-laborer'));return turn(s,1,space)}
export function material(r:SessionResponse,actor=0){return r.state.players[actor]!.resources}
export function prepareHousing(state:GameState){const p=state.players[0]!;p.fenceSegments=['H-0-2','H-1-2','V-0-2','V-0-3'].map(edge=>({edge,type:'fence' as const,source:{kind:'own' as const,ownerPlayerId:p.id}}));p.pastures=[{id:'housing',tiles:[{row:0,col:2}],animalType:null,animalCount:0}];p.stableTiles=[{row:0,col:2}]}
export function pile(state:GameState,space:string,type:'reed'|'stone'|'sheep'|'boar'|'food',count:number){state.actionSpaces.find(a=>a.id===space)!.resources[type]=count}
