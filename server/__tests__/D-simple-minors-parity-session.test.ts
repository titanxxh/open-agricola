import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { markAllWorkersUsed, setActiveWorkerCount, setWorkersAtHome } from '../../shared/domain/player'
import { autoAdvanceRoundEnd } from '../../tests/llm-card-gen/session-helpers'

import '../../shared/cards/D/D004_CrossCutWood'
import '../../shared/cards/D/D076_SocialBenefits'

const setupMinor = ({
  cardId,
  resources = {},
  occupations = 0,
}: {
  cardId: 'D004_CrossCutWood' | 'D076_SocialBenefits'
  resources?: Partial<Record<'food' | 'wood' | 'reed' | 'stone', number>>
  occupations?: number
}) => {
  const session = new GameSession(1)
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 5
  state.roundPhase = 'work'
  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.minorHand = [cardId]
  player.occupationHand = ['__test_placeholder__']
  player.occupationPlayed = ['A116_WoodCutter', 'B121_Geologist', 'C123_Freemason'].slice(0, occupations)
  player.resources = {
    ...player.resources,
    food: 0,
    wood: 0,
    reed: 0,
    stone: 0,
    ...resources,
  }
  state.players[1]!.minorHand = ['__test_placeholder__']
  state.players[1]!.occupationHand = ['__test_placeholder__']
  state.players[1]!.workersAvailable = 2
  const improvement = state.actionSpaces.find((space) => space.id === 'major-improvement')
  if (!improvement) throw new Error('major-improvement missing')
  improvement.takenBy = []
  session.loadState(state)
  return session
}

const enterImprovementChoice = (session: GameSession) => {
  let response = session.takeAction(0, 'major-improvement')
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) => {
    return candidate.value.startsWith('action-improvement-')
  })
  if (option) response = session.resolveChoice(0, option.value)
  return response
}

const playMinor = (session: GameSession, cardId: string): SessionResponse => {
  let response = enterImprovementChoice(session)
  if (!response.state.players[0]!.minorHand.includes(cardId)) return response
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) => candidate.value === cardId)
  expect(option).toBeDefined()
  if (!option) return response
  response = session.resolveChoice(0, option.value)
  return response
}

const cardIsOffered = (session: GameSession, cardId: string) => {
  const response = enterImprovementChoice(session)
  if (!response.state.players[0]!.minorHand.includes(cardId)) return true
  if (response.interaction.stateId !== 'wait') return false
  return response.interaction.request.options?.some((candidate) => candidate.value === cardId) ?? false
}

describe('D004 Cross-Cut Wood parity', () => {
  it('D004 S1: three occupations and three stone let Cross-Cut Wood pay one food and gain three wood', () => {
    const session = setupMinor({
      cardId: 'D004_CrossCutWood',
      occupations: 3,
      resources: { food: 1, stone: 3 },
    })

    const response = playMinor(session, 'D004_CrossCutWood')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, wood: 3, stone: 3 })
    expect(response.state.players[1]!.minorHand).toContain('D004_CrossCutWood')
  })

  it('D004 S2: zero stone grants no wood and still passes Cross-Cut Wood', () => {
    const response = playMinor(setupMinor({
      cardId: 'D004_CrossCutWood',
      occupations: 3,
      resources: { food: 1 },
    }), 'D004_CrossCutWood')

    expect(response.state.players[0]!.resources.wood).toBe(0)
    expect(response.state.players[1]!.minorHand).toContain('D004_CrossCutWood')
  })

  it('D004 S3: fewer than three occupations keeps Cross-Cut Wood unavailable', () => {
    expect(cardIsOffered(setupMinor({
      cardId: 'D004_CrossCutWood',
      occupations: 2,
      resources: { food: 1, stone: 3 },
    }), 'D004_CrossCutWood')).toBe(false)
  })

  it('D004 S4: no food keeps Cross-Cut Wood unavailable', () => {
    expect(cardIsOffered(setupMinor({
      cardId: 'D004_CrossCutWood',
      occupations: 3,
      resources: { stone: 3 },
    }), 'D004_CrossCutWood')).toBe(false)
  })
})

const socialBenefitsHarvest = (food: number) => {
  const session = new GameSession()
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.round = 4
  state.roundPhase = 'work'
  state.currentPlayerIndex = 0
  state.players.forEach((player, index) => {
    markAllWorkersUsed(state, player)
    setActiveWorkerCount(player, 1)
    player.resources.food = index === 0 ? food : 8
    player.resources.wood = 0
    player.resources.clay = 0
  })
  state.players[0]!.minorPlayed = ['D076_SocialBenefits']
  session.loadState(state)
  return autoAdvanceRoundEnd(session)
}

describe('D076 Social Benefits parity', () => {
  it('D076 S1: Social Benefits costs one reed and stays in play with at most one occupation', () => {
    const response = playMinor(setupMinor({
      cardId: 'D076_SocialBenefits',
      occupations: 1,
      resources: { reed: 1 },
    }), 'D076_SocialBenefits')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.reed).toBe(0)
    expect(response.state.players[0]!.minorPlayed).toContain('D076_SocialBenefits')
  })

  it('D076 S2: ending harvest feeding with zero food grants one wood and one clay', () => {
    const response = socialBenefitsHarvest(2)

    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, wood: 1, clay: 1 })
  })

  it('D076 S3: ending harvest feeding with food remaining grants nothing', () => {
    const response = socialBenefitsHarvest(3)

    expect(response.state.players[0]!.resources).toMatchObject({ food: 1, wood: 0, clay: 0 })
  })

  it('D076 S4: two occupations keep Social Benefits unavailable', () => {
    expect(cardIsOffered(setupMinor({
      cardId: 'D076_SocialBenefits',
      occupations: 2,
      resources: { reed: 1 },
    }), 'D076_SocialBenefits')).toBe(false)
  })
})
