// Helpers of ae-negative-41-future-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import fs from '../audit-evidence-fs'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import type { ActionChoiceOption, GameState } from '../../../../shared/contract/types'
import { createWorkSession } from '../session-fixtures'
import { confirmNext, passPreparationExchanges } from '../negative-rule-audit'

export const sessions: GameSession[] = []
export const output = process.env.AGRICOLA_NEGATIVE_ARTIFACT_DIR ?? 'output/ae-negative/41/future-oa-probes'
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
export function complete(s:GameSession,spaces=['grain-seeds','clay-pit','day-laborer','reed-bank']){let r=ok(s.getState());for(const space of spaces){if(r.interaction.stateId==='wait'&&r.interaction.request.kind==='confirm-next-player')r=next(s,r);r=finish(s,r);assert.equal(r.interaction.stateId,'idle');r=finish(s,ok(s.takeAction(r.state.currentPlayerIndex,space)))}if(r.interaction.stateId==='wait'&&r.interaction.request.kind==='confirm-next-player')r=next(s,r);return finish(s,r)}
export function reward(o:ActionChoiceOption,key:'grain'|'vegetable'){const p=o.effectPreview;return p&&'resourcesGained' in p?p.resourcesGained?.[key]:undefined}
export function enterSow(s:GameSession,r:SessionResponse){if(!(r.interaction.stateId==='wait'&&r.interaction.request.kind==='farm-select'&&r.interaction.request.farm.farmType==='sow'))r=select(s,r,o=>o.labelKey==='actions.sow.name');return r}
export function sow(s:GameSession,r:SessionResponse,crops:{row:number,col:number,crop:'grain'|'vegetable'}[]){if(!(r.interaction.stateId==='wait'&&r.interaction.request.kind==='farm-select'&&r.interaction.request.farm.farmType==='sow'))r=select(s,r,o=>o.labelKey==='actions.sow.name');assert.ok(r.interaction.stateId==='wait'&&r.interaction.request.kind==='farm-select'&&r.interaction.request.farm.farmType==='sow',JSON.stringify(r.interaction));return ok(s.commitSelectionChoice(r.interaction.playerIndex,{crops}))}
export function buyPending(s:GameSession,card:string){let r=ok(s.takeAction(0,'meeting-place'));for(let n=0;n<12&&r.state.players[0]!.minorHand.includes(card)&&!(r.interaction.stateId==='wait'&&r.interaction.request.kind==='farm-select'&&r.interaction.request.farm.farmType==='sow');n++){const o=opts(r).find(o=>o.value===card)??opts(r).find(o=>o.value.startsWith('action-improvement-'));assert.ok(o,JSON.stringify(r.interaction));assert.ok(r.interaction.stateId==='wait');r=ok(s.resolveChoice(r.interaction.playerIndex,o.value))}return r}
export function field(st:GameState,count=0,actor=0,col=1){st.players[actor]!.fields.push({row:0,col,stacks:count?[{kind:'grain',remaining:count}]:[]})}
export function change(s:GameSession){const a=s.getState().interaction.anytimeActions.find(a=>a.sourceCard==='D071_Changeover');assert.ok(a,JSON.stringify(s.getState().interaction));return ok(s.takeAnytimeAction(0,a.id))}
