import { afterEach, describe, expect, it } from 'vitest'
import type { GameSession, SessionResponse } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'
import { choose, restoreSession, snapshotResponse } from './_helpers/card-play-lifecycle'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'

import '../../shared/cards/A/A123_FrameBuilder'
import '../../shared/cards/B/B109_PaperMaker'

const CARD_ID = 'B109_PaperMaker'
const TARGET = 'A123_FrameBuilder'
const PRIOR = 'B121_Geologist'
const FILLER = '__test_placeholder__'

const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))

const setup = ({
  played = true, occupations = 1, food = 0, wood = 1, playerCount = 2,
} = {}) => {
  const session = createWorkSession({ seed: 5109, options: { playerCount }, configure: state => {
    state.round = 5
    state.players.forEach(player => {
      player.resources.food = 20
      player.minorHand = [FILLER]
      player.occupationHand = [FILLER]
    })
    const owner = state.players[0]!
    owner.occupationPlayed = played
      ? [CARD_ID, ...[PRIOR, 'A110_Roughcaster'].slice(0, occupations - 1)]
      : []
    owner.occupationHand = [played ? TARGET : CARD_ID, 'A114_SeasonalWorker']
    owner.resources = {
      ...owner.resources, wood, food, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0,
    }
  } })
  sessions.push(session)
  return session
}

const choosePaperMaker = (session: GameSession, response: SessionResponse, accept: boolean) => {
  response = resolveTriggerIfPresent(session, response, CARD_ID)
  expect(response.ok, response.error).toBe(true)
  if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'choice') {
    throw new Error(`Expected Paper Maker exchange: ${JSON.stringify(response.interaction)}`)
  }
  const option = response.interaction.request.options.find(candidate =>
    accept ? candidate.labelKey === 'ui.interactionResourceExchange' : candidate.value === '__skip__')
  expect(option, JSON.stringify(response.interaction)).toBeDefined()
  return choose(session, response, option!.value)
}

const completeOccupation = (session: GameSession, response: SessionResponse, cardId = TARGET) => {
  if (response.interaction.stateId === 'wait'
    && response.interaction.request.kind === 'choice'
    && response.interaction.request.options?.some(option => option.value === cardId)) {
    response = choose(session, response, cardId)
  }
  expect(response.ok, response.error).toBe(true)
  expect(response.state.players[0]!.occupationPlayed).toContain(cardId)
  return response
}

const playOccupation = (
  session: GameSession, actionId: 'lessons' | 'lessons-4', cardId: string, payWith?: 'wood' | 'food',
) => {
  let response = session.takeAction(0, actionId)
  expect(response.ok, response.error).toBe(true)
  if (payWith && response.interaction.stateId === 'wait'
    && response.interaction.sourceCard === CARD_ID) {
    response = choosePaperMaker(session, response, payWith === 'wood')
  }
  return completeOccupation(session, response, cardId)
}

