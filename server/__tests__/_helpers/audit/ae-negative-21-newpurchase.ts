// Helpers of ae-negative-21-newpurchase-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import fs from '../audit-evidence-fs'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import type { GameState } from '../../../../shared/contract/types'
import { createWorkSession } from '../session-fixtures'
import { confirmNext } from '../negative-rule-audit'

export const CARD='B070_NewPurchase'
export const sessions:GameSession[]=[]
export const output=process.env.AGRICOLA_NEGATIVE_ARTIFACT_DIR??'output/ae-negative/21-newpurchase-probes'
export function save(id:string,value:unknown){fs.mkdirSync(output,{recursive:true});fs.writeFileSync(`${output}/${id}.json`,JSON.stringify(value,null,2))}
export function ok(r:SessionResponse){assert.equal(r.ok,true,r.error);return JSON.parse(JSON.stringify(r)) as SessionResponse}
export function setup(card:string,round=5,configure:(state:GameState)=>void=()=>{}){const s=createWorkSession({seed:4242,options:{playerCount:2},configure(state){state.round=round;for(const p of state.players)Object.assign(p.resources,{food:100,wood:0,clay:0,reed:0,stone:0,grain:0,vegetable:0});const p=state.players[0]!;p.minorHand=[card,'B004_WoodPile','A006_StorageBarn'];configure(state)}});sessions.push(s);return s}
export function ready(s:GameSession,accept=true){let r=s.getState();if(r.interaction.stateId==='wait'&&r.interaction.request.kind==='confirm-next-player')r=confirmNext(s,r);r=finish(s,r,accept);assert.equal(r.interaction.stateId,'idle',JSON.stringify(r.interaction));return r}
export function finish(s:GameSession,r:SessionResponse,accept=true){for(let n=0;n<32&&r.interaction.stateId==='wait'&&r.interaction.request.kind!=='confirm-next-player';n++){const i=r.interaction;if(i.request.kind==='confirm-player-switch')r=ok(s.resolveChoice(i.request.fromPlayerIndex,'confirm'));else if(i.request.kind==='feed')r=ok(s.resolveChoice(i.playerIndex,'confirm',{selections:[]}));else if(i.request.kind==='animal-reorg')r=ok(s.resolveChoice(i.playerIndex,'confirm',{zones:i.request.zones}));else if(i.request.kind==='farm-select'){assert.equal(i.request.farm.farmType,'plow');r=ok(s.commitSelectionChoice(i.playerIndex,{tile:i.request.farm.selectableTiles[0]!}))}else{assert.ok(i.request.kind==='choice'||i.request.kind==='select-trigger',JSON.stringify(i));const options:import('../../shared/contract/types').ActionChoiceOption[]=i.request.options,o=(accept?options.find(o=>!o.disabled&&!['__skip__','__done__','__pass__'].includes(o.value)&&o.labelKey!=='actions.exchange.name'):undefined)??options.find(o=>!o.disabled&&['__skip__','__done__','__pass__'].includes(o.value));assert.ok(o,JSON.stringify(i));r=ok(s.resolveChoice(i.playerIndex,o.value))}}return JSON.parse(JSON.stringify(r)) as SessionResponse}
export function menu(s:GameSession){ready(s);let r=ok(s.takeAction(0,'meeting-place'));if(r.interaction.stateId==='wait'&&r.interaction.request.kind==='choice'){const o=r.interaction.request.options.find(o=>o.value.startsWith('action-improvement-'));if(o)r=ok(s.resolveChoice(0,o.value))}return r}
export function buy(s:GameSession,card:string){const pending=menu(s),r=finish(s,ok(s.resolveChoice(0,card)));if(['B004_WoodPile','A006_StorageBarn'].includes(card)){assert.ok(!r.state.players[0]!.minorPlayed.includes(card));assert.ok(r.state.players[1]!.minorHand.includes(card))}else assert.ok(r.state.players[0]!.minorPlayed.includes(card));return{pending,r}}
export function loaded(mode='owner',round=3){return setup(CARD,round,state=>{const p=state.players[0]!;p.minorPlayed=mode==='owner'?[CARD]:[];if(mode==='opponent'){p.minorHand=['B004_WoodPile','A006_StorageBarn'];state.players[1]!.minorPlayed=[CARD]}})}
export function next(s:GameSession,target:number,mode='both') {
  let r=s.getState()
  const choices:SessionResponse[]=[]
  const bought=new Set<string>()
  for(let n=0;n<128;n++) {
    if(r.interaction.stateId==='wait') {
      const i=r.interaction
      if(i.request.kind==='confirm-next-player') {r=confirmNext(s,r);continue}
      if(i.request.kind==='choice'||i.request.kind==='select-trigger') {
        const options:import('../../shared/contract/types').ActionChoiceOption[]=i.request.options
        const source=options.find(o=>o.sourceCard===CARD&&!o.disabled)
        if(i.sourceCard===CARD||source) {
          choices.push(JSON.parse(JSON.stringify(r)) as SessionResponse)
          if(i.request.kind==='select-trigger') {
            const value=mode==='none'?options.find(o=>o.value==='__pass__'&&!o.disabled):source
            assert.ok(value,JSON.stringify(i));r=ok(s.resolveChoice(i.playerIndex,value.value));continue
          }
          const activation=options.find(o=>!o.disabled&&o.value.startsWith('action-activate-card-effect-'))
          if(activation&&mode!=='none') {r=ok(s.resolveChoice(i.playerIndex,activation.value));continue}
          const crop=options.find(o=>{
            if(o.disabled||o.effectPreview?.kind!=='resourceExchange')return false
            const kind=o.effectPreview.resourcesGained?.vegetable?'vegetable':o.effectPreview.resourcesGained?.grain?'grain':undefined
            return kind&&!bought.has(kind)&&(mode==='both'||mode===kind)
          })
          if(crop) {
            const kind=crop.effectPreview?.kind==='resourceExchange'&&crop.effectPreview.resourcesGained?.vegetable?'vegetable':'grain'
            const before=r.state.players[i.playerIndex]!.resources[kind]
            r=ok(s.resolveChoice(i.playerIndex,crop.value))
            assert.equal(r.state.players[i.playerIndex]!.resources[kind],before+1)
            bought.add(kind);continue
          }
          const exit=options.find(o=>!o.disabled&&['__skip__','__done__','__pass__'].includes(o.value))
          assert.ok(exit,JSON.stringify(i));r=ok(s.resolveChoice(i.playerIndex,exit.value));continue
        }
      }
      r=finish(s,r,false)
      assert.ok(r.interaction.stateId==='idle'||(r.interaction.stateId==='wait'&&r.interaction.request.kind==='confirm-next-player'),JSON.stringify(r.interaction))
      continue
    }
    assert.equal(r.interaction.stateId,'idle')
    if(r.state.round>=target)break
    const actor=r.state.currentPlayerIndex,space=['grain-seeds','day-laborer','forest','clay-pit','reed-bank','fishing'].find(id=>s.getActionAvailability(actor)[id])
    assert.ok(space);r=ok(s.takeAction(actor,space))
  }
  assert.equal(r.state.round,target);assert.equal(r.state.roundPhase,'work');assert.equal(r.interaction.stateId,'idle')
  return{r:JSON.parse(JSON.stringify(r)) as SessionResponse,choices}
}
