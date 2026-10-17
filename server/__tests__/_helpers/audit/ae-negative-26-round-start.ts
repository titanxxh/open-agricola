// Helpers of ae-negative-26-round-start-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import fs from '../audit-evidence-fs'
import { setActiveWorkerCount } from '../../../../shared/domain/player'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import type { GameState } from '../../../../shared/contract/types'
import { createWorkSession } from '../session-fixtures'
import { confirmNext, passPreparationExchanges } from '../negative-rule-audit'

export const PAVIOR='B110_Pavior',CHILD='B114_Childless'
export const sessions:GameSession[]=[]
export const output=process.env.AGRICOLA_NEGATIVE_ARTIFACT_DIR??'output/ae-negative/26-round-start-probes'
export function save(id:string,value:unknown){fs.mkdirSync(output,{recursive:true});fs.writeFileSync(`${output}/${id}.json`,JSON.stringify(value,null,2))}
export function ok(r:SessionResponse){assert.equal(r.ok,true,r.error);return JSON.parse(JSON.stringify(r)) as SessionResponse}
export function setup(card:string,round=5,configure:(state:GameState)=>void=()=>{}){const s=createWorkSession({seed:4242,options:{playerCount:2},configure(state){state.round=round;for(const p of state.players)Object.assign(p.resources,{food:100,wood:0,clay:0,reed:0,stone:0,grain:0,vegetable:0});const p=state.players[0]!;p.minorHand=[card,'B004_WoodPile','A006_StorageBarn'];configure(state)}});sessions.push(s);return s}
export function finish(s:GameSession,r:SessionResponse,accept=true){for(let n=0;n<32&&r.interaction.stateId==='wait'&&r.interaction.request.kind!=='confirm-next-player';n++){r=passPreparationExchanges(s,r);if(r.interaction.stateId!=='wait')break;const i=r.interaction;if(i.request.kind==='select-trigger'){const option=i.request.options.find(o=>!('disabled'in o&&o.disabled)&&o.value!=='__pass__'&&o.labelKey!=='actions.exchange.name');assert.ok(option,JSON.stringify(i));r=ok(s.resolveChoice(i.playerIndex,option.value));continue}if(i.request.kind==='confirm-player-switch')r=ok(s.resolveChoice(i.request.fromPlayerIndex,'confirm'));else if(i.request.kind==='feed')r=ok(s.resolveChoice(i.playerIndex,'confirm',{selections:[]}));else if(i.request.kind==='animal-reorg')r=ok(s.resolveChoice(i.playerIndex,'confirm',{zones:i.request.zones}));else if(i.request.kind==='farm-select'){assert.equal(i.request.farm.farmType,'plow');r=ok(s.commitSelectionChoice(i.playerIndex,{tile:i.request.farm.selectableTiles[0]!}))}else{assert.ok(i.request.kind==='choice',JSON.stringify(i));const options:import('../../shared/contract/types').ActionChoiceOption[]=i.request.options,o=(accept?options.find(o=>!o.disabled&&!['__skip__','__done__','__pass__'].includes(o.value)&&o.labelKey!=='actions.exchange.name'):undefined)??options.find(o=>!o.disabled&&['__skip__','__done__','__pass__'].includes(o.value));assert.ok(o,JSON.stringify(i));r=ok(s.resolveChoice(i.playerIndex,o.value))}}return JSON.parse(JSON.stringify(r)) as SessionResponse}
export function nextRound(s:GameSession,target:number){let r=s.getState();for(let n=0;n<8;n++){if(r.interaction.stateId==='wait'&&r.interaction.request.kind==='confirm-next-player')r=confirmNext(s,r);if(r.state.round===target)return r;r=finish(s,r,false);assert.equal(r.state.round,target-1);assert.equal(r.interaction.stateId,'idle');const actor=r.state.currentPlayerIndex,space=['grain-seeds','clay-pit','reed-bank','day-laborer','forest','fishing'].find(id=>s.getActionAvailability(actor)[id]);assert.ok(space);r=ok(s.takeAction(actor,space))}assert.fail('Natural next round not reached')}
export function make(card:string,round=8,played=true,stone=1,rooms=3,people=2){return setup(card,round,state=>{const p=state.players[0]!;p.minorHand=['B004_WoodPile','A006_StorageBarn'];p.occupationPlayed=played?[card]:[];p.occupationHand=played?['__test_placeholder__']:[card];p.resources.stone=stone;p.rooms=rooms;p.roomTiles=[{row:1,col:0},{row:2,col:0},...Array.from({length:rooms-2},(_,i)=>({row:0,col:i}))];setActiveWorkerCount(p,people);assert.equal(p.workers.length,5)})}
export function crop(s:GameSession,r:SessionResponse,kind:'grain'|'vegetable') {
  const before=r.state.players[0]!.resources[kind]
  for(let n=0;n<8;n++) {
    assert.ok(r.interaction.stateId==='wait'&&(r.interaction.request.kind==='choice'||r.interaction.request.kind==='select-trigger'),JSON.stringify(r.interaction))
    const options:import('../../shared/contract/types').ActionChoiceOption[]=r.interaction.request.options
    const o=options.find(o=>!o.disabled&&JSON.stringify(o.effectPreview).includes(`"${kind}":1`))
      ?? options.find(o=>!o.disabled&&o.sourceCard===CHILD)
    assert.ok(o,JSON.stringify(r.interaction));r=ok(s.resolveChoice(0,o.value))
    if(r.state.players[0]!.resources[kind]===before+1)return finish(s,r,false)
  }
  assert.fail('Crop choice not completed')
}
