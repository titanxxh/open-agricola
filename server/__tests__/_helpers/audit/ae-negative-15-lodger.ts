// Helpers of ae-negative-15-lodger-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import fs from '../audit-evidence-fs'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import type { GameState } from '../../../../shared/contract/types'
import { createWorkSession } from '../session-fixtures'
import { confirmNext } from '../negative-rule-audit'

export const CARD='A127_Lodger',READER='D085_Reader'
export const sessions:GameSession[]=[]
export const output=process.env.AGRICOLA_NEGATIVE_ARTIFACT_DIR??'output/ae-negative/15-lodger-probes'
export function save(id:string,value:unknown){fs.mkdirSync(output,{recursive:true});fs.writeFileSync(`${output}/${id}.json`,JSON.stringify(value,null,2))}
export function ok(r:SessionResponse){assert.equal(r.ok,true,r.error);return r}
export function setup(round=8,played=false,configure:(state:GameState)=>void=()=>{}){const s=createWorkSession({seed:4242,options:{playerCount:3},configure(state){state.round=round;for(const p of state.players)Object.assign(p.resources,{food:60,wood:0,clay:0,reed:0,stone:0,grain:0,vegetable:0});state.players[0]!.occupationPlayed=played?[CARD]:[];state.players[0]!.occupationHand=played?['__test_placeholder__']:[CARD,'A110_Roughcaster'];if(played)state.players[0]!.cardStates[CARD]={extraData:{hasRoom:true}};configure(state)}});sessions.push(s);return s}
export function turn(s:GameSession,actor:number,space:string){let r=s.getState();if(r.interaction.stateId==='wait'&&r.interaction.request.kind==='confirm-next-player')r=confirmNext(s,r);assert.equal(r.interaction.stateId,'idle');assert.equal(r.state.currentPlayerIndex,actor);return ok(s.takeAction(actor,space))}
export function play(s:GameSession){let r=turn(s,0,'lessons');if(!r.state.players[0]!.occupationPlayed.includes(CARD))r=ok(s.resolveChoice(0,CARD));return r}
export function finishChoice(s:GameSession,r:SessionResponse){for(let n=0;n<12&&r.interaction.stateId==='wait'&&r.interaction.request.kind!=='confirm-next-player';n++){const i=r.interaction;if(i.request.kind==='confirm-player-switch')r=ok(s.resolveChoice(i.request.fromPlayerIndex,'confirm'));else if(i.request.kind==='animal-reorg')r=ok(s.resolveChoice(i.playerIndex,'confirm',{zones:i.request.zones}));else if(i.request.kind==='feed')r=ok(s.resolveChoice(i.playerIndex,'confirm',{selections:[]}));else if(i.request.kind==='choice'){const skip=i.request.options.find(o=>o.value==='__skip__'||o.value==='__done__');assert.ok(skip);r=ok(s.resolveChoice(i.playerIndex,skip.value))}else assert.fail(JSON.stringify(i))}return r}
export function endRound(s:GameSession){const spaces=['grain-seeds','day-laborer','forest','reed-bank','clay-pit','fishing','meeting-place','vegetable-seeds','western-quarry'];let r=s.getState();const originalRound=r.state.round;for(let n=0;n<24&&r.state.round===originalRound;n++){const beforeRound=r.state.round;r=finishChoice(s,r);if(r.interaction.stateId==='wait'&&r.interaction.request.kind==='confirm-next-player')r=confirmNext(s,r);r=finishChoice(s,r);if(r.state.round!==beforeRound||r.interaction.stateId==='gameover')return r;assert.equal(r.interaction.stateId,'idle');const actor=r.state.currentPlayerIndex;const space=spaces.find(id=>!r.state.actionSpaces.find(a=>a.id===id)!.takenBy.length);assert.ok(space);r=turn(s,actor,space);if(r.state.round!==beforeRound)return r;}assert.fail('round did not advance')}
export function rooms(state:GameState,count:number){const p=state.players[0]!;p.rooms=count;p.roomTiles=[{row:1,col:0},{row:2,col:0},{row:1,col:1},{row:2,col:1},{row:0,col:1}].slice(0,count)}
