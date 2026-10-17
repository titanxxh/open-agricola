import { createWorkSession } from './_helpers/session-fixtures'
import { describe, expect, it, afterEach } from 'vitest'
import type { GameSession, SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'
import { playImprovement } from './_helpers/card-play-lifecycle'

import '../../shared/cards/A/A057_MilkingParlor'
import '../../shared/cards/D/D074_RoyalWood'
import assert from 'node:assert/strict'
import * as audit41Resources from './_helpers/audit/ae-negative-41-resources'

const CARD_ID = 'D074_RoyalWood'
const TWO_WOOD_MINOR = 'A057_MilkingParlor'
const FILLER = '__test_placeholder__'
const ONE_CELL_FENCES = ['H-0-1', 'H-1-1', 'V-0-1', 'V-0-2']

const setup = ({
  played = true, wood = 0, reed = 0, stone = 0, food = 0, minorId,
}: {
  played?: boolean
  wood?: number
  reed?: number
  stone?: number
  food?: number
  minorId?: string
} = {}) => {
  const session = createWorkSession({ seed: 6074, options: { playerCount: 2 } })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 14
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.improvements = []
    player.cardStates = {}
    player.resources = {
      ...player.resources,
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0,
      sheep: 0, boar: 0, cattle: 0, begging: 0,
    }
  })
  const player = state.players[0]!
  player.resources = { ...player.resources, wood, reed, stone, food }
  player.minorHand = [
    ...(played ? [] : [CARD_ID]),
    ...(minorId ? [minorId] : []),
    FILLER,
  ]
  if (played) player.minorPlayed = [CARD_ID]
  for (const id of ['meeting-place', 'major-improvement', 'farm-expansion', 'fencing']) {
    state.actionSpaces.find((space) => space.id === id)!.takenBy = []
  }
  session.loadState(state)
  return session
}

const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? []
  : []

const enterMinorChoice = (session: GameSession) => {
  let response = session.takeAction(0, 'meeting-place')
  if (response.interaction.stateId !== 'wait') return response
  const improvement = options(response).find((option) =>
    option.value.startsWith('action-improvement-')
      || option.labelKey === 'ui.interactionActionOrReplace')
  if (improvement) response = session.resolveChoice(response.interaction.playerIndex, improvement.value)
  return response
}

const playMinor = (session: GameSession, cardId: string) => {
  let response = enterMinorChoice(session)
  if (!response.state.players[0]!.minorHand.includes(cardId)) return response
  if (response.interaction.stateId !== 'wait') return response
  const card = options(response).find((option) => option.value === cardId)
  if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
  return response
}

const chooseFarmExpansionMode = (session: GameSession, labelKey: string) => {
  let response = session.takeAction(0, 'farm-expansion')
  if (response.interaction.stateId !== 'wait') return response
  const mode = options(response).find((option) => option.labelKey === labelKey)
  if (mode) response = session.resolveChoice(response.interaction.playerIndex, mode.value)
  return response
}

const finishRoyalTrigger = (session: GameSession, response: SessionResponse) =>
  resolveTriggerIfPresent(session, response, CARD_ID)

