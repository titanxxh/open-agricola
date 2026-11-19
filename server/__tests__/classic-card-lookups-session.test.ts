import { afterEach, describe, expect, it } from 'vitest'
import type { GameSession, SessionResponse } from '../game/authoritative-session'
import { computeScores } from '../../shared/domain/scoring'
import { countOccupations } from '../../shared/cards/helpers/prerequisites'
import {
  allMinorImprovementCards, allOccupationCards, implementedMinorImprovementCards, implementedOccupationCards,
} from '../../shared/cards/catalog'
import { createInitialState } from '../../shared/session/state-bootstrap'
import { createWorkSession } from './_helpers/session-fixtures'

// ADR 0049: lookups by exact ID find classic Card Definitions, so a classic card in hand plays, pays and scores
// like any other; the revised enumerations and the deal stay classic-free.
const SLAUGHTERHOUSE = 'CI097_Slaughterhouse'
const SHEPHERD = 'CE203_Shepherd'
const PLACEHOLDER = '__test_placeholder__'
const CLASSIC_ID = /^C[A-Z]+\d{3}_/
const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))

function setup(hand: { minor?: string[]; occupation?: string[] }, resources: Record<string, number>) {
  const session = createWorkSession({ seed: 49, configure(state) {
    state.currentPlayerIndex = 0
    for (const player of state.players) {
      player.minorHand = [PLACEHOLDER]
      player.occupationHand = [PLACEHOLDER]
      player.minorPlayed = []
      player.occupationPlayed = []
    }
    const owner = state.players[0]!
    owner.minorHand = hand.minor ?? [PLACEHOLDER]
    owner.occupationHand = hand.occupation ?? [PLACEHOLDER]
    Object.assign(owner.resources, { wood: 0, clay: 0, reed: 0, stone: 0, food: 0 }, resources)
  } })
  sessions.push(session)
  return session
}

const optionValues = (response: SessionResponse) =>
  response.interaction.stateId === 'wait' ? (response.interaction.request.options ?? []).map(option => option.value) : []

/** Meeting Place may first ask which of its parts to use; follow the improvement part to the minor prompt. */
function openMinorPrompt(session: GameSession) {
  let response = session.takeAction(0, 'meeting-place')
  expect(response.ok, response.error).toBe(true)
  const improvement = optionValues(response).find(value => value.startsWith('action-improvement-'))
  if (improvement) response = session.resolveChoice(0, improvement)
  return response
}

describe('classic Card Definitions in lookups by ID', () => {
  it('plays a classic minor from hand through Meeting Place, pays its cost and scores its VP', () => {
    const session = setup({ minor: [SLAUGHTERHOUSE, PLACEHOLDER] }, { stone: 2, clay: 2 })

    let response = openMinorPrompt(session)
    // As the only playable minor it may be played directly; otherwise the prompt must offer it.
    if (response.state.players[0]!.minorHand.includes(SLAUGHTERHOUSE)) {
      expect(optionValues(response)).toContain(SLAUGHTERHOUSE)
      response = session.resolveChoice(0, SLAUGHTERHOUSE)
    }

    expect(response.ok, response.error).toBe(true)
    const owner = response.state.players[0]!
    expect(owner.minorPlayed).toEqual([SLAUGHTERHOUSE])
    expect(owner.minorHand).toEqual([PLACEHOLDER])
    expect(owner.resources).toMatchObject({ stone: 0, clay: 0 })
    expect(JSON.stringify(response.state.log)).toContain(SLAUGHTERHOUSE)
    const scores = session.withCtx(() => computeScores(response.state))
    const cards = scores.find(score => score.playerId === owner.id)!.categories.find(category => category.key === 'cards')!
    expect(cards.entries).toContainEqual(expect.objectContaining({ cardId: SLAUGHTERHOUSE, cardType: 'minor', score: 2 }))
  })

  it('does not offer a classic minor its owner cannot afford', () => {
    const session = setup({ minor: [SLAUGHTERHOUSE, PLACEHOLDER] }, { stone: 1, clay: 2 })

    const response = openMinorPrompt(session)

    expect(optionValues(response)).not.toContain(SLAUGHTERHOUSE)
    expect(response.state.players[0]!.minorHand).toEqual([SLAUGHTERHOUSE, PLACEHOLDER])
    expect(response.state.players[0]!.minorPlayed).toEqual([])
    expect(response.state.players[0]!.resources).toMatchObject({ stone: 1, clay: 2 })
  })

  it('plays a classic occupation from hand through Lessons and counts it as an occupation', () => {
    const session = setup({ occupation: [SHEPHERD, PLACEHOLDER] }, { food: 2 })

    let response = session.takeAction(0, 'lessons')
    expect(response.ok, response.error).toBe(true)
    if (optionValues(response).includes(SHEPHERD)) response = session.resolveChoice(0, SHEPHERD)

    expect(response.ok, response.error).toBe(true)
    const owner = response.state.players[0]!
    expect(owner.occupationPlayed).toEqual([SHEPHERD])
    expect(owner.occupationHand).toEqual([PLACEHOLDER])
    // The first occupation on Lessons is free under the revised rules.
    expect(owner.resources.food).toBe(2)
    expect(countOccupations(owner)).toBe(1)
  })

  it('keeps the revised enumerations and a fresh deal free of classic cards', () => {
    const enumerated = [...allMinorImprovementCards, ...allOccupationCards, ...implementedMinorImprovementCards, ...implementedOccupationCards]
    expect(enumerated.filter(card => CLASSIC_ID.test(card.id))).toEqual([])

    const state = createInitialState(49, { playerCount: 4 })
    const dealt = state.players.flatMap(player => [...player.minorHand, ...player.occupationHand])
    expect(dealt.length).toBeGreaterThan(0)
    expect(dealt.filter(id => CLASSIC_ID.test(id))).toEqual([])
  })
})
