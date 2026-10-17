// Helpers of ae-negative-18-placement-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import fs from '../audit-evidence-fs'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import { createWorkSession } from '../session-fixtures'
import { confirmNext } from '../negative-rule-audit'

export const CARD='B004_WoodPile'
export const sessions:GameSession[]=[]
export const output=process.env.AGRICOLA_NEGATIVE_ARTIFACT_DIR??'output/ae-negative/18-placement-probes'
export function save(id:string,value:unknown){fs.mkdirSync(output,{recursive:true});fs.writeFileSync(`${output}/${id}.json`,JSON.stringify(value,null,2))}
export function ok(r:SessionResponse){assert.equal(r.ok,true,r.error);return r}
export function setup(count=0){const s=createWorkSession({seed:4242,options:{playerCount:2},configure(state){state.round=14;for(const p of state.players){Object.assign(p.resources,{food:20,wood:0,clay:0,reed:0,stone:0,grain:0,vegetable:0});p.workers.forEach((w,i)=>{w.isActive=i<count+1||i<2;w.isNewborn=false});p.rooms=Math.max(2,count+1);p.roomTiles=[{row:0,col:0},{row:1,col:0},{row:1,col:1},{row:2,col:0}].slice(0,p.rooms)}state.players[0]!.minorHand=[CARD,'A030_BakingSheet','A006_StorageBarn']}});sessions.push(s);return s}
export function turn(s:GameSession,actor:number,space:string){let r=s.getState();if(r.interaction.stateId==='wait'&&r.interaction.request.kind==='confirm-next-player')r=confirmNext(s,r);assert.equal(r.interaction.stateId,'idle');assert.equal(r.state.currentPlayerIndex,actor);return ok(s.takeAction(actor,space))}
export const OWN=['forest','reed-bank','clay-pit'],OTHER=['day-laborer','grain-seeds','fishing']
export function prepare(s:GameSession,count:number){for(let i=0;i<count;i++){turn(s,0,OWN[i]!);turn(s,1,OTHER[i]!)}return s.getState()}
export function buy(s:GameSession){let r=turn(s,0,'meeting-place');for(let n=0;n<5;n++){assert.ok(r.interaction.stateId==='wait'&&r.interaction.request.kind==='choice');const c=r.interaction.request.options.find(o=>o.value.startsWith('action-improvement-'));if(!c)break;r=ok(s.resolveChoice(0,c.value))}return ok(s.resolveChoice(0,CARD))}
