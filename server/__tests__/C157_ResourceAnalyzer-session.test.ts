import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import type { Resource } from '../../shared/contract/types'

import '../../shared/cards/C/C157_ResourceAnalyzer'
import assert from 'node:assert/strict'
import * as audit56Phase from './_helpers/audit/ae-negative-56-phase'

const CARD_ID = 'C157_ResourceAnalyzer'
const FILLER = '__test_placeholder__'

const setup = ({
  played = true,
  owner = {},
  opponents = [],
}: {
  played?: boolean
  owner?: Partial<Resource>
  opponents?: Partial<Resource>[]
} = {}) => {
  const session = new GameSession(5157, undefined, { playerCount: 4 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 5
  state.roundPhase = 'work'
  state.players.forEach((player, index) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.resources = {
      ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0,
      vegetable: 0, sheep: 0, boar: 0, cattle: 0,
      ...(index === 0 ? owner : (opponents[index - 1] ?? {})),
    }
    setWorkersAtHome(state, player, 2)
  })
  const player = state.players[0]!
  player.occupationHand = played ? [FILLER] : [CARD_ID]
  player.occupationPlayed = played ? [CARD_ID] : []
  session.loadState(state)
  return session
}

const playOccupation = (session: GameSession) => {
  let response = session.takeAction(0, 'lessons')
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) => candidate.value === CARD_ID)
  if (option) response = session.resolveChoice(response.interaction.playerIndex, option.value)
  return response
}

const endRound = (session: GameSession) => {
  const state = session.getState().state
  state.players.forEach((player) => markAllWorkersUsed(state, player))
  session.loadState(state)
  return session.performRoundEnd()
}

const ownerFood = (response: SessionResponse) => response.state.players[0]!.resources.food

describe('C157 Resource Analyzer parity', () => {
  it('C157 S1: Resource Analyzer can be played as the first occupation for no food', () => {
    const session = setup({ played: false })
    const state = session.getState().state
    state.players[0]!.resources.food = 0
    session.loadState(state)

    const response = playOccupation(session)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(0)
  })

  it('C157 S2: strict leads in exactly two building-resource types grant one food', () => {
    const session = setup({
      owner: { wood: 2, clay: 2 },
      opponents: [{ wood: 1, clay: 1 }, { wood: 0, clay: 1 }, { wood: 1, clay: 0 }],
    })
    const foodBefore = session.state.players[0]!.resources.food

    const response = endRound(session)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.round).toBe(6)
    expect(ownerFood(response)).toBe(foodBefore + 1)
  })

  it('C157 S3: a strict lead in only one building-resource type grants no food', () => {
    const session = setup({
      owner: { wood: 2, clay: 1 },
      opponents: [{ wood: 1, clay: 1 }, { wood: 0, clay: 0 }, { wood: 1, clay: 0 }],
    })
    const foodBefore = session.state.players[0]!.resources.food

    const response = endRound(session)

    expect(ownerFood(response)).toBe(foodBefore)
  })

  it('C157 S4: tying an opponent is not being strictly ahead for that resource type', () => {
    const session = setup({
      owner: { wood: 2, clay: 2 },
      opponents: [{ wood: 1, clay: 2 }, { wood: 0, clay: 1 }, { wood: 1, clay: 0 }],
    })
    const foodBefore = session.state.players[0]!.resources.food

    const response = endRound(session)

    expect(ownerFood(response)).toBe(foodBefore)
  })

  it('C157 S5: leading all four building-resource types still grants exactly one food', () => {
    const session = setup({
      owner: { wood: 2, clay: 2, reed: 2, stone: 2 },
      opponents: [
        { wood: 1, clay: 1, reed: 1, stone: 1 },
        { wood: 0, clay: 1, reed: 0, stone: 1 },
        { wood: 1, clay: 0, reed: 1, stone: 0 },
      ],
    })
    const foodBefore = session.state.players[0]!.resources.food

    const response = endRound(session)

    expect(ownerFood(response)).toBe(foodBefore + 1)
  })

  it('C157 S6: Resource Analyzer checks and rewards again before the following round', () => {
    const session = setup({
      owner: { wood: 2, clay: 2 },
      opponents: [{ wood: 1, clay: 1 }, { wood: 0, clay: 1 }, { wood: 1, clay: 0 }],
    })
    const foodBefore = session.state.players[0]!.resources.food

    const first = endRound(session)
    expect(ownerFood(first)).toBe(foodBefore + 1)
    const second = endRound(session)

    expect(second.ok, second.error).toBe(true)
    expect(second.state.round).toBe(7)
    expect(ownerFood(second)).toBe(foodBefore + 2)
  })
})

describe('ae-negative-56-phase', () => {
  const { sessions, ok, save, make, finish, end } = audit56Phase
  afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
  it('C157 N1 actual next round preparation awards one food only for strictly leading at least two building resource types',()=>{for(const types of[0,1,2,4]){const keys=['wood','clay','reed','stone']as const,s=make('C157_ResourceAnalyzer',st=>{keys.slice(0,types).forEach(key=>st.players[0]!.resources[key]=2);st.players.slice(1).forEach(p=>keys.forEach(key=>p.resources[key]=1));},true,5),r=finish(s,end(s));assert.equal(r.state.round,6);assert.equal(r.state.players[0]!.resources.food,types>=2?101:100);assert.deepEqual(r.state.players.slice(1).map(p=>p.resources.food),[100,100,100]);save(`C157-N1-${types}`,r)}})
  it('C157 N2 a tie with even one opponent disqualifies that type while midround and hand-only card cannot award food',()=>{const s=make('C157_ResourceAnalyzer',st=>{Object.assign(st.players[0]!.resources,{wood:2,clay:2});st.players[2]!.resources.wood=2},true,5),r=finish(s,end(s));assert.equal(r.state.players[0]!.resources.food,100);const h=make('C157_ResourceAnalyzer',st=>{Object.assign(st.players[0]!.resources,{wood:2,clay:2})},false,5),hr=finish(h,end(h));assert.equal(hr.state.players[0]!.resources.food,100);const w=make('C157_ResourceAnalyzer',st=>{Object.assign(st.players[0]!.resources,{wood:2,clay:2})},true,5),wr=finish(w,ok(w.takeAction(0,'grain-seeds')));assert.equal(wr.state.players[0]!.resources.food,100);save('C157-N2',{r,hr,wr})})
})
