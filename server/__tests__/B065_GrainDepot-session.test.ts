import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import type { Resource } from '../../shared/contract/types'

import '../../shared/cards/B/B065_GrainDepot'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit21FutureGrain from './_helpers/audit/ae-negative-21-future-grain'

const CARD_ID = 'B065_GrainDepot'
const FILLER = '__test_placeholder__'

const setup = (resource: keyof Resource | null, { amount = 2, round = 5 } = {}) => {
  const session = new GameSession(5065, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = round
  state.roundPhase = 'work'
  state.players.forEach((player) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.resources.food = 20
    setWorkersAtHome(state, player, 2)
  })
  const player = state.players[0]!
  player.minorHand = [CARD_ID]
  player.resources = {
    ...player.resources,
    wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0, vegetable: 0,
    ...(resource ? { [resource]: amount } : {}),
  }
  state.availableMajorImprovements = []
  session.loadState(state)
  return session
}

const enterMinor = (session: GameSession) => {
  let response = session.takeAction(0, 'major-improvement')
  if (response.interaction.stateId !== 'wait') return response
  const improvement = response.interaction.request.options?.find((candidate) =>
    candidate.value.startsWith('action-improvement-'))
  if (improvement) response = session.resolveChoice(0, improvement.value)
  return response
}

const playMinor = (session: GameSession) => {
  let response = enterMinor(session)
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  if (response.interaction.stateId === 'wait') {
    const card = response.interaction.request.options?.find((candidate) => candidate.value === CARD_ID)
    if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
  }
  if (response.interaction.stateId === 'wait' && response.interaction.promptKey === 'prompt.selectPayment') {
    const payment = response.interaction.request.options?.find((candidate) => candidate.value.startsWith(`pay:improvement:minor:${CARD_ID}:`))
    expect(payment).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, payment!.value)
  }
  return response
}

const futureRounds = (response: SessionResponse) => response.state.futureMeeples
  .filter((entry) => entry.cardId === CARD_ID && (entry.resources.grain ?? 0) > 0)
  .flatMap((entry) => Array.from({ length: entry.resources.grain ?? 0 }, () => entry.round))
  .sort((left, right) => left - right)

describe('B065 Grain Depot parity', () => {
  for (const [scenario, resource, rounds] of [
    ['S1', 'wood', [6, 7]],
    ['S2', 'clay', [6, 7, 8]],
    ['S3', 'stone', [6, 7, 8, 9]],
  ] as const) {
    it(`B065 ${scenario}: paying two ${resource} schedules grain for ${rounds.length} rounds`, () => {
      const response = playMinor(setup(resource))

      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
      expect(response.state.players[0]!.resources[resource]).toBe(0)
      expect(futureRounds(response)).toEqual(rounds)
    })
  }

  it('B065 S4: without two of any building resource Grain Depot remains unavailable', () => {
    const response = enterMinor(setup(null, { amount: 0 }))

    expect(response.interaction.stateId === 'wait'
      ? (response.interaction.request.options?.some((candidate) => candidate.value === CARD_ID) ?? false)
      : false).toBe(false)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(futureRounds(response)).toEqual([])
  })

  it('B065 S5: a round-thirteen wood payment schedules only reachable round fourteen grain', () => {
    const response = playMinor(setup('wood', { round: 13 }))

    expect(response.state.players[0]!.resources.wood).toBe(0)
    expect(futureRounds(response)).toEqual([14])
  })

  it('B065 S6: scheduled grain is received at the start of the next round', () => {
    const session = setup('wood')
    playMinor(session)
    const state = session.getState().state
    state.players.forEach((player) => {
      markAllWorkersUsed(state, player)
      player.resources.food = 20
      player.minorHand = [FILLER]
      player.occupationHand = [FILLER]
    })
    session.loadState(state)

    const response = session.performRoundEnd()

    expect(response.state.round).toBe(6)
    expect(response.state.players[0]!.resources.grain).toBe(1)
    expect(futureRounds(response)).toEqual([7])
  })
})

describe('ae-negative-21-future-grain', () => {
  const { DEPOT, sessions, save, ok, setup, finish, menu, buy, schedule, reach } = audit21FutureGrain
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('B065 N1 real two wood clay or stone payment schedules the corresponding next two three or four grain',()=>{for(const[type,count]of[['wood',2],['clay',3],['stone',4]]as const){const s=setup(DEPOT,5,state=>state.players[0]!.resources[type]=2),{pending,r}=buy(s,DEPOT);assert.equal(r.state.players[0]!.resources[type],0);assert.equal(r.state.players[0]!.resources.grain,0);assert.deepEqual(schedule(r,DEPOT),Array.from({length:count},(_,n)=>({round:6+n,resources:{grain:1}})));save(`B065-N1-${type}`,{pending,r})}})
  it('B065 N2 late paid path truncates exact future targets and missing every alternative refuses before legal fallback',()=>{for(const round of[12,13,14]){const s=setup(DEPOT,round,state=>state.players[0]!.resources.stone=2),r=buy(s,DEPOT).r;assert.deepEqual(schedule(r,DEPOT),[1,2,3,4].map(n=>({round:round+n,resources:{grain:1}})).filter(x=>x.round<=14));save(`B065-N2-${round}`,r)}const s=setup(DEPOT,5,state=>Object.assign(state.players[0]!.resources,{wood:1,clay:1,stone:1})),pending=menu(s);assertRejectedUnchanged(s,()=>s.resolveChoice(0,DEPOT));const legal=finish(s,ok(s.resolveChoice(0,'B004_WoodPile')));assert.equal(schedule(legal,DEPOT).length,0);save('B065-N2',{pending,legal})})
  it('B065 N3 natural next rounds deliver only the chosen payment grain and no early owner or opponent goods',()=>{const s=setup(DEPOT,5,state=>state.players[0]!.resources.wood=2),control=setup(DEPOT,5);buy(s,DEPOT);buy(control,'B004_WoodPile');const six=reach(s,6),csix=reach(control,6),seven=reach(s,7),cseven=reach(control,7),eight=reach(s,8),ceight=reach(control,8);assert.equal(six.state.players[0]!.resources.grain,csix.state.players[0]!.resources.grain+1);assert.equal(seven.state.players[0]!.resources.grain,cseven.state.players[0]!.resources.grain+2);assert.equal(eight.state.players[0]!.resources.grain,ceight.state.players[0]!.resources.grain+2);assert.equal(eight.state.players[1]!.resources.grain,ceight.state.players[1]!.resources.grain);assert.equal(schedule(eight,DEPOT).length,0);save('B065-N3',{six,csix,seven,cseven,eight,ceight})})
  it('B065 N4 whole actual purchase undo restores selected cost card and empty queue before one legal replay',()=>{const s=setup(DEPOT,5,state=>state.players[0]!.resources.clay=2),r=buy(s,DEPOT).r,undone=ok(s.undoAction());assert.equal(undone.state.players[0]!.resources.clay,2);assert.ok(undone.state.players[0]!.minorHand.includes(DEPOT));assert.equal(schedule(undone,DEPOT).length,0);const retry=buy(s,DEPOT).r;assert.equal(retry.state.players[0]!.resources.clay,0);assert.equal(schedule(retry,DEPOT).length,3);save('B065-N4',{r,undone,retry})})
})
