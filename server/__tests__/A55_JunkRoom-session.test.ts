import { type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import '../../shared/cards/A/A037_Bucksaw'
import '../../shared/cards/A/A055_JunkRoom'

import { afterEach, describe, expect, it } from 'vitest'

import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { createWorkSession } from './_helpers/session-fixtures'
import { expectWait } from './_helpers/trigger-select'

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

// #1063: migrate a local listener to existing after reactions. The real purchase
// and same-timing selection require Session tests, including self-construction.
describe('A055 Junk Room after-reaction ordering', () => {
  const CARD_ID = 'A055_JunkRoom'
  const UPHOLSTERY = 'E031_Upholstery'
  const sessions: GameSession[] = []
  afterEach(() => sessions.splice(0).forEach((session) => session.dispose()))

  const setup = () => {
    const session = createWorkSession({
      seed: 1063,
      configure: (state) => {
        state.round = 14
        state.players[0]!.minorHand = [CARD_ID]
        state.players[0]!.minorPlayed = [UPHOLSTERY]
        state.players[0]!.cardStates[UPHOLSTERY] = { counters: { reed: 0, bonusVp: 0 } }
        for (const [index, player] of state.players.entries()) {
          Object.assign(player.resources, { wood: 0, clay: 0, reed: 0, stone: 0, food: 0 })
          if (index === 0) Object.assign(player.resources, { wood: 1, clay: 1, reed: 1 })
        }
      },
    })
    sessions.push(session)
    return session
  }

  const buyJunkRoom = (session: GameSession) => {
    let response = session.takeAction(0, 'major-improvement')
    expect(response.ok, response.error).toBe(true)
    if (!response.state.players[0]!.minorPlayed.includes(CARD_ID)) {
      const wait = expectWait(response)
      expect(wait.interaction.request.kind).toBe('choice')
      const branch = wait.interaction.request.options?.find((option) => option.value.startsWith('action-improvement-'))
      if (branch) response = session.resolveChoice(0, branch.value)
    }
    if (!response.state.players[0]!.minorPlayed.includes(CARD_ID)) {
      const wait = expectWait(response)
      const card = wait.interaction.request.options?.find((option) => option.value === CARD_ID)
      expect(card).toBeDefined()
      response = session.resolveChoice(0, card!.value)
    }
    return expectWait(response)
  }

  const gainLogs = (response: SessionResponse) => response.state.log.filter((entry) =>
    entry.key === 'log.cardEffectGain' && entry.params?.cardId === CARD_ID)

  it.each([CARD_ID, UPHOLSTERY])('lets the owner choose %s first and reconstructs the selection after undo', (first) => {
    const session = setup()
    const before = session.getState()
    const resourcesBefore = { ...before.state.players[0]!.resources }
    const scoresBefore = structuredClone(before.scores)
    const logsBefore = structuredClone(before.state.log)
    let response: SessionResponse = buyJunkRoom(session)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, clay: 0, reed: 1, food: 0 })
    expect(gainLogs(response)).toEqual([])
    expect(response.interaction.request?.kind).toBe('select-trigger')
    expect(response.interaction.request?.options?.map((option) => option.value))
      .toEqual(expect.arrayContaining([CARD_ID, UPHOLSTERY]))
    expect(response.interaction.request?.options?.find((option) => option.value === '__pass__')?.disabled).toBe(true)
    const purchaseScores = structuredClone(response.scores)
    const purchaseLogs = structuredClone(response.state.log)

    const resolve = (source: string) => {
      response = session.resolveChoice(0, source)
      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.resources).toMatchObject({
        food: source === CARD_ID ? 1 : 0,
        reed: 1,
      })
      if (source === UPHOLSTERY) {
        expect(response.interaction).toMatchObject({
          stateId: 'wait', sourceCard: UPHOLSTERY, request: { kind: 'choice' },
        })
      }
      // The host's transaction publishes its card logs when all reactions drain.
      expect(response.state.log).toEqual(purchaseLogs)
      expect(response.scores).toEqual(purchaseScores)
    }

    const acceptUpholstery = () => {
      const wait = expectWait(response)
      expect(wait.interaction.sourceCard).toBe(UPHOLSTERY)
      expect(wait.interaction.request.kind).toBe('choice')
      const accept = wait.interaction.request.options?.find((option) => option.value !== '__skip__')
      expect(accept?.effectPreview).toMatchObject({ kind: 'payment', resourcesPaid: { reed: 1 } })
      response = session.resolveChoice(0, accept!.value)
      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.resources.reed).toBe(0)
      expect(response.state.players[0]!.cardStates[UPHOLSTERY]?.counters).toMatchObject({ reed: 1, bonusVp: 1 })
      expect(response.scores![0]!.total).toBe(purchaseScores![0]!.total + 1)
    }

    resolve(first)
    response = session.undoStep()
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.request?.kind).toBe('select-trigger')
    expect(response.interaction.request?.options?.map((option) => option.value))
      .toEqual(expect.arrayContaining([CARD_ID, UPHOLSTERY]))
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, clay: 0, reed: 1, food: 0 })
    expect(response.state.players[0]!.cardStates[UPHOLSTERY]?.counters).toEqual({ reed: 0, bonusVp: 0 })
    expect(response.state.log).toEqual(purchaseLogs)
    expect(response.scores).toEqual(purchaseScores)

    resolve(first)
    if (first === UPHOLSTERY) acceptUpholstery()
    const second = first === CARD_ID ? UPHOLSTERY : CARD_ID
    const remaining = expectWait(response)
    expect(remaining.interaction.request.kind).toBe('select-trigger')
    expect(remaining.interaction.request.options?.some((option) => option.value === first)).toBe(false)
    response = session.resolveChoice(0, second)
    expect(response.ok, response.error).toBe(true)
    if (second === UPHOLSTERY) acceptUpholstery()
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, clay: 0, reed: 0, food: 1 })
    expect(response.state.players[0]!.cardStates[UPHOLSTERY]?.counters).toMatchObject({ reed: 1, bonusVp: 1 })
    expect(gainLogs(response)).toHaveLength(1)
    expect(response.scores![0]!.total).toBe(purchaseScores![0]!.total + 1)
    expect(response.scores![1]).toEqual(scoresBefore![1])
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })

    response = session.undoAction()
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toEqual(resourcesBefore)
    expect(response.state.players[0]!.minorHand).toEqual([CARD_ID])
    expect(response.state.players[0]!.minorPlayed).toEqual([UPHOLSTERY])
    expect(response.state.players[0]!.cardStates[UPHOLSTERY]?.counters).toEqual({ reed: 0, bonusVp: 0 })
    expect(response.interaction.stateId).toBe('idle')
    expect(response.state.log).toEqual(logsBefore)
    expect(response.scores).toEqual(scoresBefore)
    expect(buyJunkRoom(session).interaction.request.kind).toBe('select-trigger')
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
