// Helpers of ae-negative-41-harvest-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import fs from '../audit-evidence-fs'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import type { ActionChoiceOption, GameState } from '../../../../shared/contract/types'
import { createWorkSession } from '../session-fixtures'
import { confirmNext, passPreparationExchanges } from '../negative-rule-audit'

export const sessions: GameSession[] = []
export const output = process.env.AGRICOLA_NEGATIVE_ARTIFACT_DIR ?? 'output/ae-negative/41/harvest-oa-probes'
export function ok(r: SessionResponse): SessionResponse { assert.equal(r.ok, true, `${r.error} ${JSON.stringify(r.interaction)}`); return JSON.parse(JSON.stringify(r)) }
export function save(id: string, data: unknown) { fs.mkdirSync(output, { recursive: true }); fs.writeFileSync(`${output}/${id}.json`, JSON.stringify(data, null, 2)) }
export function opts(r: SessionResponse): ActionChoiceOption[] { return r.interaction.stateId === 'wait' && 'options' in r.interaction.request ? r.interaction.request.options ?? [] : [] }
export function setup(card: string, configure: (s: GameState) => void = () => {}, played = true, round = 14) {
  const s = createWorkSession({ seed: 4241, options: { playerCount: 2 }, configure(st) {
    st.round = round
    st.roundActionOrder = ['grain-utilization','major-improvement','fencing','sheep-market','wish-children','western-quarry','house-redevelopment','pig-market','vegetable-seeds','cattle-market','eastern-quarry','urgent-wish-children','cultivation','farm-redevelopment']
    for (const p of st.players) {
      p.minorHand = ['__test_placeholder__']; p.occupationHand = ['__test_placeholder__']; p.minorPlayed = []; p.occupationPlayed = []; p.improvements = []; p.cardStates = {}
      Object.assign(p.resources, { wood: 0, clay: 0, reed: 0, stone: 0, food: 100, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 })
    }
    st.players[0]!.minorPlayed = played ? [card] : []
    st.players[0]!.minorHand = played ? ['__test_placeholder__'] : [card]
    const required={'E075_StoneAxe':2,'C074_PrivateForest':1,'D073_SupplyBoat':1,'D075_WoodField':1,'E072_ArtichokeField':2}[card]??0
    if(played&&required)st.players[0]!.occupationPlayed=['A100_Curator','A110_Roughcaster'].slice(0,required)
    configure(st)
  } }); sessions.push(s); return s
}
export function finish(s: GameSession, initial: SessionResponse, accept = false, absent?: string): SessionResponse {
  let r = ok(initial)
  for (let step = 0; step < 80 && r.interaction.stateId === 'wait'; step++) {
    r = passPreparationExchanges(s, r)
    const i = r.interaction
    if (i.stateId !== 'wait' || i.request.kind === 'confirm-next-player') return r
    if (absent) assert.ok(!JSON.stringify(i).includes(absent), `unexpected source ${JSON.stringify(i)}`)
    const q = i.request
    if(i.anytimeActions.some(a=>a.sourceCard==='D071_Changeover')&&r.state.roundPhase!=='work')return r
    if (q.kind === 'confirm-player-switch') r = ok(s.resolveChoice(q.fromPlayerIndex, 'confirm'))
    else if (q.kind === 'select-trigger') {
      const o = q.options.find(o => o.value !== '__pass__' && o.labelKey !== 'actions.exchange.name'); assert.ok(o, JSON.stringify(i)); r = ok(s.resolveChoice(i.playerIndex, o.value))
    } else if (q.kind === 'choice') {
      const o = (accept ? q.options.find(o => !o.disabled && !['__skip__','__done__','__pass__'].includes(o.value) && o.labelKey !== 'actions.exchange.name') : undefined) ?? q.options.find(o => !o.disabled && ['__skip__','__done__','__pass__'].includes(o.value)); assert.ok(o, JSON.stringify(i)); r = ok(s.resolveChoice(i.playerIndex, o.value))
    } else if(q.kind==='farm-select'&&q.farm.farmType==='plow')r=ok(s.commitSelectionChoice(i.playerIndex,{tile:q.farm.selectableTiles[0]!}))
    else if (q.kind === 'feed') r = ok(s.resolveChoice(i.playerIndex, 'confirm', { selections: [] }))
    else if (q.kind === 'animal-reorg') r = ok(s.resolveChoice(i.playerIndex, 'confirm', { zones: q.zones }))
    else assert.fail(JSON.stringify(i))
  }
  assert.notEqual(r.interaction.stateId, 'wait', 'unresolved pending'); return r
}
export function select(s: GameSession, initial: SessionResponse, predicate: (o: ActionChoiceOption) => boolean) {
  let r = ok(initial)
  for (let n = 0; n < 16; n++) {
    assert.ok(r.interaction.stateId === 'wait', JSON.stringify(r.interaction))
    const i = r.interaction, target = opts(r).find(predicate)
    if (target) return ok(s.resolveChoice(i.playerIndex, target.value))
    if (i.request.kind === 'confirm-player-switch') r = ok(s.resolveChoice(i.request.fromPlayerIndex, 'confirm'))
    else {
      const o = opts(r).find(o => !o.disabled && !['__skip__','__done__','__pass__'].includes(o.value) && o.labelKey !== 'actions.exchange.name'); assert.ok(o, JSON.stringify(i)); r = ok(s.resolveChoice(i.playerIndex, o.value))
    }
  }
  assert.fail('target choice not reached')
}
export function play(s: GameSession, card: string) {
  let r = ok(s.takeAction(0, 'meeting-place'))
  for (let n = 0; n < 12 && r.state.players[0]!.minorHand.includes(card); n++) {
    const target = opts(r).find(o => o.value === card)
    if (target) { assert.ok(!target.disabled); assert.ok(r.interaction.stateId === 'wait'); r = ok(s.resolveChoice(r.interaction.playerIndex, target.value)) }
    else r = select(s, r, o => o.value.startsWith('action-improvement-'))
  }
  assert.ok(r.state.players[0]!.minorPlayed.includes(card), JSON.stringify(r.interaction)); return finish(s, r)
}
export function next(s: GameSession, r: SessionResponse) { assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player', JSON.stringify(r.interaction)); return ok(confirmNext(s, r)) }
export function enterSow(s:GameSession,r:SessionResponse){if(!(r.interaction.stateId==='wait'&&r.interaction.request.kind==='farm-select'&&r.interaction.request.farm.farmType==='sow'))r=select(s,r,o=>o.labelKey==='actions.sow.name');return r}
export function sow(s:GameSession,r:SessionResponse,crops:{row:number,col:number,crop:'grain'|'vegetable'}[]){if(!(r.interaction.stateId==='wait'&&r.interaction.request.kind==='farm-select'&&r.interaction.request.farm.farmType==='sow'))r=select(s,r,o=>o.labelKey==='actions.sow.name');assert.ok(r.interaction.stateId==='wait'&&r.interaction.request.kind==='farm-select'&&r.interaction.request.farm.farmType==='sow',JSON.stringify(r.interaction));return ok(s.commitSelectionChoice(r.interaction.playerIndex,{crops}))}
export function field(st:GameState,count=0,actor=0,col=1){st.players[actor]!.fields.push({row:0,col,stacks:count?[{kind:'grain',remaining:count}]:[]})}
export function cardSow(s:GameSession,initial:SessionResponse,crop:'wood'|'grain'|'vegetable',count=1){const r=enterSow(s,initial);assert.ok(r.interaction.stateId==='wait'&&r.interaction.request.kind==='farm-select'&&r.interaction.request.farm.farmType==='sow');const targets=r.interaction.request.farm.selectableFields.filter(f=>f.tile.row<0&&f.allowedCrops.includes(crop)).slice(0,count);assert.equal(targets.length,count);return ok(s.commitSelectionChoice(0,{crops:targets.map(f=>({...f.tile,crop}))}))}
export function slots(r:SessionResponse,card:string){return r.state.players[0]!.cardStates[card]?.extraData?.cardFieldStacks}
export function vegetable(st:GameState,col:number,remaining=2){st.players[0]!.fields.push({row:0,col,stacks:[{kind:'vegetable',remaining}]})}
export function end(s:GameSession){let r=ok(s.getState());for(const space of ['clay-pit','forest','reed-bank','fishing']){if(r.interaction.stateId==='wait'&&r.interaction.request.kind==='confirm-next-player')r=next(s,r);r=ok(s.takeAction(r.state.currentPlayerIndex,space));if(space!=='fishing')r=finish(s,r)}if(r.interaction.stateId==='wait'&&r.interaction.request.kind==='confirm-next-player')r=next(s,r);return r}
export function source(s:GameSession,initial:SessionResponse,card:string,kind?:string){let r=initial;for(let n=0;n<32;n++){const i=r.interaction;if(i.stateId==='wait'&&i.sourceCard===card&&(!kind||i.request.kind===kind))return r;assert.ok(i.stateId==='wait',JSON.stringify(i));if(i.request.kind==='confirm-player-switch')r=ok(s.resolveChoice(i.request.fromPlayerIndex,'confirm'));else {const o=opts(r).find(o=>o.value===card)??opts(r).find(o=>!o.disabled&&!['__skip__','__pass__','__done__'].includes(o.value)&&o.labelKey!=='actions.exchange.name');assert.ok(o,JSON.stringify(i));r=ok(s.resolveChoice(i.playerIndex,o.value))}}assert.fail('source pending not reached')}
export function pasture(st:GameState,species=2){const p=st.players[0]!;p.pastures=[];const edges=new Set<string>();for(let n=0;n<species;n++){const col=3+n,type=n?'cattle' as const:'sheep' as const;p.pastures.push({id:type,tiles:[{row:0,col},{row:1,col}],animalType:type,animalCount:2});p.resources[type]=2;for(const e of [`H-0-${col}`,`H-2-${col}`,`V-0-${col}`,`V-1-${col}`,`V-0-${col+1}`,`V-1-${col+1}`])edges.add(e)}p.fenceSegments=[...edges].map(edge=>({edge,type:'fence',source:{kind:'own',ownerPlayerId:p.id}}))}
export function cowFarm(st:GameState,full=true,cattle=1){const p=st.players[0]!;p.pastures=[{id:'cow',tiles:[{row:0,col:2},{row:1,col:2}],animalType:cattle?'cattle':null,animalCount:cattle}];p.resources.cattle=cattle;p.fenceSegments=['H-0-2','H-2-2','V-0-2','V-1-2','V-0-3','V-1-3'].map(edge=>({edge,type:'fence',source:{kind:'own',ownerPlayerId:p.id}}));if(!full){p.pastures[0]!.tiles=[{row:0,col:2}];p.fenceSegments=['H-0-2','H-1-2','V-0-2','V-0-3'].map(edge=>({edge,type:'fence',source:{kind:'own',ownerPlayerId:p.id}}))}p.fields=full?[{row:0,col:1,stacks:[]},{row:1,col:1,stacks:[]},{row:2,col:1,stacks:[]},{row:2,col:2,stacks:[]},{row:2,col:3,stacks:[]},{row:1,col:3,stacks:[]},{row:0,col:3,stacks:[{kind:'grain',remaining:2}]}]:[{row:1,col:1,stacks:[]}];}
export function finishAnimals(s:GameSession,initial:SessionResponse){let r=initial;for(let n=0;n<64;n++){const i=r.interaction;if(i.stateId!=='wait'||i.request.kind==='confirm-next-player')return r;if(i.sourceCard==='C071_Slurry')return r;if(i.request.kind==='animal-reorg'){const q=i.request;const zones=q.zones.map(z=>z.id==='sheep'||z.id==='cattle'?{...z,animalType:z.id==='sheep'?'sheep' as const:'cattle' as const,animalCount:3}:z);r=ok(s.resolveChoice(i.playerIndex,'confirm',{zones}))}else if(i.request.kind==='feed')r=ok(s.resolveChoice(i.playerIndex,'confirm',{selections:[]}));else if(i.request.kind==='confirm-player-switch')r=ok(s.resolveChoice(i.request.fromPlayerIndex,'confirm'));else {const o=opts(r).find(o=>['__skip__','__pass__','__done__'].includes(o.value));assert.ok(o,JSON.stringify(i));r=ok(s.resolveChoice(i.playerIndex,o.value))}}assert.fail('harvest animals did not settle')}