describe('D074 Royal Wood parity', () => {
  it('D074 S1: paying one food plays Royal Wood', () => {
    const response = playMinor(setup({ played: false, food: 1 }), CARD_ID)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(0)
  })

  it('D074 S2: without one food Royal Wood is unavailable and pays nothing', () => {
    const response = enterMinorChoice(setup({ played: false }))

    expect(options(response).some((option) => option.value === CARD_ID)).toBe(false)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(0)
  })

  it('D074 S3: two wood paid for a major improvement returns one wood at turn end', () => {
    const session = setup({ wood: 2, stone: 2 })
    const state = session.getState().state
    state.availableMajorImprovements = ['Major_Joinery']
    session.loadState(state)

    let response = playImprovement(session, 'Major_Joinery')
    response = finishRoyalTrigger(session, response)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.improvements).toContain('Major_Joinery')
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 1, stone: 0 })
    expect(response.state.players[0]!.cardStates[CARD_ID]?.extraData?.woodSpent ?? 0).toBe(0)
  })

  it('D074 S4: two wood paid for a minor improvement returns one wood at turn end', () => {
    const session = setup({ wood: 2, minorId: TWO_WOOD_MINOR })
    let response = playMinor(session, TWO_WOOD_MINOR)
    response = finishRoyalTrigger(session, response)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(TWO_WOOD_MINOR)
    expect(response.state.players[0]!.resources.wood).toBe(1)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.extraData?.woodSpent ?? 0).toBe(0)
  })

  it('D074 S5: five wood paid for a Farm Expansion room returns two wood at turn end', () => {
    const session = setup({ wood: 5, reed: 2 })
    let response = chooseFarmExpansionMode(session, 'actions.construct.name')
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return
    expect(response.interaction.request.farm.farmType).toBe('room')
    if (response.interaction.request.farm.farmType !== 'room') return

    const room = response.interaction.request.farm.selectableTiles[0]!
    response = session.commitSelectionChoice(0, { rooms: [room] })
    response = finishRoyalTrigger(session, response)
    const done = options(response).find((option) => option.value === '__done__')
    if (done) response = session.resolveChoice(response.interaction.playerIndex, done.value)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.rooms).toBe(3)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 2, reed: 0 })
    expect(response.state.players[0]!.cardStates[CARD_ID]?.extraData?.woodSpent ?? 0).toBe(0)
  })

  it('D074 S6: two wood paid for a Farm Expansion stable returns one wood at turn end', () => {
    const session = setup({ wood: 2 })
    let response = chooseFarmExpansionMode(session, 'actions.stables.name')
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return
    expect(response.interaction.request.farm.farmType).toBe('stable')
    if (response.interaction.request.farm.farmType !== 'stable') return

    const stable = response.interaction.request.farm.selectableTiles[0]!
    response = session.commitSelectionChoice(0, { stables: [stable] })
    response = finishRoyalTrigger(session, response)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.stableTiles).toEqual([stable])
    expect(response.state.players[0]!.resources.wood).toBe(1)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.extraData?.woodSpent ?? 0).toBe(0)
  })

  it('D074 S7: room and stable wood payments in one turn are combined then rounded down', () => {
    const session = setup({ wood: 7, reed: 2 })
    let response = chooseFarmExpansionMode(session, 'actions.construct.name')
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return
    expect(response.interaction.request.farm.farmType).toBe('room')
    if (response.interaction.request.farm.farmType !== 'room') return

    const room = response.interaction.request.farm.selectableTiles[0]!
    response = session.commitSelectionChoice(0, { rooms: [room] })
    response = finishRoyalTrigger(session, response)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.extraData?.woodSpent).toBe(5)

    const stableMode = options(response).find((option) => option.labelKey === 'actions.stables.name')
    expect(stableMode).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, stableMode!.value)
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return
    expect(response.interaction.request.farm.farmType).toBe('stable')
    if (response.interaction.request.farm.farmType !== 'stable') return

    const stable = response.interaction.request.farm.selectableTiles[0]!
    response = session.commitSelectionChoice(0, { stables: [stable] })
    response = finishRoyalTrigger(session, response)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 3, reed: 0 })
    expect(response.state.players[0]!.cardStates[CARD_ID]?.extraData?.woodSpent ?? 0).toBe(0)
  })

  it('D074 S8: wood paid for fencing outside Farm Expansion receives no refund', () => {
    const session = setup({ wood: 4 })
    let response = session.takeAction(0, 'fencing')
    expect(response.interaction.stateId).toBe('wait')
    response = session.commitSelectionChoice(0, {
      edges: ONE_CELL_FENCES, palisadeEdges: [], extraWood: 0,
    })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(0)
    expect(response.state.players[0]!.fenceSegments).toHaveLength(4)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.extraData?.woodSpent ?? 0).toBe(0)
  })
})

