// Helpers of ae-negative-16-spaces-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import fs from '../audit-evidence-fs'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import type { GameState } from '../../../../shared/contract/types'
import { createWorkSession } from '../session-fixtures'
import { confirmNext } from '../negative-rule-audit'
import { descriptionEffects } from '../choice-description'

export const CORD='A142_Cordmaker',STEWARD='A146_StorehouseSteward',CONJURER='A155_Conjurer'
export const sessions:GameSession[]=[]
export const output=process.env.AGRICOLA_NEGATIVE_ARTIFACT_DIR??'output/ae-negative/16-spaces-probes'
export function save(id:string,value:unknown){fs.mkdirSync(output,{recursive:true});fs.writeFileSync(`${output}/${id}.json`,JSON.stringify(value,null,2))}
export function ok(r:SessionResponse){assert.equal(r.ok,true,r.error);return r}
export function setup(card:string,configure:(state:GameState)=>void=()=>{},played=true){const players=card===CORD?3:4;const s=createWorkSession({seed:4242,options:{playerCount:players},configure(state){state.round=14;for(const p of state.players)Object.assign(p.resources,{food:40,wood:0,clay:0,reed:0,stone:0,grain:0,vegetable:0});state.players[0]!.occupationPlayed=played?[card]:[];state.players[0]!.occupationHand=played?['__test_placeholder__']:[card,'A110_Roughcaster'];configure(state)}});sessions.push(s);assert.equal(s.getState().state.players.length,players);return s}
export function pile(state:GameState,space:string,resource:'food'|'reed',count:number){const a=state.actionSpaces.find(a=>a.id===space);assert.ok(a,space);a.resources[resource]=count}
export function turn(s:GameSession,actor:number,space:string){let r=s.getState();if(r.interaction.stateId==='wait'&&r.interaction.request.kind==='confirm-next-player')r=confirmNext(s,r);assert.equal(r.interaction.stateId,'idle');assert.equal(r.state.currentPlayerIndex,actor);return ok(s.takeAction(actor,space))}
export function crops(s:GameSession,r:SessionResponse,crop:'grain'|'vegetable'|null){for(let n=0;n<10&&r.interaction.stateId==='wait'&&r.interaction.request.kind!=='confirm-next-player';n++){const i=r.interaction;if(i.request.kind==='confirm-player-switch')r=ok(s.resolveChoice(i.request.fromPlayerIndex,'confirm'));else{assert.ok(i.request.kind==='choice',JSON.stringify(i));const o=i.request.options.find(o=>crop?JSON.stringify(descriptionEffects(o.descriptionPreview)).includes(`"${crop}":1`):o.value==='__skip__'||o.value==='__done__')??(crop?i.request.options.find(o=>o.value!=='__skip__'&&o.value!=='__done__'&&!o.disabled):undefined);assert.ok(o,JSON.stringify(i));r=ok(s.resolveChoice(i.playerIndex,o.value))}}return r}
export function res(r:SessionResponse){return (['stone','reed','clay','wood'] as const).map(k=>r.state.players[0]!.resources[k])}
export function cord(count:number,food=40,played=true){return setup(CORD,state=>{pile(state,'reed-bank','reed',count);state.players[0]!.resources.food=food},played)}
