import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { computeScores } from '../../shared/domain/scoring'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/E/E086_PenBuilder'
import '../../shared/cards/E/E124_MayorCandidate'
import assert from 'node:assert/strict'
import * as audit50Cards from './_helpers/audit/ae-negative-50-cards'

const CARD_ID = 'E124_MayorCandidate'
const FILLER = '__test_placeholder__'

const setup = ({
  played = false, resources = {}, penBuilder = false,
}: {
  played?: boolean
  resources?: Partial<{ wood: number; clay: number; reed: number; stone: number; food: number }>
  penBuilder?: boolean
} = {}) => {
  const session = new GameSession(7124, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 5
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player, index) => {
    setWorkersAtHome(state, player, index === 0 ? 2 : 0)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.improvements = []
    player.cardStates = {}
    Object.assign(player.resources, {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0, vegetable: 0,
      sheep: 0, boar: 0, cattle: 0, begging: 0,
      ...(index === 0 ? resources : {}),
    })
  })
  const owner = state.players[0]!
  owner.occupationHand = played ? [FILLER] : [CARD_ID]
  owner.occupationPlayed = played ? [CARD_ID] : []
  if (penBuilder) owner.occupationPlayed.push('E086_PenBuilder')
  session.loadState(state)
  return session
}

const playMayorCandidate = (session: GameSession) => {
  let response = session.takeAction(0, 'lessons')
  if (response.interaction.stateId === 'wait'
    && response.state.players[0]!.occupationHand.includes(CARD_ID)) {
    const card = response.interaction.request.options?.find((option) => option.value === CARD_ID)
    expect(card, JSON.stringify(response.interaction, null, 2)).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, card!.value)
  }
  return response
}

const mayorCandidateBonus = (session: GameSession, response: SessionResponse) =>
  session.withCtx(() => computeScores(response.state))[0]!.categories
    .find((category) => category.key === 'cardBonusVp')?.entries
    .find((entry) => entry.type === 'bonus' && entry.cardId === CARD_ID)?.score ?? 0

describe('E124 Mayor Candidate parity', () => {
  it('E124 S1: playing Mayor Candidate grants two wood and two stone', () => {
    const response = playMayorCandidate(setup())

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 2, stone: 2 })
  })

  it('E124 S2: no wood or stone in reserve scores no Mayor Candidate penalty', () => {
    const session = setup({ played: true })
    expect(mayorCandidateBonus(session, session.getState())).toBe(0)
  })

  it('E124 S3: three wood and two stone in reserve score five negative points', () => {
    const session = setup({ played: true, resources: { wood: 3, stone: 2 } })
    const response = session.getState()

    expect(mayorCandidateBonus(session, response)).toBe(-5)
  })

  it('E124 S4: clay and reed do not add to the Mayor Candidate penalty', () => {
    const session = setup({
      played: true, resources: { wood: 1, stone: 2, clay: 3, reed: 4 },
    })
    const response = session.getState()

    expect(mayorCandidateBonus(session, response)).toBe(-3)
  })

  it('E124 S5: Pen Builder still consumes one wood despite Mayor Candidates discard prohibition', () => {
    const session = setup({ played: true, resources: { wood: 1 }, penBuilder: true })
    const active = session.takeAction(0, 'farmland')
    expect(active.interaction.stateId).toBe('wait')
    const anytime = active.interaction.anytimeActions.find((action) =>
      action.sourceCard === 'E086_PenBuilder')
    expect(anytime, JSON.stringify(active.interaction, null, 2)).toBeDefined()

    const response = session.takeAnytimeAction(0, anytime!.id)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(0)
    expect(response.state.players[0]!.cardStates.E086_PenBuilder?.counters?.discards).toBe(1)
  })
})

describe('ae-negative-50-cards', () => {
  const { sessions, save, make, finish, lesson, end, resources, build, mayorBonus } = audit50Cards
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('E124 N1 actual first Lessons grants exactly two wood and two stone', () => { const s = make('E124_MayorCandidate', undefined, false), r = finish(s, lesson(s, 'E124_MayorCandidate')); resources(r, { wood: 2, stone: 2 }); assert.equal(mayorBonus(r), -4); save('E124-N1', r) })
  it('E124 N2 actual final harvest scores minus five for three wood two stone and zero with neither regardless of clay reed', () => { for (const count of [0, 1]) { const s = make('E124_MayorCandidate', st => Object.assign(st.players[0]!.resources, { wood: count * 3, stone: count * 2, clay: 3, reed: 4 }), true, 14), r = finish(s, end(s), false); assert.equal(r.state.gameOver, true); assert.equal(mayorBonus(r), count ? -5 : 0); resources(r, { clay: 3, reed: 4 }); save(`E124-N2-${count}`, r) } })
  it('E124 N3 ordinary room payment consumes wood and hand-only card gives no final penalty', () => { const s = make('E124_MayorCandidate', st => Object.assign(st.players[0]!.resources, { wood: 5, reed: 2 })), r = build(s); resources(r, { wood: 0, reed: 0 }); assert.equal(mayorBonus(r), 0); const c = make('E124_MayorCandidate', st => Object.assign(st.players[0]!.resources, { wood: 3, stone: 2 }), false, 14), cr = finish(c, end(c), false); assert.equal(cr.state.gameOver, true); assert.equal(mayorBonus(cr), 0); save('E124-N3', { r, cr }) })
})
