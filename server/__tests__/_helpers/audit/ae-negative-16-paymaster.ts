// Helpers of ae-negative-16-paymaster-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import fs from '../audit-evidence-fs'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import type { GameState } from '../../../../shared/contract/types'
import { createWorkSession } from '../session-fixtures'
import { confirmNext } from '../negative-rule-audit'

export const CARD='A154_Paymaster'
export const sessions:GameSession[]=[]
export const output=process.env.AGRICOLA_NEGATIVE_ARTIFACT_DIR??'output/ae-negative/16-paymaster-probes'
export function save(id:string,value:unknown){fs.mkdirSync(output,{recursive:true});fs.writeFileSync(`${output}/${id}.json`,JSON.stringify(value,null,2))}
export function ok(r:SessionResponse){assert.equal(r.ok,true,r.error);return r}
export function setup(grain=1,played=true,configure:(state:GameState)=>void=()=>{}){const s=createWorkSession({seed:4242,options:{playerCount:4},configure(state){state.round=14;for(const p of state.players)Object.assign(p.resources,{food:40,wood:0,clay:0,reed:0,stone:0,grain:0,vegetable:0});const p=state.players[0]!;p.resources.grain=grain;p.occupationPlayed=played?[CARD]:[];p.occupationHand=played?['__test_placeholder__']:[CARD,'A110_Roughcaster'];configure(state)}});sessions.push(s);return s}
export function turn(s:GameSession,actor:number,space:string){let r=s.getState();if(r.interaction.stateId==='wait'&&r.interaction.request.kind==='confirm-next-player')r=confirmNext(s,r);assert.equal(r.interaction.stateId,'idle');assert.equal(r.state.currentPlayerIndex,actor);return ok(s.takeAction(actor,space))}
export function finish(s:GameSession,r:SessionResponse,accept=true){for(let n=0;n<12&&r.interaction.stateId==='wait'&&r.interaction.request.kind!=='confirm-next-player';n++){const i=r.interaction;if(i.request.kind==='confirm-player-switch')r=ok(s.resolveChoice(i.request.fromPlayerIndex,'confirm'));else if(i.request.kind==='choice'||i.request.kind==='select-trigger'){const o=i.request.options.find(o=>accept?o.value!=='__skip__'&&o.value!=='__done__':o.value==='__skip__'||o.value==='__done__');assert.ok(o,JSON.stringify(i));r=ok(s.resolveChoice(i.playerIndex,o.value))}else assert.fail(JSON.stringify(i))}return r}
export function vp(r:SessionResponse){return r.state.players[0]!.cardStates[CARD]?.counters?.bonusVp??0}
export function offer(s:GameSession,space='fishing'){turn(s,0,'day-laborer');return turn(s,1,space)}
