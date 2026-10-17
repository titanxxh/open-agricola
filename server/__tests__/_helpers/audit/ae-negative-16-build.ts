// Helpers of ae-negative-16-build-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import fs from '../audit-evidence-fs'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import type { GameState } from '../../../../shared/contract/types'
import { createWorkSession } from '../session-fixtures'
import { confirmNext } from '../negative-rule-audit'

export const CUTTER='A143_Stonecutter',ARTIST='A149_HouseArtist',STAGE='A150_Stagehand'
export const sessions:GameSession[]=[]
export const output=process.env.AGRICOLA_NEGATIVE_ARTIFACT_DIR??'output/ae-negative/16-build-probes'
export function save(id:string,value:unknown){fs.mkdirSync(output,{recursive:true});fs.writeFileSync(`${output}/${id}.json`,JSON.stringify(value,null,2))}
export function ok(r:SessionResponse){assert.equal(r.ok,true,r.error);return r}
export function setup(card:string,configure:(state:GameState)=>void=()=>{},played=true){const s=createWorkSession({seed:4242,options:{playerCount:card===CUTTER?3:4},configure(state){state.round=14;for(const p of state.players)Object.assign(p.resources,{food:40,wood:0,clay:0,reed:0,stone:0,grain:0,vegetable:0});state.players[0]!.occupationPlayed=played?[card]:[];state.players[0]!.occupationHand=played?['__test_placeholder__']:[card,'A110_Roughcaster'];configure(state)}});sessions.push(s);return s}
export function turn(s:GameSession,actor:number,space:string){let r=s.getState();if(r.interaction.stateId==='wait'&&r.interaction.request.kind==='confirm-next-player')r=confirmNext(s,r);assert.equal(r.interaction.stateId,'idle');assert.equal(r.state.currentPlayerIndex,actor);return ok(s.takeAction(actor,space))}
export function drive(s:GameSession,r:SessionResponse,kind:'room'|'stable'|'fence'|null='room'){for(let n=0;n<18&&r.interaction.stateId==='wait'&&r.interaction.request.kind!=='confirm-next-player';n++){const i=r.interaction;if(i.request.kind==='confirm-player-switch')r=ok(s.resolveChoice(i.request.fromPlayerIndex,'confirm'));else if(i.request.kind==='choice'){const label=kind==='room'?'actions.construct.name':kind==='stable'?'actions.stables.name':'actions.fencing.name';const o=i.request.options.find(o=>kind===null?o.value==='__skip__'||o.value==='__done__':o.labelKey===label)??i.request.options.find(o=>kind===null?o.value==='__skip__'||o.value==='__done__':o.value!=='__skip__'&&o.value!=='__done__'&&!o.disabled);assert.ok(o,JSON.stringify(i));r=ok(s.resolveChoice(i.playerIndex,o.value))}else if(i.request.kind==='farm-select'){if(kind==='room')r=ok(s.commitSelectionChoice(i.playerIndex,{rooms:[{row:1,col:1}]}));else if(kind==='stable')r=ok(s.commitSelectionChoice(i.playerIndex,{stables:[{row:0,col:1}]}));else if(kind==='fence')r=ok(s.commitSelectionChoice(i.playerIndex,{edges:['H-0-2','H-1-2','V-0-2','V-0-3']}));else assert.fail(JSON.stringify(i))}else assert.fail(JSON.stringify(i))}return r}
export function buy(s:GameSession,card:string){let r=turn(s,0,'major-improvement');for(let n=0;n<10&&!r.state.players[0]!.improvements.includes(card);n++){assert.ok(r.interaction.stateId==='wait'&&r.interaction.request.kind==='choice');const o=r.interaction.request.options.find(o=>o.value===card||o.value===`major:${card}`)??r.interaction.request.options.find(o=>o.value.startsWith('action-improvement-'));assert.ok(o,JSON.stringify(r.interaction));r=ok(s.resolveChoice(r.interaction.playerIndex,o.value))}return r}
export function artist(wood:number,reed:number,played=true){return setup(ARTIST,state=>{Object.assign(state.players[0]!.resources,{wood,reed});state.actionSpaces.find(a=>a.id==='traveling-players')!.resources.food=2},played)}
export function stage(wood=10,played=true){return setup(STAGE,state=>Object.assign(state.players[0]!.resources,{wood,reed:2}),played)}
export function offer(s:GameSession){turn(s,0,'day-laborer');return turn(s,1,'traveling-players')}
