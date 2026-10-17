// Helpers of ae-negative-15-spaces-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import fs from '../audit-evidence-fs'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import type { GameState } from '../../../../shared/contract/types'
import { createWorkSession } from '../session-fixtures'
import { confirmNext } from '../negative-rule-audit'

export const MASTER='A126_MasterWorkman',SHEPHERD='A137_RiverineShepherd',HARPOON='A138_Harpooner',SHOVEL='A140_ShovelBearer'
export const sessions:GameSession[]=[]
export const output=process.env.AGRICOLA_NEGATIVE_ARTIFACT_DIR??'output/ae-negative/15-spaces-probes'
export function save(id:string,value:unknown){fs.mkdirSync(output,{recursive:true});fs.writeFileSync(`${output}/${id}.json`,JSON.stringify(value,null,2))}
export function ok(r:SessionResponse){assert.equal(r.ok,true,r.error);return r}
export function setup(card:string,configure:(state:GameState)=>void=()=>{},played=true){const players=card===MASTER?2:3;const s=createWorkSession({seed:4242,options:{playerCount:players},configure(state){state.round=14;for(const p of state.players)Object.assign(p.resources,{food:40,wood:0,clay:0,reed:0,stone:0,grain:0,vegetable:0});state.players[0]!.occupationPlayed=played?[card]:[];state.players[0]!.occupationHand=played?['__test_placeholder__']:[card,'A110_Roughcaster'];configure(state)}});sessions.push(s);assert.equal(s.getState().state.players.length,players);return s}
export function turn(s:GameSession,actor:number,space:string){let r=s.getState();if(r.interaction.stateId==='wait'&&r.interaction.request.kind==='confirm-next-player')r=confirmNext(s,r);assert.equal(r.interaction.stateId,'idle');assert.equal(r.state.currentPlayerIndex,actor);return ok(s.takeAction(actor,space))}
export function finishOptional(s:GameSession,r:SessionResponse,accept:boolean){for(let n=0;n<8&&r.interaction.stateId==='wait'&&r.interaction.request.kind!=='confirm-next-player';n++){const i=r.interaction;if(i.request.kind==='animal-reorg'){r=ok(s.resolveChoice(i.playerIndex,'confirm',{zones:i.request.zones}));continue}assert.ok(i.request.kind==='choice'||i.request.kind==='select-trigger',JSON.stringify(i));const o=i.request.options.find(o=>accept?o.value!=='__skip__'&&o.value!=='__done__':o.value==='__skip__'||o.value==='__done__');assert.ok(o);r=ok(s.resolveChoice(i.playerIndex,o.value))}return r}
export function piles(state:GameState,space:string,resource:'wood'|'clay'|'reed'|'stone'|'sheep'|'food',amount:number){const a=state.actionSpaces.find(a=>a.id===space);assert.ok(a);a.resources[resource]=amount}
export function mapped(state:GameState){state.roundActionOrder=state.roundActionOrder.map(()=>null);for(const[index,id]of ['sheep-market','grain-seeds','western-quarry','vegetable-seeds'].entries()){state.roundActionOrder[index]=id;state.actionSpaces.find(a=>a.id===id)!.roundAvailable=1}piles(state,'sheep-market','sheep',0);piles(state,'western-quarry','stone',0)}
export function shepherd(other:number,played=true){return setup(SHEPHERD,state=>{piles(state,'sheep-market','sheep',1);piles(state,'reed-bank','reed',other)},played)}
export function shovel(used:number,other:number,played=true){return setup(SHOVEL,state=>{piles(state,'clay-pit','clay',used);piles(state,'hollow','clay',other)},played)}
