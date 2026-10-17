import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import '../../shared/cards/D/D152_Patron'
import '../../shared/cards/A/A123_FrameBuilder'
import assert from 'node:assert/strict'
import * as audit55Placement from './_helpers/audit/ae-negative-55-placement'

const CARD_ID = 'D152_Patron'

const OTHER_OCCUPATION = 'A123_FrameBuilder'

const FILLER = '__test_placeholder__'

const setup = ({
  played = true, actorIndex = 0, food = 0,
}: {
  played?: boolean
  actorIndex?: number
  food?: number
} = {}) => {
  const session = new GameSession(6152, undefined, { playerCount: 4 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = actorIndex
  state.round = 5
  state.roundPhase = 'work'
  state.actionSpaces.forEach((space) => {
    space.takenBy = []
  })
  state.players.forEach((player, index) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.cardStates = {}
    player.resources = {
      ...player.resources,
      wood: 0, clay: 0, reed: 0, stone: 0, food: index === actorIndex ? food : 20,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    }
  })

  const owner = state.players[0]!
  owner.occupationHand = played ? [FILLER] : [CARD_ID]
  owner.occupationPlayed = played ? [CARD_ID] : []
  if (played) state.players[actorIndex]!.occupationHand = [OTHER_OCCUPATION]

  session.loadState(state)
  return session
}

const playOccupation = (
  session: GameSession, playerIndex: number, cardId: string,
): SessionResponse => {
  let response = session.takeAction(playerIndex, 'lessons')
  expect(response.ok, response.error).toBe(true)
  if (!response.state.players[playerIndex]!.occupationHand.includes(cardId)) return response
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) => candidate.value === cardId)
  expect(option, JSON.stringify(response.interaction)).toBeDefined()
  if (!option) return response
  response = session.resolveChoice(response.interaction.playerIndex, option.value)
  expect(response.ok, response.error).toBe(true)
  return response
}

describe('D152 Patron parity', () => {
  it('D152 S1: playing Patron itself grants no food', () => {
    const response = playOccupation(setup({ played: false }), 0, CARD_ID)

    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(0)
  })

  it('D152 S2: a later affordable occupation gains two food before paying one', () => {
    const response = playOccupation(setup({ food: 1 }), 0, OTHER_OCCUPATION)

    expect(response.state.players[0]!.occupationPlayed).toContain(OTHER_OCCUPATION)
    expect(response.state.players[0]!.resources.food).toBe(2)
  })

  it('D152 S3: Patron makes a later occupation playable from zero food', () => {
    const response = playOccupation(setup(), 0, OTHER_OCCUPATION)

    expect(response.state.players[0]!.occupationPlayed).toContain(OTHER_OCCUPATION)
    expect(response.state.players[0]!.resources.food).toBe(1)
  })

  it('D152 S4: an opponent playing an occupation gains no Patron food', () => {
    const response = playOccupation(setup({ actorIndex: 1 }), 1, OTHER_OCCUPATION)

    expect(response.state.players[1]!.occupationPlayed).toContain(OTHER_OCCUPATION)
    expect(response.state.players[1]!.resources.food).toBe(0)
    expect(response.state.players[0]!.resources.food).toBe(20)
  })
})

describe('ae-negative-55-placement', () => {
  const { sessions, ok, save, make, finish, play, choose } = audit55Placement
  afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
  it('D152 N1 actual Patron purchase has no self bonus and later occupation receives two food before paying its one-food fee',()=>{const fresh=make('D152_Patron',st=>{st.players[0]!.resources.food=0;},false,14),purchased=finish(fresh,play(fresh,'D152_Patron'));assert.equal(purchased.state.players[0]!.resources.food,0);const s=make('D152_Patron',st=>{st.players[0]!.resources.food=0;st.players[0]!.occupationHand=['A125_Priest','A133_Braggart'];},true,14),p=ok(s.takeAction(0,'lessons')),r=finish(s,choose(s,p,o=>o.value==='A125_Priest'));assert.equal(r.state.players[0]!.resources.food,1);assert.equal(r.state.players[0]!.occupationPlayed.length,2);assert.ok(r.state.players[0]!.occupationPlayed.includes('A125_Priest'));save('D152-N1',{purchased,p,r})})
  it('D152 N2 opponent occupation unrelated owner placement and card only in hand cannot award Patron food',()=>{for(const mode of['opponent','unrelated','hand']){const actor=mode==='opponent'?1:0,s=make('D152_Patron',st=>{st.currentPlayerIndex=actor;st.players[actor]!.occupationHand=mode==='hand'?['D152_Patron','A125_Priest','A133_Braggart']:['A125_Priest','A133_Braggart'];},mode!=='hand',14);if(mode==='hand')assert.ok(s.getState().state.players[0]!.occupationHand.includes('D152_Patron'));let p=ok(s.takeAction(actor,mode==='unrelated'?'grain-seeds':'lessons'));if(mode!=='unrelated')p=choose(s,p,o=>o.value==='A125_Priest');const r=finish(s,p,true);assert.equal(r.state.players[0]!.resources.food,100);save(`D152-N2-${mode}`,r)}})
})
