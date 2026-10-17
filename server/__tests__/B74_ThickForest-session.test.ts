import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/B/B074_ThickForest'
import assert from 'node:assert/strict'
import type { GameState } from '../../shared/contract/types'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit22Future from './_helpers/audit/ae-negative-22-future'

const CARD_ID = 'B074_ThickForest'
const FILLER = '__test_placeholder__'

const setup = ({ clay = 5, round = 5 } = {}) => {
  const session = new GameSession(5074, undefined, { playerCount: 2 })
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
    wood: 0, clay, reed: 0, stone: 0, food: 20, grain: 0, vegetable: 0,
  }
  session.loadState(state)
  return session
}

const enterMinor = (session: GameSession) => {
  let response = session.takeAction(0, 'meeting-place')
  if (response.interaction.stateId !== 'wait') return response
  const improvement = response.interaction.request.options?.find((candidate) =>
    candidate.value.startsWith('action-improvement-'))
  if (improvement) response = session.resolveChoice(0, improvement.value)
  return response
}

const playMinor = (session: GameSession) => {
  let response = enterMinor(session)
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) => candidate.value === CARD_ID)
  if (option) response = session.resolveChoice(response.interaction.playerIndex, option.value)
  return response
}

const offered = (response: SessionResponse) => response.interaction.stateId === 'wait'
  && (response.interaction.request.options?.some((candidate) => candidate.value === CARD_ID) ?? false)

const futureRounds = (response: SessionResponse) => response.state.futureMeeples
  .filter((entry) => entry.cardId === CARD_ID && (entry.resources.wood ?? 0) > 0)
  .flatMap((entry) => Array.from({ length: entry.resources.wood ?? 0 }, () => entry.round))
  .sort((left, right) => left - right)

describe('B074 Thick Forest parity', () => {
  it('B074 S1: five clay allows Thick Forest without spending clay and schedules all remaining even rounds', () => {
    const response = playMinor(setup())

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.clay).toBe(5)
    expect(futureRounds(response)).toEqual([6, 8, 10, 12, 14])
  })

  it('B074 S2: four clay keeps Thick Forest unavailable and preserves the hand and clay', () => {
    const response = enterMinor(setup({ clay: 4 }))

    expect(offered(response)).toBe(false)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.clay).toBe(4)
    expect(futureRounds(response)).toEqual([])
  })

  it('B074 S3: in round thirteen Thick Forest schedules wood only for round fourteen', () => {
    const response = playMinor(setup({ round: 13 }))

    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(futureRounds(response)).toEqual([14])
  })

  it('B074 S4: scheduled wood is received at the start of its even round', () => {
    const session = setup()
    const played = playMinor(session)
    expect(played.state.players[0]!.resources.wood).toBe(0)
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
    expect(response.state.players[0]!.resources.wood).toBe(1)
    expect(futureRounds(response)).toEqual([8, 10, 12, 14])
  })
})

describe('ae-negative-22-future', () => {
  const { FOREST, sessions, save, ok, setup, finish, menu, buy, schedule, reach } = audit22Future
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('B074 N1 actual five clay prerequisite is retained and queues exactly remaining even rounds with no immediate wood',()=>{for(const round of[1,2,12,13,14]){const s=setup(FOREST,round,state=>state.players[0]!.resources.clay=5),{pending,r}=buy(s,FOREST);assert.equal(r.state.players[0]!.resources.clay,5);assert.equal(r.state.players[0]!.resources.wood,0);assert.deepEqual(schedule(r,FOREST),[2,4,6,8,10,12,14].filter(n=>n>round).map(round=>({round,resources:{wood:1}})));save(`B074-N1-${round}`,{pending,r})}})
  it('B074 N2 four clay refuses before free legal alternative and whole purchase undo removes only this promise',()=>{const p=setup(FOREST,5,state=>state.players[0]!.resources.clay=4),denied=menu(p);assertRejectedUnchanged(p,()=>p.resolveChoice(0,FOREST));const legal=finish(p,ok(p.resolveChoice(0,'B004_WoodPile')));assert.deepEqual(schedule(legal,FOREST),[]);const s=setup(FOREST,5,state=>state.players[0]!.resources.clay=5),r=buy(s,FOREST).r,undone=ok(s.undoAction());assert.equal(undone.state.players[0]!.resources.clay,5);assert.deepEqual(schedule(undone,FOREST),[]);assert.ok(undone.state.players[0]!.minorHand.includes(FOREST));const retry=buy(s,FOREST).r;assert.equal(schedule(retry,FOREST).length,5);save('B074-N2',{denied,legal,r,undone,retry})})
  it('B074 N3 natural six seven eight deliver owner wood only in even rounds with matched filler controls',()=>{const configure=(state:GameState)=>state.players[0]!.resources.clay=5,s=setup(FOREST,5,configure),c=setup(FOREST,5,configure);buy(s,FOREST);buy(c,'B004_WoodPile');const six=reach(s,6),csix=reach(c,6),seven=reach(s,7),cseven=reach(c,7),eight=reach(s,8),ceight=reach(c,8);assert.equal(six.state.players[0]!.resources.wood,csix.state.players[0]!.resources.wood+1);assert.equal(seven.state.players[0]!.resources.wood,cseven.state.players[0]!.resources.wood+1);assert.equal(eight.state.players[0]!.resources.wood,ceight.state.players[0]!.resources.wood+2);assert.equal(eight.state.players[1]!.resources.wood,ceight.state.players[1]!.resources.wood);save('B074-N3',{six,csix,seven,cseven,eight,ceight})})
})
