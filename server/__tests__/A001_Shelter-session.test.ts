import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/A/A001_Shelter'

const CARD_ID = 'A001_Shelter'

const setup = (pastureSize: 0 | 1 | 2) => {
  const session = new GameSession(1, undefined, { playerCount: 2 })
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = 1
  state.roundPhase = 'work'
  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.minorHand = [CARD_ID]
  player.resources.wood = 0
  player.stableTiles = []
  player.pastures = pastureSize === 0 ? [] : [{
    id: 'test-pasture',
    size: pastureSize,
    tiles: Array.from({ length: pastureSize }, (_, col) => ({ row: 0, col })),
    stables: 0,
    animalType: null,
    animalCount: 0,
  }]
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

const stableChoice = (response: SessionResponse, accept: boolean) => {
  if (response.interaction.stateId !== 'wait') return undefined
  return response.interaction.request.options?.find((option) => accept
    ? option.value !== '__skip__' && option.value !== 'skip'
    : option.value === '__skip__' || option.value === 'skip')
}

describe('A001 Shelter parity', () => {
  it('A001 S1: Shelter builds one free stable inside a one-space pasture and passes', () => {
    const session = setup(1)
    let response = playMinor(session)
    const accept = stableChoice(response, true)
    expect(accept).toBeDefined()

    response = session.resolveChoice(0, accept!.value)
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return
    expect(response.interaction.request.kind).toBe('farm-select')
    expect(response.interaction.request.farm.selectableTiles).toEqual([{ row: 0, col: 0 }])
    response = session.commitSelectionChoice(0, { stables: [{ row: 0, col: 0 }] })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.stableTiles).toEqual([{ row: 0, col: 0 }])
    expect(response.state.players[0]!.resources.wood).toBe(0)
    expect(response.state.players[1]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.minorPlayed).not.toContain(CARD_ID)
  })

  it('A001 S2: Shelter can decline its free stable and still passes', () => {
    const session = setup(1)
    let response = playMinor(session)
    const decline = stableChoice(response, false)
    expect(decline).toBeDefined()

    response = session.resolveChoice(0, decline!.value)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.stableTiles).toEqual([])
    expect(response.state.players[1]!.minorHand).toContain(CARD_ID)
  })

  it('A001 S3: Shelter with no pasture offers no stable and passes', () => {
    const response = playMinor(setup(0))

    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined)
      .not.toBe(CARD_ID)
    expect(response.state.players[0]!.stableTiles).toEqual([])
    expect(response.state.players[1]!.minorHand).toContain(CARD_ID)
  })

  it('A001 S4: Shelter excludes a two-space pasture from its free stable', () => {
    const response = playMinor(setup(2))

    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined)
      .not.toBe(CARD_ID)
    expect(response.state.players[0]!.stableTiles).toEqual([])
    expect(response.state.players[1]!.minorHand).toContain(CARD_ID)
  })
})
