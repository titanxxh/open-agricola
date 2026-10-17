import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import '../../shared/cards/D/D081_RoofLadder'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit43Renovation from './_helpers/audit/ae-negative-43-renovation'

const CARD_ID = 'D081_RoofLadder'

const FILLER = '__test_placeholder__'

const setup = ({
  played = true, houseType = 'wood', resources = {},
}: {
  played?: boolean
  houseType?: 'wood' | 'clay'
  resources?: Partial<{ wood: number; clay: number; reed: number; stone: number }>
} = {}) => {
  const session = new GameSession(6081, undefined, { playerCount: 2 })
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = 14
  state.roundPhase = 'work'
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.improvements = []
    player.resources = {
      ...player.resources,
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0,
      sheep: 0, boar: 0, cattle: 0,
    }
  })
  const owner = state.players[0]!
  owner.minorHand = played ? [FILLER] : [CARD_ID]
  owner.minorPlayed = played ? [CARD_ID] : []
  owner.houseType = houseType
  owner.resources = {
    ...owner.resources,
    wood: played ? 0 : 1,
    ...resources,
  }
  session.loadState(state)
  return session
}

const playMinor = (session: GameSession) => {
  let response = session.takeAction(0, 'meeting-place')
  if (response.interaction.stateId !== 'wait') return response
  const improvement = response.interaction.request.options?.find((option) =>
    option.value.startsWith('action-improvement-'))
  if (improvement) response = session.resolveChoice(response.interaction.playerIndex, improvement.value)
  if (response.interaction.stateId !== 'wait') return response
  const card = response.interaction.request.options?.find((option) =>
    option.value === CARD_ID || option.value === `minor:${CARD_ID}`)
  if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
  return response
}

const renovate = (session: GameSession, target: 'clay' | 'stone') => {
  let response = session.takeAction(0, 'house-redevelopment')
  if (response.interaction.stateId === 'wait'
    && response.interaction.promptKey === 'ui.interactionChooseRenovationTarget') {
    response = session.resolveChoice(response.interaction.playerIndex, target)
  }
  return response
}

describe('D081 Roof Ladder parity', () => {
  it('D081 S1: paying one wood plays Roof Ladder', () => {
    const response = playMinor(setup({ played: false }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.wood).toBe(0)
  })

  it('D081 S2: wood-to-clay renovation costs no reed and gains one stone afterward', () => {
    const response = renovate(setup({ resources: { clay: 2 } }), 'clay')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]).toMatchObject({
      houseType: 'clay', resources: { clay: 0, reed: 0, stone: 1 },
    })
  })

  it('D081 S3: clay-to-stone renovation costs no reed and gains one stone afterward', () => {
    const response = renovate(setup({
      houseType: 'clay', resources: { stone: 2 },
    }), 'stone')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]).toMatchObject({
      houseType: 'stone', resources: { reed: 0, stone: 1 },
    })
  })

  it('D081 S4: the stone gained after renovation cannot pay that renovation', () => {
    const session = setup({ houseType: 'clay', resources: { stone: 1 } })
    const before = session.getState()

    const response = session.takeAction(0, 'house-redevelopment')

    expect(response.ok).toBe(false)
    expect(response.state).toEqual(before.state)
    expect(response.state.players[0]).toMatchObject({
      houseType: 'clay', resources: { reed: 0, stone: 1 },
    })
  })

  it('D081 S5: a non-renovation action grants no stone', () => {
    const response = setup().takeAction(0, 'day-laborer')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.stone).toBe(0)
  })
})

describe('ae-negative-43-renovation', () => {
  const { ROOF, sessions, save, ok, make, finish, purchase, buildings } = audit43Renovation
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('D081 N1 actual wood purchase and two renovation directions waive reed and grant one stone only afterward',()=>{const s=make(ROOF,false,state=>state.players[0]!.resources.wood=1),a=purchase(s,ROOF);assert.equal(a.r.state.players[0]!.resources.wood,0);const outcomes=[];for(const house of['wood','clay'] as const){const t=make(ROOF,true,state=>{const p=state.players[0]!;p.houseType=house;p.resources[house==='wood'?'clay':'stone']=2}),r=finish(t,ok(t.takeAction(0,'house-redevelopment')));assert.equal(r.state.players[0]!.houseType,house==='wood'?'clay':'stone');assert.deepEqual(buildings(r),{food:0,wood:0,clay:0,reed:0,stone:1});outcomes.push(r)}save('D081-N1',{a,outcomes})})
  it('D081 N2 future stone cannot fund current renovation and unrelated action grants no stone',()=>{const s=make(ROOF,true,state=>{state.players[0]!.houseType='clay';state.players[0]!.resources.stone=1}),bad=assertRejectedUnchanged(s,()=>s.takeAction(0,'house-redevelopment')),legal=ok(s.takeAction(0,'grain-seeds'));assert.equal(legal.state.players[0]!.resources.stone,1);const t=make(ROOF),other=ok(t.takeAction(0,'day-laborer'));assert.equal(other.state.players[0]!.resources.stone,0);save('D081-N2',{bad,legal,other})})
})
