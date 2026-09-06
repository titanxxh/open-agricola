import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'

import '../../shared/cards/A/A137_RiverineShepherd'

const CARD_ID = 'A137_RiverineShepherd'
const FILLER = '__test_placeholder__'

const setup = ({ played = true, reed = 3, sheep = 2 } = {}) => {
    const session = new GameSession(5137, undefined, { playerCount: 3 })
    const state = session.getState().state
    stabilizeRandomHands(state.players)
    state.currentPlayerIndex = 0
    state.round = 14
    state.roundPhase = 'work'
    state.players.forEach((candidate) => {
      candidate.minorHand = [FILLER]
      candidate.occupationHand = [FILLER]
      setWorkersAtHome(state, candidate, 2)
    })

    const player = state.players[0]!
    player.occupationHand = played ? [FILLER] : [CARD_ID]
    player.occupationPlayed = played ? [CARD_ID] : []
    player.resources = {
      ...player.resources,
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0,
      sheep: 0, boar: 0, cattle: 0,
    }
    player.houseAnimalType = null
    player.houseAnimalCount = 0
    player.stableAnimals = {}
    player.pastures = [
      {
        id: 'riverine-pasture',
        size: 1,
        tiles: [{ row: 0, col: 1 }],
        stables: 0,
        animalType: null,
        animalCount: 0,
      },
    ]

    state.actionSpaces.find((space) => space.id === 'sheep-market')!.resources.sheep = sheep
    state.actionSpaces.find((space) => space.id === 'reed-bank')!.resources.reed = reed

    session.loadState(state)
    return session
}

const playOccupation = (session: GameSession) => {
  const response = session.takeAction(0, 'lessons')
  expect(response.ok, response.error).toBe(true)
  if (!response.state.players[0]!.occupationHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) => candidate.value === CARD_ID)
  expect(option, JSON.stringify(response.interaction)).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, option!.value)
}

const placeSheep = (session: GameSession, response: SessionResponse) => {
  if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'animal-reorg') {
    return response
  }
  const pasture = response.interaction.request.zones.find((zone) => zone.id === 'riverine-pasture')
  expect(pasture).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, 'confirm', {
    zones: [{
      id: 'riverine-pasture',
      zoneType: 'pasture',
      animalType: 'sheep',
      animalCount: response.state.players[0]!.resources.sheep,
    }],
  })
}

const resolveRiverine = (session: GameSession, initial: SessionResponse, accept: boolean) => {
  let response = initial
  let handled = false
  for (let step = 0; step < 8; step++) {
    if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'animal-reorg') {
      response = placeSheep(session, response)
      continue
    }
    if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'select-trigger') {
      const next = resolveTriggerIfPresent(session, response, CARD_ID)
      if (next === response) break
      response = next
      continue
    }
    if (response.interaction.stateId !== 'wait') break
    const cardOption = response.interaction.request.options?.find((option) =>
      option.sourceCard === CARD_ID && option.value !== '__skip__')
    if (!cardOption) break
    response = session.resolveChoice(
      response.interaction.playerIndex,
      accept ? cardOption.value : '__skip__',
    )
    handled = true
  }
  return { response, handled }
}

describe('A137 Riverine Shepherd parity', () => {
  it('A137 S1: Riverine Shepherd is played as the first occupation without paying food in a three-player game', () => {
    const response = playOccupation(setup({ played: false }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(0)
  })

  it('A137 S2: using Sheep Market may take exactly one reed from Reed Bank', () => {
    const session = setup({ reed: 3, sheep: 1 })

    const { response, handled } = resolveRiverine(session, session.takeAction(0, 'sheep-market'), true)

    expect(handled).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ sheep: 1, reed: 1 })
    expect(response.state.players[0]!.pastures[0]).toMatchObject({
      id: 'riverine-pasture', animalType: 'sheep', animalCount: 1,
    })
    expect(response.state.actionSpaces.find((space) => space.id === 'reed-bank')!.resources.reed).toBe(2)
  })

  it('A137 S3: using Reed Bank may take exactly one sheep from Sheep Market and keep it', () => {
    const session = setup({ reed: 2, sheep: 2 })

    const { response, handled } = resolveRiverine(session, session.takeAction(0, 'reed-bank'), true)

    expect(handled).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ reed: 2, sheep: 1 })
    expect(response.state.players[0]!.pastures[0]).toMatchObject({
      id: 'riverine-pasture', animalType: 'sheep', animalCount: 1,
    })
    expect(response.state.actionSpaces.find((space) => space.id === 'sheep-market')!.resources.sheep).toBe(1)
  })

  it('A137 S4: the extra good may be declined', () => {
    const session = setup({ reed: 3, sheep: 1 })

    const { response, handled } = resolveRiverine(session, session.takeAction(0, 'sheep-market'), false)

    expect(handled).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ sheep: 1, reed: 0 })
    expect(response.state.actionSpaces.find((space) => space.id === 'reed-bank')!.resources.reed).toBe(3)
  })

  it('A137 S5: an empty corresponding space offers no extra good', () => {
    const session = setup({ reed: 0, sheep: 1 })

    const { response, handled } = resolveRiverine(session, session.takeAction(0, 'sheep-market'), true)

    expect(handled).toBe(false)
    expect(response.state.players[0]!.resources).toMatchObject({ sheep: 1, reed: 0 })
  })

  it('A137 S6: a different action space offers no extra good', () => {
    const session = setup({ reed: 3, sheep: 2 })

    const { response, handled } = resolveRiverine(session, session.takeAction(0, 'day-laborer'), true)

    expect(handled).toBe(false)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 2, reed: 0, sheep: 0 })
    expect(response.state.actionSpaces.find((space) => space.id === 'reed-bank')!.resources.reed).toBe(3)
    expect(response.state.actionSpaces.find((space) => space.id === 'sheep-market')!.resources.sheep).toBe(2)
  })
})
