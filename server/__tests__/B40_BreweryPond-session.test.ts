import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { computeScores } from '../../shared/domain/scoring'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/B/B040_BreweryPond'

const CARD_ID = 'B040_BreweryPond'
const FILLER = '__test_placeholder__'
const OCCUPATIONS = ['A116_WoodCutter', 'B121_Geologist']

const setup = ({ played = false, occupations = 2, actor = 0 } = {}) => {
  const session = new GameSession(5040, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = actor
  state.round = 5
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.resources = {
      ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0, vegetable: 0,
    }
  })
  const owner = state.players[0]!
  owner.minorHand = played ? [FILLER] : [CARD_ID]
  owner.minorPlayed = played ? [CARD_ID] : []
  owner.occupationPlayed = OCCUPATIONS.slice(0, occupations)
  owner.resources.food = 0
  state.actionSpaces.find((space) => space.id === 'fishing')!.resources.food = 2
  state.actionSpaces.find((space) => space.id === 'reed-bank')!.resources.reed = 2
  session.loadState(state)
  return session
}

const enterMinor = (session: GameSession): SessionResponse => {
  let response = session.takeAction(0, 'meeting-place')
  if (response.interaction.stateId !== 'wait') return response
  const improvement = response.interaction.request.options?.find((candidate) =>
    candidate.value.startsWith('action-improvement-'))
  if (improvement) response = session.resolveChoice(response.interaction.playerIndex, improvement.value)
  return response
}

const playMinor = (session: GameSession): SessionResponse => {
  let response = enterMinor(session)
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const card = response.interaction.request.options?.find((option) => option.value === CARD_ID)
  if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
  return response
}

const printedVp = (response: SessionResponse) => {
  const player = response.state.players[0]!
  return computeScores(response.state).find((summary) => summary.playerId === player.id)!
    .categories.find((category) => category.key === 'cards')!.entries
    .find((entry) => 'cardId' in entry && entry.cardId === CARD_ID)?.score
}

const takeSpace = (session: GameSession, playerIndex: number, spaceId: string) => {
  let response = session.takeAction(playerIndex, spaceId)
  if (response.interaction.stateId === 'wait'
    && response.interaction.request.kind === 'select-trigger') {
    const trigger = response.interaction.request.options?.find((option) => option.value === CARD_ID)
    expect(trigger).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, trigger!.value)
  }
  return response
}

describe('B040 Brewery Pond parity', () => {
  it('B040 S1: two occupations allow playing Brewery Pond for minus one point', () => {
    const response = playMinor(setup())

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(printedVp(response)).toBe(-1)
  })

  it('B040 S2: fewer than two occupations keep Brewery Pond unavailable', () => {
    const response = enterMinor(setup({ occupations: 1 }))

    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return
    expect((response.interaction.request.options ?? []).some((option) => option.value === CARD_ID)).toBe(false)
  })

  for (const [scenario, space, collected] of [
    ['S3', 'fishing', { food: 2 }],
    ['S4', 'reed-bank', { reed: 2 }],
  ] as const) {
    it(`B040 ${scenario}: using ${space} gains one grain and one wood in addition to the space`, () => {
      const session = setup({ played: true })
      const response = takeSpace(session, 0, space)

      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.resources).toMatchObject({ ...collected, grain: 1, wood: 1 })
    })
  }

  it('B040 S5: using a different accumulation space grants no Brewery Pond goods', () => {
    const session = setup({ played: true })
    const state = session.getState().state
    state.actionSpaces.find((space) => space.id === 'clay-pit')!.resources.clay = 2
    session.loadState(state)

    const response = session.takeAction(0, 'clay-pit')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 2, grain: 0, wood: 0 })
  })

  it('B040 S6: another player using Fishing does not trigger the owner Brewery Pond', () => {
    const response = setup({ played: true, actor: 1 }).takeAction(1, 'fishing')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 0, wood: 0 })
    expect(response.state.players[1]!.resources.food).toBe(22)
  })
})
