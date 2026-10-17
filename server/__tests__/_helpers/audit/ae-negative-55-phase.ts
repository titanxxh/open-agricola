// Helpers of ae-negative-55-phase-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import fs from '../audit-evidence-fs'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import type { ActionChoiceOption, GameState } from '../../../../shared/contract/types'
import { markAllWorkersUsed } from '../../../../shared/domain/player'
import { createWorkSession } from '../session-fixtures'
import { confirmNext, passPreparationExchanges } from '../negative-rule-audit'

export const sessions: GameSession[] = []
export const output = process.env.AGRICOLA_NEGATIVE_ARTIFACT_DIR ?? 'output/ae-negative/55/phase-oa-probes'
export function ok(response: SessionResponse): SessionResponse {
  assert.equal(response.ok, true, `${response.error} ${JSON.stringify(response.interaction)}`)
  return JSON.parse(JSON.stringify(response))
}
export function save(id: string, value: unknown) {
  fs.mkdirSync(output, { recursive: true })
  fs.writeFileSync(`${output}/${id}.json`, JSON.stringify(value, null, 2))
}
export function make(card: string, configure: (state: GameState) => void = () => {}, played = true, round = 5) {
  const session = createWorkSession({ seed: 4255, options: { playerCount: 4 }, configure(state) {
    state.round = round
    for (const player of state.players) {
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
      player.occupationPlayed = []
      player.minorPlayed = []
      player.improvements = []
      player.cardStates = {}
      Object.assign(player.resources, { wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0, food: 100, sheep: 0, boar: 0, cattle: 0, begging: 0 })
    }
    state.players[0]!.occupationPlayed = played ? [card] : []
    state.players[0]!.occupationHand = played ? ['__test_placeholder__'] : [card, 'A110_Roughcaster']
    configure(state)
  } })
  sessions.push(session)
  return session
}
export function finish(session: GameSession, initial: SessionResponse, accept = false, forbiddenCard?: string): SessionResponse {
  let response = ok(initial)
  for (let step = 0; step < 80 && response.interaction.stateId === 'wait'; step++) {
    response = passPreparationExchanges(session, response)
    const interaction = response.interaction
    if (interaction.stateId !== 'wait' || interaction.request.kind === 'confirm-next-player') return ok(response)
    const request = interaction.request
    if (forbiddenCard && (request.kind === 'choice' || request.kind === 'select-trigger')) assert.equal(JSON.stringify(request.options).includes(forbiddenCard), false, `Unexpected ${forbiddenCard} offer`)
    if (request.kind === 'confirm-player-switch') response = ok(session.resolveChoice(request.fromPlayerIndex, 'confirm'))
    else if (request.kind === 'select-trigger') {
      const option = request.options.find(option => !('disabled' in option && option.disabled) && option.value !== '__pass__' && option.labelKey !== 'actions.exchange.name')
      assert.ok(option, JSON.stringify(interaction))
      response = ok(session.resolveChoice(interaction.playerIndex, option.value))
    } else if (request.kind === 'choice') {
      const option = (accept ? request.options.find(option => !option.disabled && !['__skip__', '__done__', '__pass__'].includes(option.value) && option.labelKey !== 'actions.exchange.name') : undefined)
        ?? request.options.find(option => !option.disabled && ['__skip__', '__done__', '__pass__'].includes(option.value))
      assert.ok(option, JSON.stringify(interaction))
      response = ok(session.resolveChoice(interaction.playerIndex, option.value))
    } else if (request.kind === 'animal-reorg') response = ok(session.resolveChoice(interaction.playerIndex, 'confirm', { zones: request.zones }))
    else if(request.kind==='farm-select'&&request.farm.farmType==='room') response=ok(session.commitSelectionChoice(interaction.playerIndex,{rooms:[request.farm.selectableTiles[0]!]}))
    else if(request.kind==='farm-select'&&request.farm.farmType==='stable') response=ok(session.commitSelectionChoice(interaction.playerIndex,{stables:[request.farm.selectableTiles[0]!]}))
    else if (request.kind === 'feed') response = ok(session.resolveChoice(interaction.playerIndex, 'confirm', { selections: [] }))
    else assert.fail(`Unexpected pending ${JSON.stringify(interaction)}`)
  }
  assert.notEqual(response.interaction.stateId, 'wait', 'Pending resolution exceeded safety limit')
  return ok(response)
}
export function play(session: GameSession, card: string) {
  let response = ok(session.takeAction(0, 'lessons'))
  if (response.state.players[0]!.occupationHand.includes(card)) {
    assert.ok(response.interaction.stateId === 'wait' && response.interaction.request.kind === 'choice')
    const choice = response.interaction.request.options.find(option => option.value === card)
    assert.ok(choice)
    response = ok(session.resolveChoice(response.interaction.playerIndex, choice.value))
  }
  assert.ok(response.state.players[0]!.occupationPlayed.includes(card))
  return response
}
export function enter(session: GameSession, initial: SessionResponse, predicate: (option: ActionChoiceOption) => boolean) {
  let response = ok(initial)
  for (let step = 0; step < 16; step++) {
    const interaction = response.interaction
    assert.ok(interaction.stateId === 'wait', JSON.stringify(interaction))
    const request = interaction.request
    if (request.kind === 'confirm-player-switch') response = ok(session.resolveChoice(request.fromPlayerIndex, 'confirm'))
    else if (request.kind === 'select-trigger') {
      const option = request.options.find(option => option.value !== '__pass__' && option.labelKey !== 'actions.exchange.name')
      assert.ok(option)
      response = ok(session.resolveChoice(interaction.playerIndex, option.value))
    } else {
      assert.equal(request.kind, 'choice')
      assert.ok(request.kind === 'choice')
      if (request.options.some(predicate)) return response
      const option = request.options.find(option => !option.disabled && !['__skip__', '__done__', '__pass__'].includes(option.value))
      assert.ok(option, JSON.stringify(request))
      response = ok(session.resolveChoice(interaction.playerIndex, option.value))
    }
  }
  assert.fail('Card decision was not reached')
}
export function choose(session: GameSession, response: SessionResponse, predicate: (option: ActionChoiceOption) => boolean) {
  const pending = enter(session, response, predicate)
  assert.ok(pending.interaction.stateId === 'wait' && pending.interaction.request.kind === 'choice')
  const option = pending.interaction.request.options.find(predicate)
  assert.ok(option)
  return ok(session.resolveChoice(pending.interaction.playerIndex, option.value))
}
export function score(r:SessionResponse,card:string){assert.ok(r.scores);return r.scores[0]!.categories.find(c=>c.key==='cardBonusVp')?.entries.find(e=>'cardId'in e&&e.cardId===card)?.score??0}
export function end(s:GameSession){for(const p of s.state.players)markAllWorkersUsed(s.state,p);s.loadState(s.state);return ok(s.performRoundEnd())}
export function ready(s:GameSession){let r=s.getState();if(r.interaction.stateId==='wait'&&r.interaction.request.kind==='confirm-next-player')r=confirmNext(s,r);r=finish(s,r);assert.equal(r.interaction.stateId,'idle',JSON.stringify(r.interaction));return r}
export function transition(s:GameSession,target:number,accept=false){for(let n=0;n<40;n++){let r=s.getState();if(r.interaction.stateId==='wait'&&r.interaction.request.kind==='confirm-next-player')r=confirmNext(s,r);r=finish(s,r,accept);if(r.state.round===target)return r;assert.equal(r.state.round,target-1);const actor=r.state.currentPlayerIndex,space=['grain-seeds','day-laborer','forest','clay-pit','reed-bank','fishing','grove','copse','resource-market-4','traveling-players'].find(id=>s.getActionAvailability(actor)[id]);assert.ok(space);finish(s,ok(s.takeAction(actor,space)),accept);}assert.fail('Round transition limit')}
export function grainFields(st:GameState,count:number,crop:'grain'|'vegetable'='grain'){const tiles=[{row:0,col:0},{row:0,col:1},{row:0,col:2},{row:0,col:3},{row:0,col:4},{row:1,col:4},{row:1,col:3}];st.players[0]!.fields=tiles.slice(0,count).map(tile=>({...tile,stacks:[{kind:crop,remaining:2}]}))}
export function trade(s:GameSession,count:number){return s.resolveChoice(0,'confirm',{selections:[{sourceId:'E153_StoneSculptor',exchangeIndex:0,count,sourceName:'E153_StoneSculptor'}]})}
export function feed(s:GameSession){let p=end(s);for(let n=0;n<10;n++){if(p.interaction.stateId==='wait'&&p.interaction.request.kind==='feed'&&p.interaction.playerIndex===0)return p;assert.ok(p.interaction.stateId==='wait'&&['choice','select-trigger'].includes(p.interaction.request.kind),JSON.stringify(p.interaction));p=choose(s,p,o=>o.value==='__skip__'||o.value==='__pass__');}assert.fail('Feeding menu unavailable')}