describe('B109 Paper Maker parity', () => {
  it('keeps surplus food from a two-occupation exchange before paying Lessons', () => {
    const response = playOccupation(setup({ occupations: 2, food: 20, playerCount: 2 }), 'lessons', TARGET, 'wood')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, food: 21 })
    expect(response.state.events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'resource.paid', paymentFor: 'cardEffect', sourceCardId: CARD_ID, resources: { wood: 1 } }),
      expect.objectContaining({ type: 'resource.paid', paymentFor: 'occupation', sourceCardId: TARGET, resources: { food: 1 } }),
    ]))
  })

  it('B109 S1: playing Paper Maker itself as the first occupation spends no wood and gains no food', () => {
    const response = playOccupation(setup({ played: false }), 'lessons', CARD_ID)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 1, food: 0 })
  })

  it('B109 S2: before the next occupation one wood can fund its one-food Lessons cost', () => {
    const session = setup()
    const response = playOccupation(session, 'lessons', TARGET, 'wood')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(TARGET)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, food: 0 })
    expect(response.state.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'resource.paid', paymentFor: 'cardEffect', sourceCardId: CARD_ID,
        resources: { wood: 1 },
      }),
    ]))
  })

  it('B109 S3: with two occupations in play one wood funds a two-food Lessons cost', () => {
    const session = setup({ occupations: 2, playerCount: 4 })
    const response = playOccupation(session, 'lessons-4', TARGET, 'wood')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(TARGET)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, food: 0 })
  })

  it('B109 S4: declining Paper Maker pays the normal Lessons food and preserves wood', () => {
    const session = setup({ food: 1 })
    const response = playOccupation(session, 'lessons', TARGET, 'food')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(TARGET)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 1, food: 0 })
  })

  it('with three prior occupations retains two food after paying the occupation cost', () => {
    const response = playOccupation(setup({ occupations: 3, food: 20 }), 'lessons', TARGET, 'wood')
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, food: 22 })
    expect(response.state.players[0]!.occupationPlayed).toHaveLength(4)
    expect(response.state.players[1]!.resources.food).toBe(20)
    expect(response.state.events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'resource.moved', sourceCardId: CARD_ID, resources: { food: 3 } }),
    ]))
    expect(response.state.log).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'log.cardEffectGain', params: expect.objectContaining({ cardId: CARD_ID, gain: { food: 3 } }) }),
    ]))
  })

  it('allows two prior occupations to fund Lessons from zero food, and undo restores the exchange', () => {
    const session = setup({ occupations: 2 })
    const response = playOccupation(session, 'lessons', TARGET, 'wood')
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, food: 1 })
    const undone = session.undoAction()
    expect(undone.ok, undone.error).toBe(true)
    expect(undone.state.players[0]!.resources).toMatchObject({ wood: 1, food: 0 })
    expect(undone.state.players[0]!.occupationPlayed).toHaveLength(2)
    expect(undone.state.players[0]!.occupationHand).toContain(TARGET)
    const retry = playOccupation(session, 'lessons', TARGET, 'wood')
    expect(retry.state.players[0]!.resources).toMatchObject({ wood: 0, food: 1 })
  })

  it('rejects Lessons with neither food nor wood without changing the session', () => {
    const session = setup({ occupations: 2, wood: 0 })
    const before = snapshotResponse(session.getState())
    const interaction = structuredClone(session.getState().interaction)
    const rejected = session.takeAction(0, 'lessons')
    expect(rejected.ok).toBe(false)
    expect(snapshotResponse(rejected)).toEqual(before)
    expect(rejected.interaction).toEqual(interaction)
  })

  it('declining the only funding exchange keeps the mandatory occupation blocked until undo', () => {
    const session = setup({ occupations: 2 })
    const pending = session.takeAction(0, 'lessons')
    const blocked = choosePaperMaker(session, pending, false)
    expect(blocked.ok, blocked.error).toBe(true)
    expect(blocked.interaction.stateId).toBe('wait')
    if (blocked.interaction.stateId !== 'wait') throw new Error('Expected blocked occupation')
    expect(blocked.interaction.request.kind).toBe('engine-blocked')
    expect(blocked.state.players[0]!.resources).toMatchObject({ wood: 1, food: 0 })
    expect(blocked.state.players[0]!.occupationHand).toContain(TARGET)
    expect(blocked.state.players[0]!.occupationPlayed).toHaveLength(2)
    const undone = session.undoAction()
    expect(undone.ok, undone.error).toBe(true)
    expect(undone.interaction.stateId).toBe('idle')
    expect(undone.state.players[0]!.resources).toMatchObject({ wood: 1, food: 0 })
    expect(playOccupation(session, 'lessons', TARGET, 'wood').state.players[0]!.resources)
      .toMatchObject({ wood: 0, food: 1 })
  })

  it.each(['hand', 'no-wood'] as const)('does not exchange when Paper Maker is unavailable: %s', mode => {
    const session = setup({ food: 1, wood: mode === 'no-wood' ? 0 : 1 })
    if (mode === 'hand') {
      const state = session.getState().state
      state.players[0]!.occupationPlayed = [PRIOR]
      state.players[0]!.occupationHand.push(CARD_ID)
      session.loadState(state)
    }
    const response = playOccupation(session, 'lessons', TARGET)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, wood: mode === 'no-wood' ? 0 : 1 })
    expect(response.state.events.some(event => event.sourceCardId === CARD_ID)).toBe(false)
  })

  it('does not exchange for another player taking Lessons', () => {
    const session = setup({ food: 3 })
    const state = session.getState().state
    state.currentPlayerIndex = 1
    state.players[1]!.occupationPlayed = [PRIOR]
    state.players[1]!.occupationHand = [TARGET, 'A114_SeasonalWorker']
    state.players[1]!.resources.food = 1
    state.players[1]!.resources.wood = 1
    session.loadState(state)
    const response = choose(session, session.takeAction(1, 'lessons'), TARGET)
    expect(response.state.players[1]!.resources).toMatchObject({ food: 0, wood: 1 })
    expect(response.state.players[0]!.resources).toMatchObject({ food: 3, wood: 1 })
    expect(response.state.events.some(event => event.sourceCardId === CARD_ID)).toBe(false)
  })

  it('exchanges before a real Freshman free occupation without inventing an occupation payment', () => {
    const session = setup({ occupations: 2 })
    const state = session.getState().state
    state.players[0]!.occupationPlayed = [CARD_ID, 'A097_Freshman']
    session.loadState(state)
    const offered = session.takeAction(0, 'grain-utilization')
    expect(offered.ok, offered.error).toBe(true)
    if (offered.interaction.stateId !== 'wait' || offered.interaction.request.kind !== 'choice') {
      throw new Error('Expected Freshman replacement')
    }
    const replacement = offered.interaction.request.options?.find(option => option.sourceCard === 'A097_Freshman')
    expect(replacement).toBeDefined()
    const exchange = choose(session, offered, replacement!.value)
    const response = completeOccupation(session, choosePaperMaker(session, exchange, true))
    expect(response.state.players[0]!.resources).toMatchObject({ food: 2, wood: 0 })
    expect(response.state.events.filter(event => event.type === 'resource.paid')).toEqual([
      expect.objectContaining({ sourceCardId: CARD_ID, paymentFor: 'cardEffect', resources: { wood: 1 } }),
    ])
  })

  it('resumes a restored before exchange without granting its income twice', () => {
    const session = setup({ occupations: 2, food: 20 })
    const pending = session.takeAction(0, 'lessons')
    const before = snapshotResponse(pending)
    const interaction = structuredClone(pending.interaction)
    const restored = restoreSession(session)
    sessions.push(restored)
    expect(restored.getState().interaction).toEqual(interaction)
    const rejected = restored.resolveChoice(0, 'unknown-paper-maker-choice')
    expect(rejected.ok).toBe(false)
    expect(snapshotResponse(rejected)).toEqual(before)
    expect(rejected.interaction).toEqual(interaction)
    const response = completeOccupation(restored, choosePaperMaker(restored, restored.getState(), true))
    expect(response.state.players[0]!.resources).toMatchObject({ food: 21, wood: 0 })
    expect(response.state.events.filter(event => event.type === 'resource.moved' && event.sourceCardId === CARD_ID)).toHaveLength(1)
  })

  it.each([CARD_ID, 'D049_Bookshelf'])('selects both before sources with %s first and derives them again after undo', first => {
    const session = setup({ occupations: 3 })
    const state = session.getState().state
    state.players[0]!.minorPlayed = ['D049_Bookshelf']
    session.loadState(state)
    const second = first === CARD_ID ? 'D049_Bookshelf' : CARD_ID
    const sources = (response: SessionResponse) => {
      expect(response.ok, response.error).toBe(true)
      if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'select-trigger') {
        throw new Error(`Expected before source selection: ${JSON.stringify(response.interaction)}`)
      }
      expect(response.interaction.promptKey).toBe('ui.interactionSelectTrigger')
      return response.interaction.request.options.flatMap(option => option.sourceCard ? [option.sourceCard] : [])
    }
    const finishInOrder = (pending: SessionResponse) => {
      expect(sources(pending)).toEqual([CARD_ID, 'D049_Bookshelf'])
      expect(pending.state.players[0]!.resources).toMatchObject({ food: 0, wood: 1 })
      let response = choose(session, pending, first)
      if (first === CARD_ID) response = choosePaperMaker(session, response, true)
      expect(response.state.players[0]!.resources).toMatchObject({ food: 3, wood: first === CARD_ID ? 0 : 1 })
      expect(response.state.players[0]!.occupationHand).toContain(TARGET)
      expect(sources(response)).toEqual([second])
      response = choose(session, response, second)
      if (second === CARD_ID) response = choosePaperMaker(session, response, true)
      expect(response.state.players[0]!.resources).toMatchObject({ food: 6, wood: 0 })
      response = completeOccupation(session, response)
      expect(response.state.players[0]!.resources).toMatchObject({ food: 5, wood: 0 })
      const gains = response.state.events.filter(event => event.type === 'resource.moved'
        && (event.sourceCardId === CARD_ID || event.sourceCardId === 'D049_Bookshelf'))
      expect(gains).toEqual([
        expect.objectContaining({ sourceCardId: first, resources: { food: 3 } }),
        expect.objectContaining({ sourceCardId: second, resources: { food: 3 } }),
      ])
      expect(response.state.events.filter(event => event.type === 'resource.paid')).toEqual([
        expect.objectContaining({ sourceCardId: CARD_ID, paymentFor: 'cardEffect', resources: { wood: 1 } }),
        expect.objectContaining({ sourceCardId: TARGET, paymentFor: 'occupation', resources: { food: 1 } }),
      ])
      expect(response.state.log.filter(entry => entry.key === 'log.cardEffectGain')).toEqual(expect.arrayContaining([
        expect.objectContaining({ params: expect.objectContaining({ cardId: CARD_ID, gain: { food: 3 } }) }),
        expect.objectContaining({ params: expect.objectContaining({ cardId: 'D049_Bookshelf', gain: { food: 3 } }) }),
      ]))
      return response
    }
    finishInOrder(session.takeAction(0, 'lessons'))
    const undone = session.undoAction()
    expect(undone.ok, undone.error).toBe(true)
    expect(undone.interaction.stateId).toBe('idle')
    expect(undone.state.players[0]!.resources).toMatchObject({ food: 0, wood: 1 })
    expect(undone.state.players[0]!.occupationHand).toContain(TARGET)
    expect(undone.state.players[0]!.occupationPlayed).toHaveLength(3)
    expect(undone.state.events.some(event => event.type === 'resource.moved'
      && (event.sourceCardId === CARD_ID || event.sourceCardId === 'D049_Bookshelf'))).toBe(false)
    finishInOrder(session.takeAction(0, 'lessons'))
  })

  it('resumes the exchange after a nested anytime action and counts each occupation only once', () => {
    const session = setup({ occupations: 2 })
    const state = session.getState().state
    state.players[0]!.occupationPlayed = [CARD_ID, 'D106_WhiskyDistiller']
    state.players[0]!.resources.grain = 1
    session.loadState(state)
    const pending = session.takeAction(0, 'lessons')
    const nested = session.takeAnytimeAction(0, 'D106-whisky-distiller-anytime')
    expect(nested.ok, nested.error).toBe(true)
    expect(nested.state.players[0]!.resources).toMatchObject({ grain: 0, food: 0, wood: 1 })
    if (pending.interaction.stateId !== 'wait') throw new Error('Expected before exchange')
    expect(nested.interaction).toMatchObject({
      stateId: 'wait', playerIndex: 0, promptKey: pending.interaction.promptKey, request: pending.interaction.request,
    })
    const response = completeOccupation(session, choosePaperMaker(session, nested, true))
    expect(response.state.players[0]!.resources).toMatchObject({ food: 1, wood: 0, grain: 0 })
    expect(response.state.events.filter(event => event.type === 'resource.moved' && event.sourceCardId === CARD_ID)).toHaveLength(1)
  })

})
