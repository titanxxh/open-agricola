import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/A/A037_Bucksaw'

const CARD_ID = 'A037_Bucksaw'

const setup = ({ wood, inHand = false }: { wood: number; inHand?: boolean }) => {
  const session = new GameSession(37, undefined, { playerCount: 2 })
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = inHand ? 1 : 6
  state.roundPhase = 'work'
  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.minorHand = inHand ? [CARD_ID] : ['__test_placeholder__']
  player.minorPlayed = inHand ? [] : [CARD_ID]
  player.houseType = 'wood'
  player.resources = {
    ...player.resources,
    wood,
    clay: inHand ? 0 : 2,
    reed: inHand ? 0 : 1,
    grain: 0,
  }
  session.loadState(state)
  return session
}

const openMinorPrompt = (session: GameSession) => {
  let response = session.takeAction(0, 'meeting-place')
  expect(response.ok, response.error).toBe(true)
  if (response.interaction.stateId !== 'wait') return response
  if (response.interaction.request.options?.some((option) => option.value === CARD_ID)) return response
  const improvement = response.interaction.request.options?.find((option) =>
    option.value.startsWith('action-improvement-'),
  )
  if (improvement) response = session.resolveChoice(0, improvement.value)
  return response
}

const playMinor = (session: GameSession) => {
  const response = openMinorPrompt(session)
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  const option = response.interaction.stateId === 'wait'
    ? response.interaction.request.options?.find((candidate) => candidate.value === CARD_ID)
    : undefined
  expect(option).toBeDefined()
  return session.resolveChoice(0, option!.value)
}

const openBucksawPrompt = (session: GameSession) => {
  let response = session.takeAction(0, 'house-redevelopment')
  expect(response.ok, response.error).toBe(true)
  if (
    response.interaction.stateId === 'wait'
    && response.interaction.promptKey === 'ui.interactionChooseRenovationTarget'
  ) response = session.resolveChoice(0, 'clay')
  return response
}

const resolveBucksaw = (session: GameSession, response: SessionResponse, accept: boolean) => {
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  expect(response.interaction.sourceCard).toBe(CARD_ID)
  const option = response.interaction.request.options?.find((candidate) => accept
    ? candidate.value !== '__skip__' && candidate.value !== 'skip'
    : candidate.value === '__skip__' || candidate.value === 'skip')
  expect(option).toBeDefined()
  return session.resolveChoice(0, option!.value)
}

describe('A037 Bucksaw parity', () => {
  it('A037 S1: playing Bucksaw costs one wood and keeps the non-passing card', () => {
    const response = playMinor(setup({ wood: 1, inHand: true }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(0)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[1]!.minorHand).not.toContain(CARD_ID)
  })

  it('A037 S2: accepting after renovation pays one wood for grain and bonus point', () => {
    const session = setup({ wood: 1 })

    const response = resolveBucksaw(session, openBucksawPrompt(session), true)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]).toMatchObject({
      houseType: 'clay',
      resources: { wood: 0, clay: 0, reed: 0, grain: 1 },
    })
    expect(response.state.players[0]!.cardStates?.[CARD_ID]?.counters?.bonusVp).toBe(1)
  })

  it('A037 S3: declining after renovation preserves the extra wood and grants nothing', () => {
    const session = setup({ wood: 1 })

    const response = resolveBucksaw(session, openBucksawPrompt(session), false)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]).toMatchObject({
      houseType: 'clay',
      resources: { wood: 1, clay: 0, reed: 0, grain: 0 },
    })
    expect(response.state.players[0]!.cardStates?.[CARD_ID]?.counters?.bonusVp ?? 0).toBe(0)
  })

  it('A037 S4: renovation without extra wood grants no Bucksaw reward', () => {
    const session = setup({ wood: 0 })

    const response = openBucksawPrompt(session)

    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined)
      .not.toBe(CARD_ID)
    expect(response.state.players[0]).toMatchObject({
      houseType: 'clay',
      resources: { wood: 0, clay: 0, reed: 0, grain: 0 },
    })
    expect(response.state.players[0]!.cardStates?.[CARD_ID]?.counters?.bonusVp ?? 0).toBe(0)
  })

  it('A037 S5: a non-renovation action does not trigger Bucksaw', () => {
    const session = setup({ wood: 1 })
    const state = session.getState().state
    state.players[0]!.resources.clay = 0
    state.players[0]!.resources.reed = 0
    session.loadState(state)

    const response = session.takeAction(0, 'day-laborer')

    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined)
      .not.toBe(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 1, grain: 0 })
    expect(response.state.players[0]!.cardStates?.[CARD_ID]?.counters?.bonusVp ?? 0).toBe(0)
  })
})
