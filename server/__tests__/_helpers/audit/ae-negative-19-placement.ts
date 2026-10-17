// Helpers of ae-negative-19-placement-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import fs from '../audit-evidence-fs'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import type { GameState } from '../../../../shared/contract/types'
import { setActiveWorkerCount, setWorkersAtHome } from '../../../../shared/domain/player'
import { createWorkSession } from '../session-fixtures'
import { confirmNext } from '../negative-rule-audit'

export const BOOTS='B022_WalkingBoots',FINAL='B023_FinalScenario'
export const sessions:GameSession[]=[]
export const output=process.env.AGRICOLA_NEGATIVE_ARTIFACT_DIR??'output/ae-negative/19-placement-probes'
export function save(id:string,value:unknown){fs.mkdirSync(output,{recursive:true});fs.writeFileSync(`${output}/${id}.json`,JSON.stringify(value,null,2))}
export function ok(r:SessionResponse){assert.equal(r.ok,true,r.error);return JSON.parse(JSON.stringify(r)) as SessionResponse}
export function setup(card:string,round=3,people=2,configure:(state:GameState)=>void=()=>{}){const s=createWorkSession({seed:4242,options:{playerCount:2},configure(state){state.round=round;for(const p of state.players)Object.assign(p.resources,{food:100,wood:0,clay:2,reed:1,stone:0,grain:0,vegetable:0});const p=state.players[0]!;p.minorHand=[card,'A030_BakingSheet','A006_StorageBarn'];setActiveWorkerCount(p,people);p.rooms=people;p.roomTiles=[{row:1,col:0},{row:2,col:0},{row:1,col:1},{row:2,col:1},{row:1,col:2}].slice(0,people);setWorkersAtHome(state,p,people);configure(state)}});sessions.push(s);return s}
export function ready(s:GameSession){let r=s.getState();if(r.interaction.stateId==='wait'&&r.interaction.request.kind==='confirm-next-player')r=confirmNext(s,r);assert.equal(r.interaction.stateId,'idle',JSON.stringify(r.interaction));return r}
export function turn(s:GameSession,actor:number,space:string){const r=ready(s);assert.equal(r.state.currentPlayerIndex,actor);return ok(s.takeAction(actor,space))}
export function finish(s:GameSession,r:SessionResponse){for(let n=0;n<24&&r.interaction.stateId==='wait'&&r.interaction.request.kind!=='confirm-next-player';n++){const i=r.interaction;if(i.request.kind==='confirm-player-switch')r=ok(s.resolveChoice(i.request.fromPlayerIndex,'confirm'));else if(i.request.kind==='feed')r=ok(s.resolveChoice(i.playerIndex,'confirm',{selections:[]}));else if(i.request.kind==='farm-select'){assert.equal(i.request.farm.farmType,'fence');r=ok(s.resolveChoice(i.playerIndex,'__skip__'))}else if(i.request.kind==='animal-reorg')r=ok(s.resolveChoice(i.playerIndex,'confirm',{zones:i.request.zones}));else{assert.ok(i.request.kind==='choice'||i.request.kind==='select-trigger',JSON.stringify(i));const o=i.request.options.find(o=>o.value==='__skip__'||o.value==='__done__')??i.request.options[0];assert.ok(o);r=ok(s.resolveChoice(i.playerIndex,o.value))}}return r}
export function menu(s:GameSession){let r=turn(s,0,'meeting-place');if(r.interaction.stateId==='wait'&&r.interaction.request.kind==='choice'){const o=r.interaction.request.options.find(o=>o.value.startsWith('action-improvement-'));if(o)r=ok(s.resolveChoice(0,o.value))}return r}
export function buy(s:GameSession,card:string){const pending=menu(s),r=ok(s.resolveChoice(0,card));assert.ok(r.state.players[0]!.minorPlayed.includes(card));return{pending,r}}
export function reach(s:GameSession,target:number){let r=s.getState();for(let n=0;n<32&&r.state.round<target;n++){r=ready(s);if(r.state.round>=target)break;const actor=r.state.currentPlayerIndex,space=['grain-seeds','day-laborer','forest','clay-pit','reed-bank','fishing','vegetable-seeds'].find(id=>s.getActionAvailability(actor)[id]);assert.ok(space);r=finish(s,ok(s.takeAction(actor,space)))}r=ready(s);assert.equal(r.state.round,target);return r}
