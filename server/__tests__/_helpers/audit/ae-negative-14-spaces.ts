// Helpers of ae-negative-14-spaces-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import fs from '../audit-evidence-fs'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import type { GameState } from '../../../../shared/contract/types'
import { createWorkSession } from '../session-fixtures'
import { confirmNext } from '../negative-rule-audit'

export const SEASON='A114_SeasonalWorker',CUTTER='A116_WoodCutter',FIRE='A119_FirewoodCollector',PUNCH='A121_ClayPuncher',KNAP='A124_Knapper'
export const sessions:GameSession[]=[]
export const output=process.env.AGRICOLA_NEGATIVE_ARTIFACT_DIR??'output/ae-negative/14-spaces-probes'
export function save(id:string,value:unknown){fs.mkdirSync(output,{recursive:true});fs.writeFileSync(`${output}/${id}.json`,JSON.stringify(value,null,2))}
export function ok(r:SessionResponse){assert.equal(r.ok,true,r.error);return r}
export function setup(card:string,configure:(state:GameState)=>void=()=>{},played=true,round=14){const s=createWorkSession({seed:4242,configure(state){state.round=round;for(const p of state.players)Object.assign(p.resources,{food:40,wood:0,clay:0,reed:0,stone:0,grain:0,vegetable:0});state.players[0]!.occupationPlayed=played?[card]:[];state.players[0]!.occupationHand=played?['A110_Roughcaster']:[card,'A110_Roughcaster'];configure(state)}});sessions.push(s);return s}
export function turn(s:GameSession,actor:number,space:string){let r=s.getState();if(r.interaction.stateId==='wait'&&r.interaction.request.kind==='confirm-next-player')r=confirmNext(s,r);assert.equal(r.interaction.stateId,'idle');assert.equal(r.state.currentPlayerIndex,actor);return ok(s.takeAction(actor,space))}
export function selectCrop(s:GameSession,r:SessionResponse,crop:'grain'|'vegetable'){assert.ok(r.interaction.stateId==='wait'&&r.interaction.request.kind==='choice');const o=r.interaction.request.options.find(o=>JSON.stringify(o.effectPreview).includes(`"${crop}":1`));assert.ok(o);return ok(s.resolveChoice(0,o.value))}
export function knapper(played=true,stone=0){return setup(KNAP,state=>{state.roundActionOrder=state.roundActionOrder.map(()=>null);state.roundActionOrder[4]='pig-market';state.roundActionOrder[5]='vegetable-seeds';state.roundActionOrder[6]='western-quarry';state.roundActionOrder[7]='cattle-market';for(const id of ['pig-market','vegetable-seeds','western-quarry','cattle-market'])state.actionSpaces.find(a=>a.id===id)!.roundAvailable=1;state.actionSpaces.find(a=>a.id==='pig-market')!.resources.boar=0;state.actionSpaces.find(a=>a.id==='western-quarry')!.resources.stone=stone;state.actionSpaces.find(a=>a.id==='cattle-market')!.resources.cattle=1},played)}
