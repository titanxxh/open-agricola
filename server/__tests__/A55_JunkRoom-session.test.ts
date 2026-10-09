import { type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import '../../shared/cards/A/A037_Bucksaw'
import '../../shared/cards/A/A055_JunkRoom'

import { describe, expect, it } from 'vitest'

import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

describe('A055_JunkRoom session log dedupe', () => {
  it('logs Junk Room gain only once when playing a minor improvement', () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state

    state.players = state.players.slice(0, 2)
    state.round = 3
    state.roundPhase = 'work'
    state.currentPlayerIndex = 0
    state.players[0]!.workersAvailable = 1
    state.players[0]!.familySize = 1
    state.players[1]!.workersAvailable = 0
    state.players[1]!.familySize = 1

    const player = state.players[0]!
    player.minorPlayed = ['A055_JunkRoom']
    player.minorPlayed.push('A055_JunkRoom')
    player.minorHand = ['A037_Bucksaw']
    player.resources.wood = 1
    player.resources.food = 0

    session.loadState(state)

    let resp = session.takeAction(0, 'meeting-place')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')

    if (resp.interaction.stateId !== 'wait') return
    const improvementOption = resp.interaction.request.options?.find((option) => option.value.startsWith('action-improvement-'))
    expect(improvementOption).toBeDefined()
    resp = session.resolveChoice(0, improvementOption!.value)
    expect(resp.ok).toBe(true)
    if (resp.interaction.stateId === 'wait') {
      const bucksawOption = resp.interaction.request.options?.find((option) => option.value === 'A037_Bucksaw')
      if (bucksawOption) {
        resp = session.resolveChoice(0, bucksawOption.value)
        expect(resp.ok).toBe(true)
      }
    }

    const junkRoomLogs = resp.state.log.filter(
      (entry) =>
        entry.key === 'log.cardEffectGain' &&
        entry.params?.cardId === 'A055_JunkRoom',
    )
    expect(junkRoomLogs).toHaveLength(1)
    expect(junkRoomLogs[0]?.params?.gain).toEqual({ food: 1 })
    expect(resp.state.players[0]!.resources.food).toBe(1)
  })
})

describe('A055 Junk Room parity', () => {
  const CARD_ID = 'A055_JunkRoom'

  const MINOR_ID = 'A037_Bucksaw'

  const FILLER = '__test_placeholder__'

  const setup = ({
    played = true, actor = 0, ownerResources = {}, actorResources = {},
  }: {
    played?: boolean
    actor?: number
    ownerResources?: Partial<Record<'wood' | 'clay', number>>
    actorResources?: Partial<Record<'wood' | 'clay', number>>
  } = {}) => {
    const session = new GameSession(6055, undefined, { playerCount: 2 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = actor
    state.round = 14
    state.roundPhase = 'work'
    state.availableMajorImprovements = ['Major_Fireplace1']
    state.players.forEach((player, index) => {
      setWorkersAtHome(state, player, 2)
      player.minorHand = [FILLER]
      player.occupationHand = [FILLER]
      player.minorPlayed = []
      player.resources = {
        ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0,
        vegetable: 0, sheep: 0, boar: 0, cattle: 0,
        ...(index === 0 ? ownerResources : {}),
        ...(index === actor ? actorResources : {}),
      }
    })
    const owner = state.players[0]!
    owner.minorHand = played ? [FILLER] : [CARD_ID]
    owner.minorPlayed = played ? [CARD_ID] : []
    session.loadState(state)
    return session
  }

  const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
    ? response.interaction.request.options ?? []
    : []

  const playImprovement = (session: GameSession, playerIndex: number, cardId: string) => {
    let response = session.takeAction(playerIndex, 'major-improvement')
    if (response.interaction.stateId !== 'wait') return response
    if (!options(response).some((option) => option.value === cardId)) {
      const improvement = options(response).find((option) => option.value.startsWith('action-improvement-'))
      if (improvement) response = session.resolveChoice(playerIndex, improvement.value)
    }
    if (
      response.state.players[playerIndex]!.minorPlayed.includes(cardId)
      || response.state.players[playerIndex]!.improvements.includes(cardId)
    ) return response
    const card = options(response).find((option) => option.value === cardId)
    expect(card).toBeDefined()
    return session.resolveChoice(playerIndex, card!.value)
  }

  it('A055 S1: playing Junk Room pays one wood and one clay and gains one food from itself', () => {
    const response = playImprovement(setup({
      played: false, ownerResources: { wood: 1, clay: 1 },
    }), 0, CARD_ID)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, clay: 0, food: 1 })
  })

  it('A055 S2: building a later minor improvement gains one food', () => {
    const session = setup({ actorResources: { wood: 1 } })
    session.state.players[0]!.minorHand = [MINOR_ID]

    const response = playImprovement(session, 0, MINOR_ID)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toEqual(expect.arrayContaining([CARD_ID, MINOR_ID]))
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, food: 1 })
  })

  it('A055 S3: building a major improvement gains one food', () => {
    const response = playImprovement(setup({ actorResources: { clay: 2 } }), 0, 'Major_Fireplace1')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.improvements).toContain('Major_Fireplace1')
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 0, food: 1 })
  })

  it('A055 S4: taking a non-improvement action grants no food', () => {
    const response = setup().takeAction(0, 'day-laborer')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 2, wood: 0 })
  })

  it('A055 S5: an opponent building an improvement grants the owner no food', () => {
    const session = setup({ actor: 1, actorResources: { wood: 1 } })
    session.state.players[1]!.minorHand = [MINOR_ID]

    const response = playImprovement(session, 1, MINOR_ID)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(0)
    expect(response.state.players[1]!.resources).toMatchObject({ wood: 0, food: 0 })
  })
})
