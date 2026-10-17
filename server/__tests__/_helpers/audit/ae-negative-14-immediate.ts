// Helpers of ae-negative-14-immediate-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import fs from '../audit-evidence-fs'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import type { GameState } from '../../../../shared/contract/types'
import { createWorkSession } from '../session-fixtures'
import { assertRejectedUnchanged } from '../negative-rule-audit'

export const CARRIER='A117_WoodCarrier',PRIEST='A125_Priest'
export const sessions:GameSession[]=[]
export const output=process.env.AGRICOLA_NEGATIVE_ARTIFACT_DIR??'output/ae-negative/14-immediate-probes'
export function save(id:string,value:unknown){fs.mkdirSync(output,{recursive:true});fs.writeFileSync(`${output}/${id}.json`,JSON.stringify(value,null,2))}
export function ok(r:SessionResponse){assert.equal(r.ok,true,r.error);return r}
export function setup(card:string,configure:(state:GameState)=>void=()=>{}){const s=createWorkSession({seed:4242,configure(state){state.round=14;for(const p of state.players)Object.assign(p.resources,{wood:0,clay:0,reed:0,stone:0,grain:0,vegetable:0,food:40});state.players[0]!.occupationHand=[card,'A110_Roughcaster'];configure(state)}});sessions.push(s);return s}
export function play(s:GameSession,card:string){let r=ok(s.takeAction(0,'lessons'));assert.ok(r.interaction.stateId==='wait'&&r.interaction.request.kind==='choice');assertRejectedUnchanged(s,()=>s.resolveChoice(1,card));r=ok(s.resolveChoice(0,card));assert(r.state.players[0]!.occupationPlayed.includes(card));assert(r.state.log.length>0);return r}
export function material(state:GameState,type:'wood'|'clay'|'stone',rooms=2){const p=state.players[0]!;p.houseType=type;for(let n=2;n<rooms;n++)p.roomTiles.push({row:n-2,col:0});p.rooms=rooms}
