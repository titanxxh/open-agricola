// Helpers of ae-negative-17-sequence-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import fs from '../audit-evidence-fs'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import type { GameState } from '../../../../shared/contract/types'
import { createWorkSession } from '../session-fixtures'
import { assertEmptyAccumulationRejected, confirmNext } from '../negative-rule-audit'

export const PATCH='A161_PatchCaretaker',EXPERT='A163_BuildingExpert'
export const sessions:GameSession[]=[]
export const output=process.env.AGRICOLA_NEGATIVE_ARTIFACT_DIR??'output/ae-negative/17-sequence-probes'
export function save(id:string,value:unknown){fs.mkdirSync(output,{recursive:true});fs.writeFileSync(`${output}/${id}.json`,JSON.stringify(value,null,2))}
export function ok(r:SessionResponse){assert.equal(r.ok,true,r.error);return r}
export function setup(card:string,configure:(state:GameState)=>void=()=>{},played=true){const players=4;const s=createWorkSession({seed:4242,options:{playerCount:players},configure(state){state.round=14;for(const p of state.players)Object.assign(p.resources,{food:40,wood:0,clay:0,reed:0,stone:0,grain:0,vegetable:0});state.players[0]!.occupationPlayed=played?[card]:[];state.players[0]!.occupationHand=played?['__test_placeholder__']:[card,'A110_Roughcaster'];configure(state)}});sessions.push(s);assert.equal(s.getState().state.players.length,players);return s}
export function turn(s:GameSession,actor:number,space:string){let r=s.getState();if(r.interaction.stateId==='wait'&&r.interaction.request.kind==='confirm-next-player')r=confirmNext(s,r);assert.equal(r.interaction.stateId,'idle');assert.equal(r.state.currentPlayerIndex,actor);return ok(s.takeAction(actor,space))}
export function patch(first:string,second:string,played=true,empty=false){const s=setup(PATCH,state=>{for(const a of state.actionSpaces)for(const key of['wood','food']as const)if(a.gainPerRound?.[key])a.resources[key]=1;if(empty){const target=state.actionSpaces.find(a=>a.id===second)!;for(const key of['wood','food']as const)if(target.gainPerRound?.[key])target.resources[key]=0}},played);const start=turn(s,0,first);assert.equal(start.state.players[0]!.resources.vegetable,0);const fillers=first==='fishing'?['grain-seeds','day-laborer','reed-bank']:['grain-seeds','day-laborer','fishing'];fillers.forEach((space,i)=>turn(s,i+1,space));return {s,start,r:empty?assertEmptyAccumulationRejected(s,0,second):turn(s,0,second)}}
export const FILLER=['grain-seeds','day-laborer','forest','clay-pit','reed-bank','fishing','grove','hollow-4','copse','traveling-players','western-quarry','eastern-quarry','vegetable-seeds','sheep-market','pig-market','cattle-market']
export function beforeExpert(ordinal:number,played=true){const s=setup(EXPERT,state=>{for(const p of state.players){p.workers.forEach(w=>{w.isActive=true;w.isNewborn=false});p.rooms=5;p.roomTiles=[{row:0,col:0},{row:1,col:0},{row:1,col:1},{row:2,col:0},{row:2,col:1}]};for(const[id,key]of[['western-quarry','stone'],['eastern-quarry','stone'],['sheep-market','sheep'],['pig-market','boar'],['cattle-market','cattle']]as const)state.actionSpaces.find(a=>a.id===id)!.resources[key]=1;},played);let used=0;const target=(ordinal-1)*4;for(let n=0;n<target;n++){const actor=n%4;const space=FILLER[used++];assert.ok(space);let r=turn(s,actor,space);if(r.interaction.stateId==='wait'&&r.interaction.request.kind==='animal-reorg')r=ok(s.resolveChoice(actor,'confirm',{zones:r.interaction.request.zones}));}return s}