describe('ae-negative-41-resources', () => {
  const { sessions, ok, save, setup, finish, select, play, next, major } = audit41Resources
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('D074 N1 real major and minor wood payments return one wood per two paid at actual turn end',()=>{
   for(const kind of ['major','minor']){const s=setup('D074_RoyalWood',st=>{Object.assign(st.players[0]!.resources,{wood:2,stone:kind==='major'?2:0});if(kind==='minor')st.players[0]!.minorHand=['A057_MilkingParlor']}),r=kind==='major'?major(s,'Major_Joinery'):play(s,'A057_MilkingParlor');assert.equal(r.state.players[0]!.resources.wood,1);assert.equal(r.state.players[0]!.resources.stone,0);assert.equal(r.state.players[0]!.cardStates['D074_RoyalWood']?.extraData?.woodSpent,0);save(`D074-N1-${kind}`,r)}
  })
  it('D074 N2 actual Farm Expansion stable costs two wood and returns one only after the turn ends',()=>{
   const s=setup('D074_RoyalWood',st=>{st.players[0]!.resources.wood=2});let p=ok(s.takeAction(0,'farm-expansion'));if(!(p.interaction.stateId==='wait'&&p.interaction.request.kind==='farm-select'))p=select(s,p,o=>o.labelKey==='actions.stables.name');assert.ok(p.interaction.stateId==='wait'&&p.interaction.request.kind==='farm-select'&&p.interaction.request.farm.farmType==='stable',JSON.stringify(p.interaction));const r=finish(s,ok(s.commitSelectionChoice(0,{stables:[{row:0,col:1}]})));assert.equal(r.state.players[0]!.resources.wood,1);assert.equal(r.state.players[0]!.stableTiles.length,1);save('D074-N2',{p,r})
  })
  it('D074 N3 ordinary fencing a held card and a foreign building never refund owner wood',()=>{
   for(const mode of ['fencing','hand','other']){const actor=mode==='other'?1:0,s=setup('D074_RoyalWood',st=>{st.currentPlayerIndex=actor;Object.assign(st.players[actor]!.resources,{wood:mode==='fencing'?4:2,stone:2})},mode!=='hand');let r:SessionResponse
   if(mode==='fencing'){const p=ok(s.takeAction(0,'fencing'));assert.ok(p.interaction.stateId==='wait'&&p.interaction.request.kind==='farm-select');r=finish(s,ok(s.commitSelectionChoice(0,{edges:['H-0-1','H-1-1','V-0-1','V-0-2'],extraWood:0})),true)}else{r=ok(s.takeAction(actor,'major-improvement'));if(!r.state.players[actor]!.improvements.includes('Major_Joinery'))r=select(s,r,o=>o.value==='Major_Joinery'||o.value==='major:Major_Joinery');r=finish(s,r,true,'D074_RoyalWood')}
   assert.equal(r.state.players[0]!.resources.wood,0);if(mode==='other')assert.equal(r.state.players[1]!.resources.wood,0);save(`D074-N3-${mode}`,r)}
  })
  it('D074 N4 undo restores real improvement wood payment and legal retry earns exactly one refund',()=>{
   const s=setup('D074_RoyalWood',st=>{Object.assign(st.players[0]!.resources,{wood:2,stone:2})}),r=major(s,'Major_Joinery'),u=ok(s.undoAction());assert.equal(u.state.players[0]!.resources.wood,2);assert.equal(u.state.players[0]!.resources.stone,2);assert.ok(!u.state.players[0]!.improvements.includes('Major_Joinery'));const retry=major(s,'Major_Joinery');assert.equal(retry.state.players[0]!.resources.wood,1);save('D074-N4',{r,u,retry})
  })
  it('D074 N5 one and three wood improvement costs round down independently at turn end',()=>{
   for(const amount of [1,3]){const s=setup('D074_RoyalWood',st=>{const p=st.players[0]!;Object.assign(p.resources,{wood:amount,stone:0});p.occupationPlayed=['A100_Curator','A110_Roughcaster'];p.minorHand=[amount===1?'E072_ArtichokeField':'B020_ChainFloat']}),r=play(s,amount===1?'E072_ArtichokeField':'B020_ChainFloat');assert.equal(r.state.players[0]!.resources.wood,Math.floor(amount/2));save(`D074-N5-${amount}`,r)}
  })
  it('D074 N6 room and stable wood payments in one real Farm Expansion turn are combined before rounding and undo',()=>{
   const s=setup('D074_RoyalWood',st=>Object.assign(st.players[0]!.resources,{wood:7,reed:2}));let p=ok(s.takeAction(0,'farm-expansion'));if(!(p.interaction.stateId==='wait'&&p.interaction.request.kind==='farm-select'&&p.interaction.request.farm.farmType==='room'))p=select(s,p,o=>o.labelKey==='actions.construct.name');assert.ok(p.interaction.stateId==='wait'&&p.interaction.request.kind==='farm-select'&&p.interaction.request.farm.farmType==='room',JSON.stringify(p.interaction));p=ok(s.commitSelectionChoice(0,{rooms:[{row:1,col:1}]}));if(!(p.interaction.stateId==='wait'&&p.interaction.request.kind==='farm-select'&&p.interaction.request.farm.farmType==='stable'))p=select(s,p,o=>o.labelKey==='actions.stables.name');const r=finish(s,ok(s.commitSelectionChoice(0,{stables:[{row:0,col:1}]}))),u=ok(s.undoAction());assert.equal(r.state.players[0]!.resources.wood,3);assert.equal(r.state.players[0]!.resources.reed,0);assert.equal(r.state.players[0]!.rooms,3);assert.equal(r.state.players[0]!.stableTiles.length,1);assert.equal(u.state.players[0]!.resources.wood,7);assert.equal(u.state.players[0]!.resources.reed,2);assert.equal(u.state.players[0]!.rooms,2);assert.equal(u.state.players[0]!.stableTiles.length,0);save('D074-N6',{p,r,u})
  })
  it('D074 N7 a real purchase pays one food and the next actual paid improvement earns a fresh single refund',()=>{
   const s=setup('D074_RoyalWood',st=>{Object.assign(st.players[0]!.resources,{food:1,wood:2,stone:2})},false,5),bought=play(s,'D074_RoyalWood');assert.equal(bought.state.players[0]!.resources.food,0);assert.equal(bought.state.players[0]!.resources.wood,2);next(s,bought);const other=finish(s,ok(s.takeAction(1,'reed-bank')));next(s,other);const r=major(s,'Major_Joinery');assert.equal(r.state.players[0]!.resources.wood,1);save('D074-N7',{bought,r})
  })
})
