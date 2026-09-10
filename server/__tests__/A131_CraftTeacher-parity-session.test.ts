import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'

import '../../shared/cards/A/A131_CraftTeacher'

const CARD_ID = 'A131_CraftTeacher'
const OCCUPATIONS = ['A116_WoodCutter', 'B121_Geologist']
const FILLER = '__test_placeholder__'

const setup = (played = true) => {
  const session = new GameSession(7131, undefined, { playerCount: 3 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 14
  state.roundPhase = 'work'
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player, index) => {
    setWorkersAtHome(state, player, index === 0 ? 2 : 0)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.improvements = []
    player.cardStates = {}
    player.resources = {
      ...player.resources, wood: 10, clay: 10, reed: 10, stone: 10, food: 0,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    }
  })
  const owner = state.players[0]!
  owner.occupationHand = played ? OCCUPATIONS : [CARD_ID]
  owner.occupationPlayed = played ? [CARD_ID] : []
  state.availableMajorImprovements = [
    'Major_Joinery', 'Major_Pottery', 'Major_Basket', 'Major_Fireplace1',
  ]
  session.loadState(state)
  return session
}

const chooseCard = (session: GameSession, response: SessionResponse, cardId: string) => {
  if (cardId === CARD_ID
    && !response.state.players[response.interaction.stateId === 'wait' ? response.interaction.playerIndex : 0]!
      .occupationHand.includes(cardId)) return response
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) => candidate.value === cardId)
  expect(option, JSON.stringify(response.interaction)).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, option!.value)
}

const buildMajor = (session: GameSession, cardId: string) =>
  chooseCard(session, session.takeAction(0, 'major-improvement'), cardId)

const enterCraftTeacher = (session: GameSession, response: SessionResponse, takeTwo: boolean) => {
  response = resolveTriggerIfPresent(session, response, CARD_ID)
  if (response.interaction.stateId !== 'wait') return response
  const choices = response.interaction.request.options?.filter((option) => option.value !== '__skip__') ?? []
  const choice = takeTwo ? choices.at(-1) : choices[0]
  expect(choice, JSON.stringify(response.interaction)).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, choice!.value)
}

describe('A131 Craft Teacher parity', () => {
  it('A131 S1: Craft Teacher can be played as the first occupation in a three-player game', () => {
    const session = setup(false)
    const played = chooseCard(session, session.takeAction(0, 'lessons'), CARD_ID)
    expect(played.ok, played.error).toBe(true)
    expect(played.state.players[0]!.occupationPlayed).toContain(CARD_ID)
  })

  it('A131 S2: OA offers no occupations after building Joinery', () => {
    const session = setup()
    const response = buildMajor(session, 'Major_Joinery')
    expect(response.state.players[0]!.occupationPlayed).toEqual([CARD_ID])
    expect(response.state.players[0]!.occupationHand).toEqual(OCCUPATIONS)
    expect(response.state.players[0]!.resources.food).toBe(0)
  })

  it('A131 S3: OA offers no occupations after building Pottery', () => {
    const session = setup()
    const response = buildMajor(session, 'Major_Pottery')
    expect(response.state.players[0]!.occupationPlayed).toEqual([CARD_ID])
    expect(response.state.players[0]!.occupationHand).toEqual(OCCUPATIONS)
  })

  it('A131 S4: OA offers no occupations after building Basket', () => {
    const session = setup()
    const response = buildMajor(session, 'Major_Basket')
    expect(response.state.players[0]!.occupationHand).toEqual(OCCUPATIONS)
    expect(response.interaction.stateId !== 'wait' || response.interaction.sourceCard !== CARD_ID).toBe(true)
  })

  it('A131 S5: building an unrelated major improvement offers no Craft Teacher occupations', () => {
    const session = setup()
    session.state.players[0]!.resources.clay = 2
    const response = buildMajor(session, 'Major_Fireplace1')
    expect(response.state.players[0]!.improvements).toContain('Major_Fireplace1')
    expect(response.state.players[0]!.occupationHand).toEqual(OCCUPATIONS)
    expect(response.interaction.stateId !== 'wait' || response.interaction.sourceCard !== CARD_ID).toBe(true)
  })
})
