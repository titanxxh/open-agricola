import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'

import '../../shared/cards/A/A001_Shelter'
import '../../shared/cards/A/A037_Bucksaw'
import '../../shared/cards/D/D152_Patron'
import '../../shared/cards/B/B049_Scales'

const CARD_ID = 'B049_Scales'
const PLACEHOLDER = '__test_placeholder__'

const setup = (opts: {
  minorHand?: string[]
  occupationHand?: string[]
  minorPlayed?: string[]
  occupationPlayed?: string[]
  availableMajorImprovements?: string[]
  wood?: number
  reed?: number
  stone?: number
  food?: number
}) => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 1
  state.roundPhase = 'work'

  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  setWorkersAtHome(state, state.players[1]!, 0)
  player.minorPlayed = opts.minorPlayed ?? [CARD_ID]
  player.occupationPlayed = opts.occupationPlayed ?? []
  player.minorHand = opts.minorHand ?? [PLACEHOLDER]
  player.occupationHand = opts.occupationHand ?? [PLACEHOLDER]
  player.resources = {
    ...player.resources,
    wood: opts.wood ?? 0,
    reed: opts.reed ?? 0,
    stone: opts.stone ?? 0,
    food: opts.food ?? 0,
  }
  state.players[1]!.minorHand = [PLACEHOLDER]
  state.players[1]!.occupationHand = [PLACEHOLDER]
  if (opts.availableMajorImprovements) {
    state.availableMajorImprovements = opts.availableMajorImprovements
  }

  session.loadState(state)
  return session
}

const playedEvents = (state: ReturnType<GameSession['getState']>['state'], cardId: string) =>
  state.events.filter((event) => event.type === 'card.played' && event.cardId === cardId)

const chooseMeetingPlaceMinor = (session: GameSession, cardId: string) => {
  let resp = session.takeAction(0, 'meeting-place')
  expect(resp.ok).toBe(true)
  expect(resp.interaction.stateId).toBe('wait')
  if (resp.interaction.stateId !== 'wait') return resp

  const improvement = resp.interaction.options?.find(
    (option) => option.value === 'action-improvement-1',
  )
  expect(improvement).toBeDefined()

  resp = session.resolveChoice(0, improvement!.value)
  expect(resp.ok).toBe(true)
  expect(resp.interaction.stateId).toBe('wait')
  if (resp.interaction.stateId !== 'wait') return resp

  resp = session.resolveChoice(0, cardId)
  expect(resp.ok).toBe(true)
  return resp
}

const finishOptionalPrompts = (
  session: GameSession,
  response: ReturnType<GameSession['takeAction']>,
) => {
  let resp = response
  let guard = 10
  while (resp.interaction.stateId === 'wait' && guard > 0) {
    guard -= 1
    const skip = resp.interaction.options?.find(
      (option) => option.value === '__skip__' || option.value === 'skip',
    )
    if (!skip) break
    resp = session.resolveChoice(resp.interaction.playerIndex ?? 0, skip.value)
    expect(resp.ok).toBe(true)
  }
  expect(guard).toBeGreaterThan(0)
  return resp
}

describe('B049_Scales session', () => {
  it('gains 2 food after a normal improvement makes occupation and improvement counts equal', () => {
    const session = setup({
      minorHand: ['A037_Bucksaw', 'C069_LandConsolidation'],
      minorPlayed: [CARD_ID],
      occupationPlayed: ['A123_FrameBuilder', 'D152_Patron'],
      wood: 1,
      food: 0,
    })

    const resp = finishOptionalPrompts(
      session,
      chooseMeetingPlaceMinor(session, 'A037_Bucksaw'),
    )

    const player = resp.state.players[0]!
    expect(player.minorPlayed).toContain('A037_Bucksaw')
    expect(player.resources.food).toBe(2)
    expect(playedEvents(resp.state, 'A037_Bucksaw')).toContainEqual(expect.objectContaining({
      type: 'card.played',
      actorPlayerId: player.id,
      cardId: 'A037_Bucksaw',
      cardType: 'minor',
      sourceActionId: 'improvement',
    }))
  })

  it('does not gain food for a passing improvement even when counts remain equal', () => {
    const session = setup({
      minorHand: ['A001_Shelter', 'C069_LandConsolidation'],
      minorPlayed: [CARD_ID],
      occupationPlayed: ['A123_FrameBuilder'],
      food: 0,
    })

    const resp = finishOptionalPrompts(
      session,
      chooseMeetingPlaceMinor(session, 'A001_Shelter'),
    )

    const player = resp.state.players[0]!
    expect(player.minorPlayed).not.toContain('A001_Shelter')
    expect(resp.state.players[1]!.minorHand).toContain('A001_Shelter')
    expect(player.occupationPlayed.length).toBe(
      player.minorPlayed.length + player.improvements.length,
    )
    expect(player.resources.food).toBe(0)
    expect(playedEvents(resp.state, 'A001_Shelter')).toHaveLength(0)
  })

  it('gains 2 food after a major improvement makes occupation and improvement counts equal', () => {
    const session = setup({
      minorPlayed: [CARD_ID],
      occupationPlayed: ['A123_FrameBuilder', 'D152_Patron'],
      availableMajorImprovements: ['Major_Basket'],
      reed: 2,
      stone: 2,
      food: 0,
    })

    const resp = session.takeAction(0, 'major-improvement')
    expect(resp.ok).toBe(true)

    const player = resp.state.players[0]!
    expect(player.improvements).toContain('Major_Basket')
    expect(player.resources.food).toBe(2)
    expect(playedEvents(resp.state, 'Major_Basket')).toContainEqual(expect.objectContaining({
      type: 'card.played',
      actorPlayerId: player.id,
      cardId: 'Major_Basket',
      cardType: 'major',
      sourceActionId: 'improvement',
    }))
  })

  it('gains 2 food after playing an occupation makes occupation and improvement counts equal', () => {
    const session = setup({
      minorPlayed: [CARD_ID],
      occupationPlayed: [],
      occupationHand: ['A123_FrameBuilder'],
      food: 0,
    })

    const resp = session.takeAction(0, 'lessons')
    expect(resp.ok).toBe(true)

    const player = resp.state.players[0]!
    expect(player.occupationPlayed).toContain('A123_FrameBuilder')
    expect(player.resources.food).toBe(2)
    expect(playedEvents(resp.state, 'A123_FrameBuilder')).toContainEqual(expect.objectContaining({
      type: 'card.played',
      actorPlayerId: player.id,
      cardId: 'A123_FrameBuilder',
      cardType: 'occupation',
      sourceActionId: 'occupation',
    }))
  })
})
