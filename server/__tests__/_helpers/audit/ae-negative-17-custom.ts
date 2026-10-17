// Helpers of ae-negative-17-custom-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import fs from '../audit-evidence-fs'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import type { GameState } from '../../../../shared/contract/types'
import { createWorkSession } from '../session-fixtures'
import { confirmNext } from '../negative-rule-audit'
import { createPlayerActionSpaces } from '../../../../shared/cards/player-action-space'

export const CARD='A162_ForestTallyman'
export const sessions:GameSession[]=[]
export const output=process.env.AGRICOLA_NEGATIVE_ARTIFACT_DIR??'output/ae-negative/17-custom-probes'
export function save(id:string,value:unknown){fs.mkdirSync(output,{recursive:true});fs.writeFileSync(`${output}/${id}.json`,JSON.stringify(value,null,2))}
export function ok(r:SessionResponse){assert.equal(r.ok,true,r.error);return r}
export function setup(card:string,configure:(state:GameState)=>void=()=>{},played=true){const players=4;const s=createWorkSession({seed:4242,options:{playerCount:players},configure(state){state.round=14;for(const p of state.players)Object.assign(p.resources,{food:40,wood:0,clay:0,reed:0,stone:0,grain:0,vegetable:0});state.players[0]!.occupationPlayed=played?[card]:[];state.players[0]!.occupationHand=played?['__test_placeholder__']:[card,'A110_Roughcaster'];configure(state);for(const a of createPlayerActionSpaces(state))if(!state.actionSpaces.some(x=>x.id===a.id))state.actionSpaces.push(a)}});sessions.push(s);assert.equal(s.getState().state.players.length,players);return s}
export function turn(s:GameSession,actor:number,space:string){let r=s.getState();if(r.interaction.stateId==='wait'&&r.interaction.request.kind==='confirm-next-player')r=confirmNext(s,r);assert.equal(r.interaction.stateId,'idle');assert.equal(r.state.currentPlayerIndex,actor);return ok(s.takeAction(actor,space))}
export function occupyBoth(s:GameSession){turn(s,0,'grain-seeds');const forest=turn(s,1,'forest');turn(s,2,'clay-pit');turn(s,3,'fishing');return forest}
