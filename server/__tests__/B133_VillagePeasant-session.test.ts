import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setActiveWorkerCount, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/B/B133_VillagePeasant'
import '../../shared/cards/D/D060_LargePottery'
import assert from 'node:assert/strict'
import * as audit28Endgame from './_helpers/audit/ae-negative-28-endgame'

const CARD_ID = 'B133_VillagePeasant'
const FILLER = '__test_placeholder__'

const setup = ({ played = true } = {}) => {
  const session = new GameSession(6133, undefined, { playerCount: 3 })
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = 14
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player) => {
    setActiveWorkerCount(player, 0)
    setWorkersAtHome(state, player, 0)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.improvements = []
    player.resources = {
      ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0,
      vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    }
    markAllWorkersUsed(state, player)
  })
  const owner = state.players[0]!
  owner.occupationHand = played ? [FILLER] : [CARD_ID]
  owner.occupationPlayed = played ? [CARD_ID] : []
  if (!played) {
    setActiveWorkerCount(owner, 2)
    setWorkersAtHome(state, owner, 2)
  }
  session.loadState(state)
  return session
}

const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? []
  : []

const playOccupation = (session: GameSession) => {
  const response = session.takeAction(0, 'lessons')
  if (!response.state.players[0]!.occupationHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const card = options(response).find((option) => option.value === CARD_ID)
  expect(card).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, card!.value)
}

const finishGame = (session: GameSession) => {
  const state = session.getState().state
  state.players.forEach((player) => {
    setActiveWorkerCount(player, 0)
    setWorkersAtHome(state, player, 0)
    markAllWorkersUsed(state, player)
    player.resources.food = 20
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
  })
  session.loadState(state)
  return session.performRoundEnd()
}

describe('B133 Village Peasant parity', () => {
  it('B133 S1: Village Peasant is played as the first occupation in a three-player game', () => {
    const response = playOccupation(setup({ played: false }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players).toHaveLength(3)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
  })

  it('B133 S2: two majors, two minors, and three occupations grant two vegetables at scoring', () => {
    const session = setup()
    const owner = session.getState().state.players[0]!
    owner.improvements = ['Major_Joinery', 'Major_Pottery']
    owner.minorPlayed = ['A001_Shelter', 'A037_Bucksaw']
    owner.occupationPlayed = [CARD_ID, 'A100_Curator', 'A125_Priest']

    const response = finishGame(session)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.gameOver).toBe(true)
    expect(response.state.players[0]!.resources.vegetable).toBe(2)
  })

  it('B133 S3: a zero card category grants no vegetable at scoring', () => {
    const session = setup()
    const owner = session.getState().state.players[0]!
    owner.improvements = ['Major_Joinery']
    owner.minorPlayed = []
    owner.occupationPlayed = [CARD_ID, 'A125_Priest']

    const response = finishGame(session)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.gameOver).toBe(true)
    expect(response.state.players[0]!.resources.vegetable).toBe(0)
  })

  it('B133 S4: one dual-type improvement cannot fill both categories at scoring', () => {
    const session = setup()
    const owner = session.getState().state.players[0]!
    owner.improvements = []
    owner.minorPlayed = ['D060_LargePottery']
    owner.occupationPlayed = [CARD_ID]

    const response = finishGame(session)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.gameOver).toBe(true)
    expect(response.state.players[0]!.resources.vegetable).toBe(0)
  })
  it.each([
    [['D060_LargePottery', 'D059_EarthOven'], [], 1],
    [['D060_LargePottery', 'A037_Bucksaw'], [], 1],
    [['D060_LargePottery'], ['Major_Well'], 1],
    [['D060_LargePottery', 'D059_EarthOven', 'A037_Bucksaw'], ['Major_Well'], 2],
  ] as const)('assigns dual types once to maximize complete groups (%j, %j)', (minors, majors, expected) => {
    const session = setup()
    const owner = session.state.players[0]!
    owner.minorPlayed = [...minors]
    owner.improvements = [...majors]
    owner.occupationPlayed = [CARD_ID, 'A100_Curator']
    const response = finishGame(session)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.gameOver).toBe(true)
    expect(response.state.players[0]!.resources.vegetable).toBe(expected)
  })

})

describe('ae-negative-28-endgame', () => {
  const { CARD, sessions, save, ok, MAJORS, MINORS, OCCS, DUALS, make, end } = audit28Endgame
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('B133 N1 actual six final round placements and final harvest grant the smallest own card category count including Village Peasant',()=>{for(const[major,minor,occ]of[[1,2,3],[2,1,3],[2,3,1],[2,2,3]]){const s=make(MAJORS.slice(0,major),MINORS.slice(0,minor),[CARD,...OCCS.slice(0,occ!-1)]),a=end(s);assert.equal(a.before.state.players[0]!.resources.vegetable,0);assert.equal(a.r.state.players[0]!.resources.vegetable,Math.min(major!,minor!,occ!));assert.equal(a.r.state.players[1]!.resources.vegetable,0);save(`B133-N1-${major}-${minor}-${occ}`,a)}})
  it('B133 N2 a zero own major minor or occupation category and the card in hand never grant scoring vegetables',()=>{for(const mode of['major','minor','occupation','hand']){const s=make(mode==='major'?[]:MAJORS.slice(0,1),mode==='minor'?[]:MINORS.slice(0,1),mode==='occupation'?[]:[CARD],mode!=='hand'),a=end(s);assert.equal(a.r.state.players[0]!.resources.vegetable,0);save(`B133-N2-${mode}`,a)}})
  it('B133 N3 real scoring allocates each dual minor major card only once to maximize the smallest distinct category',()=>{for(const[majors,minors,n]of[[[],[DUALS[0]!],0],[[],[DUALS[0]!,MINORS[0]!],1],[[],DUALS,1],[MAJORS.slice(0,1),DUALS,2]]as const){const s=make([...majors],[...minors],[CARD,...OCCS]),a=end(s);assert.equal(a.r.state.players[0]!.resources.vegetable,n);save(`B133-N3-${majors.length}-${minors.length}`,a)}})
  it('B133 N4 opponents played cards and owners hand cards do not fill missing own scoring categories',()=>{const s=make([],[],[CARD]);const a=end(s);assert.equal(a.r.state.players[0]!.resources.vegetable,0);assert.ok(a.r.state.players[0]!.minorHand.includes('A006_StorageBarn'));save('B133-N4',a)})
  it('B133 N5 repeated final score and state reads after actual final harvest never grant the scoring vegetables twice',()=>{const s=make(MAJORS.slice(0,2),MINORS.slice(0,2),[CARD,...OCCS]),a=end(s);assert.equal(a.r.state.players[0]!.resources.vegetable,2);for(let n=0;n<3;n++){const read=ok(s.getState());assert.equal(read.state.players[0]!.resources.vegetable,2);assert.deepEqual(read.scores,a.r.scores)}save('B133-N5',a)})
})
