import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import '../../shared/cards/D/D077_RecycledBrick'
import assert from 'node:assert/strict'
import * as audit42Purchase from './_helpers/audit/ae-negative-42-purchase'

const CARD_ID = 'D077_RecycledBrick'

const FILLER = '__test_placeholder__'

const OCCUPATIONS = ['A100_Curator', 'A125_Priest', 'B121_Geologist']

const setup = ({
  played = true, occupations = 3, actor = 0, houseType = 'clay',
}: {
  played?: boolean
  occupations?: number
  actor?: 0 | 1
  houseType?: 'wood' | 'clay'
} = {}) => {
  const session = new GameSession(6077, undefined, { playerCount: 2 })
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = actor
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
  owner.occupationPlayed = OCCUPATIONS.slice(0, occupations)
  if (!played) owner.resources.food = 1

  const renovatingPlayer = state.players[actor]!
  renovatingPlayer.houseType = houseType
  if (houseType === 'clay') {
    renovatingPlayer.resources.stone = 2
    renovatingPlayer.resources.reed = 1
  } else {
    renovatingPlayer.resources.clay = 2
    renovatingPlayer.resources.reed = 1
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

const renovate = (session: GameSession, actor: 0 | 1, target: 'clay' | 'stone') => {
  let response = session.takeAction(actor, 'house-redevelopment')
  if (response.interaction.stateId === 'wait'
    && response.interaction.promptKey === 'ui.interactionChooseRenovationTarget') {
    response = session.resolveChoice(response.interaction.playerIndex, target)
  }
  return response
}

describe('D077 Recycled Brick parity', () => {
  it('D077 S1: three occupations and one food allow Recycled Brick to be played', () => {
    const response = playMinor(setup({ played: false }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(0)
  })

  it('D077 S2: fewer than three occupations keep Recycled Brick unavailable', () => {
    const session = setup({ played: false, occupations: 2 })
    const before = session.getState()

    const response = playMinor(session)

    expect(response.state.players[0]!.minorPlayed).not.toContain(CARD_ID)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(before.state.players[0]!.resources.food)
  })

  it('D077 S3: the owner gains two clay after renovating a two-room clay house to stone', () => {
    const response = renovate(setup(), 0, 'stone')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]).toMatchObject({
      houseType: 'stone', rooms: 2, resources: { clay: 2 },
    })
  })

  it('D077 S4: the owner gains two clay after an opponent renovates a two-room clay house to stone', () => {
    const response = renovate(setup({ actor: 1 }), 1, 'stone')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[1]).toMatchObject({
      houseType: 'stone', rooms: 2, resources: { clay: 0 },
    })
    expect(response.state.players[0]!.resources.clay).toBe(2)
  })

  it('D077 S5: renovating a wooden house to clay grants no recycled clay', () => {
    const response = renovate(setup({ houseType: 'wood' }), 0, 'clay')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]).toMatchObject({
      houseType: 'clay', rooms: 2, resources: { clay: 0 },
    })
  })
})

describe('ae-negative-42-purchase', () => {
  const { sessions, ok, save, setup, play, occupations, renovate } = audit42Purchase
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('D077 N1 real self or opponent two room clay to stone renovation gives owner two clay after ordinary stone reed payment',()=>{for(const actor of [0,1]){const s=setup('D077_RecycledBrick',st=>{st.currentPlayerIndex=actor;st.players[actor]!.houseType='clay';Object.assign(st.players[actor]!.resources,{stone:2,reed:1})}),r=renovate(s,actor);assert.equal(r.state.players[actor]!.houseType,'stone');assert.equal(r.state.players[actor]!.resources.stone,0);assert.equal(r.state.players[actor]!.resources.reed,0);save(`D077-N1-early-${actor}`,r);assert.equal(r.state.players[0]!.resources.clay,2);assert.deepEqual(r.state.players[actor]!.improvements,[]);const u=ok(s.undoAction());assert.equal(u.state.players[actor]!.houseType,'clay');assert.equal(u.state.players[0]!.resources.clay,0);save(`D077-N1-${actor}`,{r,u})}})
  it('D077 N2 wood to clay renovation and held card cannot grant owner clay',()=>{for(const mode of ['wood','hand']){const s=setup('D077_RecycledBrick',st=>{st.players[0]!.houseType=mode==='wood'?'wood':'clay';Object.assign(st.players[0]!.resources,{clay:mode==='wood'?2:0,stone:mode==='hand'?2:0,reed:1})},mode!=='hand'),r=renovate(s);assert.equal(r.state.players[0]!.resources.clay,0);assert.equal(r.state.players[0]!.houseType,mode==='wood'?'clay':'stone');save(`D077-N2-${mode}`,r)}})
  it('D077 N3 actual three occupation card purchase pays one food without an immediate clay bonus',()=>{const s=setup('D077_RecycledBrick',st=>occupations(st),false,5),r=play(s,'D077_RecycledBrick');assert.equal(r.state.players[0]!.resources.food,99);assert.equal(r.state.players[0]!.resources.clay,0);save('D077-N3',r)})
})
