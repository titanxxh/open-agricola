import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import '../../shared/cards/A/A100_Curator'
import '../../shared/cards/A/A125_Priest'
import '../../shared/cards/B/B077_LoamPit'
import '../../shared/cards/B/B099_Tutor'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit22Purchase from './_helpers/audit/ae-negative-22-purchase'

const CARD_ID = 'B077_LoamPit'

const OCCUPATIONS = ['B099_Tutor', 'A100_Curator', 'A125_Priest']

const FILLER = '__test_placeholder__'

const setup = ({
  played = true, occupations = 3, actor = 0,
}: { played?: boolean; occupations?: number; actor?: number } = {}) => {
  const session = new GameSession(6077, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = actor
  state.round = 14
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.resources = {
      ...player.resources,
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0,
      sheep: 0, boar: 0, cattle: 0, begging: 0,
    }
  })
  const owner = state.players[0]!
  owner.minorHand = played ? [FILLER] : [CARD_ID]
  owner.minorPlayed = played ? [CARD_ID] : []
  owner.occupationPlayed = OCCUPATIONS.slice(0, occupations)
  owner.resources.food = played ? 0 : 1
  session.loadState(state)
  return session
}

const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? []
  : []

const enterMinor = (session: GameSession) => {
  let response = session.takeAction(0, 'meeting-place')
  if (response.interaction.stateId !== 'wait') return response
  const improvement = options(response).find((option) =>
    option.value.startsWith('action-improvement-'))
  if (improvement) response = session.resolveChoice(response.interaction.playerIndex, improvement.value)
  return response
}

const playMinor = (session: GameSession) => {
  let response = enterMinor(session)
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  if (response.interaction.stateId === 'wait') {
    const card = options(response).find((option) => option.value === CARD_ID)
    if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
  }
  return response
}

describe('B077 Loam Pit parity', () => {
  it('B077 S1: three occupations and one food play Loam Pit', () => {
    const response = playMinor(setup({ played: false }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(0)
  })

  it('B077 S2: two occupations keep Loam Pit unavailable without payment', () => {
    const response = enterMinor(setup({ played: false, occupations: 2 }))

    expect(options(response).some((option) => option.value === CARD_ID)).toBe(false)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(1)
  })

  it('B077 S3: the owner using Day Laborer gains two food and three clay', () => {
    const response = setup().takeAction(0, 'day-laborer')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 2, clay: 3 })
  })

  it('B077 S4: another action grants no Loam Pit clay', () => {
    const response = setup().takeAction(0, 'grain-seeds')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 1, clay: 0 })
  })

  it('B077 S5: an opponent using Day Laborer grants the owner no clay', () => {
    const response = setup({ actor: 1 }).takeAction(1, 'day-laborer')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.clay).toBe(0)
    expect(response.state.players[1]!.resources).toMatchObject({ food: 2, clay: 0 })
  })
})

describe('ae-negative-22-purchase', () => {
  const { LOAM, sessions, save, ok, setup, finish, menu, buy, OCCS, prepare, points, use } = audit22Purchase
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('B077 N1 actual one food and three occupation purchase pays once gives one point and no immediate clay with whole undo',()=>{const s=prepare(LOAM,5,3),{pending,r}=buy(s,LOAM);assert.equal(r.state.players[0]!.resources.food,99);assert.equal(r.state.players[0]!.resources.clay,1);assert.equal(points(r,LOAM),1);const undone=ok(s.undoAction());assert.equal(undone.state.players[0]!.resources.food,100);assert.ok(undone.state.players[0]!.minorHand.includes(LOAM));const retry=buy(s,LOAM).r;assert.equal(retry.state.players[0]!.resources.food,99);save('B077-N1',{pending,r,undone,retry})})
  it('B077 N2 actual owner Day Laborer gives exactly three extra clay once and undo permits one replay',()=>{const s=prepare(LOAM,5,3),c=prepare(LOAM,5,3);buy(s,LOAM);buy(c,'B004_WoodPile');use(s,1,'grain-seeds');use(c,1,'grain-seeds');const a=use(s,0,'day-laborer'),b=use(c,0,'day-laborer');assert.equal(a.r.state.players[0]!.resources.clay,b.r.state.players[0]!.resources.clay+3);assert.equal(a.r.state.players[0]!.resources.food,a.before.state.players[0]!.resources.food+2);const undone=ok(s.undoAction());assert.equal(undone.state.players[0]!.resources.clay,a.before.state.players[0]!.resources.clay);const retry=use(s,0,'day-laborer');assert.equal(retry.r.state.players[0]!.resources.clay,a.r.state.players[0]!.resources.clay);save('B077-N2',{a,b,undone,retry})})
  it('B077 N3 hand card opponent Day Laborer and unrelated action do not award owner clay',()=>{for(const mode of['hand','opponent','unrelated']){const s=prepare(LOAM,5,3);if(mode!=='hand')buy(s,LOAM);else buy(s,'B004_WoodPile');const actor=mode==='opponent'?1:0;if(actor===0)use(s,1,'grain-seeds');const a=use(s,actor,mode==='unrelated'?'fishing':'day-laborer');assert.equal(a.r.state.players[0]!.resources.clay,a.before.state.players[0]!.resources.clay);save(`B077-N3-${mode}`,{a})}})
  it('B077 N4 two occupations or no food refuses purchase and creates no clay bonus',()=>{for(const mode of['occupation','food']){const s=setup(LOAM,5,state=>{state.players[0]!.occupationPlayed=OCCS.slice(0,mode==='occupation'?2:3);state.players[0]!.resources.food=mode==='food'?0:100}),pending=menu(s);assertRejectedUnchanged(s,()=>s.resolveChoice(0,LOAM));const legal=finish(s,ok(s.resolveChoice(0,'B004_WoodPile')));assert.ok(!legal.state.players[0]!.minorPlayed.includes(LOAM));save(`B077-N4-${mode}`,{pending,legal})}})
})
