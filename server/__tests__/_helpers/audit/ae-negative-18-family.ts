// Helpers of ae-negative-18-family-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import fs from '../audit-evidence-fs'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import { setActiveWorkerCount, setWorkersAtHome } from '../../../../shared/domain/player'
import { createWorkSession } from '../session-fixtures'
import { confirmNext } from '../negative-rule-audit'

export const CARD='B010_Caravan'
export const sessions:GameSession[]=[]
export const output=process.env.AGRICOLA_NEGATIVE_ARTIFACT_DIR??'output/ae-negative/18-family-probes'
export function save(id:string,value:unknown){fs.mkdirSync(output,{recursive:true});fs.writeFileSync(`${output}/${id}.json`,JSON.stringify(value,null,2))}
export function ok(r:SessionResponse){assert.equal(r.ok,true,r.error);return r}
export function setup(played=true,people=2,rooms=2,food=3,wood=3){const s=createWorkSession({seed:4242,options:{playerCount:2},configure(state){state.round=7;for(const p of state.players)Object.assign(p.resources,{food:30,wood:0,clay:0,reed:0,stone:0,grain:0,vegetable:0});const p=state.players[0]!;p.minorPlayed=played?[CARD]:[];p.minorHand=played?['A030_BakingSheet']:[CARD,'A030_BakingSheet','A006_StorageBarn'];p.resources.food=food;p.resources.wood=wood;p.roomTiles=[{row:1,col:0},{row:2,col:0},{row:1,col:1},{row:2,col:1},{row:1,col:2}].slice(0,rooms);p.rooms=rooms;setActiveWorkerCount(p,people);setWorkersAtHome(state,p,people)}});sessions.push(s);return s}
export function turn(s:GameSession,actor:number,space:string){let r=s.getState();if(r.interaction.stateId==='wait'&&r.interaction.request.kind==='confirm-next-player')r=confirmNext(s,r);assert.equal(r.interaction.stateId,'idle');assert.equal(r.state.currentPlayerIndex,actor);return ok(s.takeAction(actor,space))}
export function finish(s:GameSession,r:SessionResponse){for(let n=0;n<8&&r.interaction.stateId==='wait'&&r.interaction.request.kind==='choice';n++){const o=r.interaction.request.options.find(o=>o.value==='__skip__'||o.value==='__done__');assert.ok(o,JSON.stringify(r.interaction));r=ok(s.resolveChoice(r.interaction.playerIndex,o.value))}return r}
