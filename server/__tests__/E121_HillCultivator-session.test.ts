import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/E/E121_HillCultivator'
import * as audit50Cards from './_helpers/audit/ae-negative-50-cards'

const CARD_ID = 'E121_HillCultivator'
const FILLER = '__test_placeholder__'

const setup = ({ played = true, round = 5 } = {}) => {
  const session = new GameSession(7121, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = round
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.players.forEach((player, index) => {
    setWorkersAtHome(state, player, index === 0 ? 2 : 0)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.improvements = []
    player.cardStates = {}
    Object.assign(player.resources, {
      wood: 0, clay: 0, reed: 0, stone: 0, food: index === 0 ? 0 : 20,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    })
  })
  const owner = state.players[0]!
  owner.occupationHand = played ? [FILLER] : [CARD_ID]
  owner.occupationPlayed = played ? [CARD_ID] : []
  session.loadState(state)
  return session
}

const play = (session: GameSession): SessionResponse => {
  let response = session.takeAction(0, 'lessons')
  expect(response.ok, response.error).toBe(true)
  if (!response.state.players[0]!.occupationHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const card = response.interaction.request.options?.find((option) => option.value === CARD_ID)
  expect(card, JSON.stringify(response.interaction, null, 2)).toBeDefined()
  response = session.resolveChoice(response.interaction.playerIndex, card!.value)
  return response
}

describe('E121 Hill Cultivator parity', () => {
  it('E121 S1: Hill Cultivator can be played as the first occupation', () => {
    const response = play(setup({ played: false }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(0)
  })

  it('E121 S2: using Grain Seeds gains one grain and two clay', () => {
    const response = setup().takeAction(0, 'grain-seeds')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 1, clay: 2 })
  })

  it('E121 S3: using Vegetable Seeds gains one vegetable and three clay', () => {
    const response = setup({ round: 8 }).takeAction(0, 'vegetable-seeds')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ vegetable: 1, clay: 3 })
  })

  it('E121 S4: using another action space grants no clay', () => {
    const response = setup().takeAction(0, 'day-laborer')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 2, clay: 0 })
  })

  it('E121 S5: Grain Seeds grants no clay when Hill Cultivator is not in play', () => {
    const response = setup({ played: false }).takeAction(0, 'grain-seeds')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 1, clay: 0 })
  })
})

describe('ae-negative-50-cards', () => {
  const { sessions, save, ok, make, finish, ready, resources } = audit50Cards
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('E121 N1 Grain Seeds gives exactly two clay and Vegetable Seeds gives exactly three clay', () => { for (const [space, crop, clay] of [['grain-seeds', 'grain', 2], ['vegetable-seeds', 'vegetable', 3]] as const) { const s = make('E121_HillCultivator', undefined, true, 14), r = finish(s, ok(s.takeAction(0, space))); resources(r, { [crop]: 1, clay }); save(`E121-N1-${crop}`, r) } })
  it('E121 N2 nonseed owner and actual opponent seed or hand-only Vegetable Seeds never grant clay', () => { const s = make('E121_HillCultivator'), a = finish(s, ok(s.takeAction(0, 'day-laborer'))); ready(s); const r = finish(s, ok(s.takeAction(1, 'grain-seeds'))); resources(r, { food: 102, clay: 0 }); resources(r, { grain: 1, clay: 0 }, 1); const c = make('E121_HillCultivator', undefined, false, 14), cr = finish(c, ok(c.takeAction(0, 'vegetable-seeds'))); resources(cr, { vegetable: 1, clay: 0 }); save('E121-N2', { a, r, cr }) })
})
