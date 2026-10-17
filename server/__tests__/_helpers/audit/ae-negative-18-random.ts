// Helpers of ae-negative-18-random-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import fs from '../audit-evidence-fs'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import type { GameState } from '../../../../shared/contract/types'
import { createWorkSession } from '../session-fixtures'

export const CARD='B003_Moonshine',A='A110_Roughcaster',B='A117_WoodCarrier'
export const sessions:GameSession[]=[]
export const output=process.env.AGRICOLA_NEGATIVE_ARTIFACT_DIR??'output/ae-negative/18-random-probes'
export function save(id:string,value:unknown){fs.mkdirSync(output,{recursive:true});fs.writeFileSync(`${output}/${id}.json`,JSON.stringify(value,null,2))}
export function ok(r:SessionResponse){assert.equal(r.ok,true,r.error);return r}
export function setup(food=2,hand=[A,B],configure:(state:GameState)=>void=()=>{}){const s=createWorkSession({seed:4242,options:{playerCount:4},configure(state){state.round=14;for(const p of state.players)Object.assign(p.resources,{food:20,wood:0,clay:0,reed:0,stone:0,grain:0,vegetable:0});state.players[0]!.resources.food=food;state.players[0]!.minorHand=[CARD,'A030_BakingSheet','A006_StorageBarn'];state.players[0]!.occupationHand=hand;configure(state)}});sessions.push(s);return s}
export function buy(s:GameSession){let r=ok(s.takeAction(0,'meeting-place'));for(let n=0;n<5;n++){assert.ok(r.interaction.stateId==='wait'&&r.interaction.request.kind==='choice');const c=r.interaction.request.options.find(o=>o.value.startsWith('action-improvement-'));if(!c)break;r=ok(s.resolveChoice(0,c.value))}r=ok(s.resolveChoice(0,CARD));save('after-random-reveal',JSON.parse(JSON.stringify(r)));return r}
export function pick(r:SessionResponse){const c=r.state.players[0]!.cardStates[CARD]?.privateData?.occ;assert.ok(typeof c==='string');return c}
