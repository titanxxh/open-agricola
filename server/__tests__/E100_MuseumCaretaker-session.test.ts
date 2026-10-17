import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import '../../shared/cards/E/E100_MuseumCaretaker'
import assert from 'node:assert/strict'
import * as audit46Preparation from './_helpers/audit/ae-negative-46-preparation'

const CARD_ID = 'E100_MuseumCaretaker'

const FILLER = '__test_placeholder__'

const REQUIRED_RESOURCES = ['wood', 'clay', 'reed', 'stone', 'grain', 'vegetable'] as const

type RequiredResource = typeof REQUIRED_RESOURCES[number]

const setup = ({
  played = true, missing = null as RequiredResource | null,
} = {}) => {
  const session = new GameSession(6100, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 5
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player, index) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.cardStates = {}
    Object.assign(player.resources, {
      wood: index === 0 && missing !== 'wood' ? 1 : 0,
      clay: index === 0 && missing !== 'clay' ? 1 : 0,
      reed: index === 0 && missing !== 'reed' ? 1 : 0,
      stone: index === 0 && missing !== 'stone' ? 1 : 0,
      grain: index === 0 && missing !== 'grain' ? 1 : 0,
      vegetable: index === 0 && missing !== 'vegetable' ? 1 : 0,
      food: 20, sheep: 0, boar: 0, cattle: 0, begging: 0,
    })
    if (played) markAllWorkersUsed(state, player)
    else setWorkersAtHome(state, player, index === 0 ? 2 : 0)
  })
  const owner = state.players[0]!
  owner.occupationHand = played ? [FILLER] : [CARD_ID]
  owner.occupationPlayed = played ? [CARD_ID] : []
  session.loadState(state)
  return session
}

const playOccupation = (session: GameSession) => {
  let response = session.takeAction(0, 'lessons')
  if (response.interaction.stateId === 'wait') {
    const option = response.interaction.request.options?.find((candidate) =>
      candidate.value === CARD_ID)
    if (option) response = session.resolveChoice(response.interaction.playerIndex, option.value)
  }
  return response
}

const bonusVp = (response: SessionResponse) =>
  response.state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp ?? 0

const startNextWorkPhase = (session: GameSession) => {
  const state = session.getState().state
  state.players.forEach((player) => markAllWorkersUsed(state, player))
  session.loadState(state)
  return session.performRoundEnd()
}

describe('E100 Museum Caretaker parity', () => {
  it('E100 S1: Museum Caretaker is played as the first occupation', () => {
    const response = playOccupation(setup({ played: false }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
  })

  it('E100 S2: all six required resources grant one bonus point at work phase start', () => {
    const response = startNextWorkPhase(setup())

    expect(response.state.round).toBe(6)
    expect(bonusVp(response)).toBe(1)
    for (const resource of REQUIRED_RESOURCES) {
      expect(response.state.players[0]!.resources[resource]).toBe(1)
    }
  })

  it.each(REQUIRED_RESOURCES)(
    'E100 S3: missing %s grants no bonus point at work phase start',
    (missing) => {
      const response = startNextWorkPhase(setup({ missing }))

      expect(response.state.round).toBe(6)
      expect(bonusVp(response)).toBe(0)
    },
  )

  it('E100 S4: qualifying at two consecutive work phase starts grants two bonus points', () => {
    const session = setup()
    startNextWorkPhase(session)

    const response = startNextWorkPhase(session)

    expect(response.state.round).toBe(7)
    expect(bonusVp(response)).toBe(2)
  })
})

describe('ae-negative-46-preparation', () => {
  const { MUSEUM, sessions, save, ok, lesson, bonus, boundary, prepMake, GOODS } = audit46Preparation
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('E100 N1 actual purchase grants no early point and every missing supply good prevents the next work phase point',()=>{const a=lesson(prepMake(MUSEUM,()=>{},false),MUSEUM);assert.equal(bonus(a,MUSEUM),0);for(const missing of['none',...GOODS]){const s=prepMake(MUSEUM,state=>{for(const good of GOODS)state.players[0]!.resources[good]=good===missing?0:1}),r=boundary(s,MUSEUM);assert.equal(bonus(r,MUSEUM),missing==='none'?1:0);for(const good of GOODS)assert.equal(r.state.players[0]!.resources[good],good===missing?0:1);assert.equal(bonus(r,MUSEUM,1),0);save(`E100-N1-${missing}`,{a,r})}})
  it('E100 N2 card in hand and midround full stock give no point while two distinct work phase starts grant exactly two',()=>{const t=prepMake(MUSEUM,state=>{for(const good of GOODS)state.players[0]!.resources[good]=1},false),hand=boundary(t,MUSEUM);assert.equal(bonus(hand,MUSEUM),0);const s=prepMake(MUSEUM,state=>{for(const good of GOODS)state.players[0]!.resources[good]=1}),mid=ok(s.takeAction(0,'meeting-place'));assert.equal(bonus(mid,MUSEUM),0);const nine=boundary(s,MUSEUM),ten=boundary(s,MUSEUM,10);assert.equal(bonus(nine,MUSEUM),1);assert.equal(bonus(ten,MUSEUM),2);save('E100-N2',{hand,mid,nine,ten})})
})
