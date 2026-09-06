import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/A/A011_MudPatch'

const CARD_ID = 'A011_MudPatch'
const FILLER = '__test_placeholder__'

const setup = ({
  played = true,
  emptyFields = 1,
  plantedFields = 0,
  market = 'pig-market',
  animal = 'boar',
  count = 1,
}: {
  played?: boolean
  emptyFields?: number
  plantedFields?: number
  market?: 'pig-market' | 'sheep-market'
  animal?: 'boar' | 'sheep'
  count?: number
} = {}) => {
  const session = new GameSession(5011, undefined, { playerCount: 2 })
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = 14
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.minorPlayed = played ? [CARD_ID] : []
  player.minorHand = played ? [FILLER] : [CARD_ID]
  player.occupationHand = [FILLER]
  player.resources = { ...player.resources, wood: 0, boar: 0, sheep: 0, cattle: 0 }
  const positions = [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 }]
  player.fields = positions.slice(0, emptyFields + plantedFields).map((position, index) => ({
    ...position,
    stacks: index < emptyFields ? [] : [{ kind: 'grain' as const, remaining: 2 }],
  }))
  player.houseAnimalType = null
  player.houseAnimalCount = 0
  player.stableAnimals = {}
  player.pastures = []
  const opponent = state.players[1]!
  setWorkersAtHome(state, opponent, 2)
  opponent.minorHand = [FILLER]
  opponent.occupationHand = [FILLER]
  const space = state.actionSpaces.find((candidate) => candidate.id === market)
  if (!space) throw new Error(`missing action space ${market}`)
  space.takenBy = []
  space.resources[animal] = count
  session.loadState(state)
  return session
}

const playMinor = (session: GameSession): SessionResponse => {
  let response = session.takeAction(0, 'major-improvement')
  expect(response.ok, response.error).toBe(true)
  if (response.interaction.stateId === 'wait') {
    const enter = response.interaction.request.options?.find((option) =>
      option.value.startsWith('action-improvement-'))
    if (enter) response = session.resolveChoice(0, enter.value)
  }
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const card = response.interaction.request.options?.find((option) => option.value === CARD_ID)
  expect(card).toBeDefined()
  return session.resolveChoice(0, card!.value)
}

const expectReorganization = (response: SessionResponse) => {
  expect(response.ok, response.error).toBe(true)
  expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'animal-reorg' } })
  if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'animal-reorg') {
    throw new Error('expected animal reorganization')
  }
  return response
}

const mudPatchZone = (response: SessionResponse) => {
  const pending = expectReorganization(response)
  const zone = pending.interaction.request.zones.find((candidate) => candidate.id === `card:${CARD_ID}`)
  expect(zone).toBeDefined()
  return zone!
}

describe('A011 Mud Patch parity', () => {
  it('A011 S1: playing Mud Patch immediately gains one boar that an empty field can hold', () => {
    const session = setup({ played: false })
    let response = playMinor(session)
    const zone = mudPatchZone(response)
    expect(zone).toMatchObject({ capacity: 1, allowedAnimalType: 'boar' })

    response = session.resolveChoice(0, 'confirm', [
      { id: `card:${CARD_ID}`, zoneType: 'card', animalType: 'boar', animalCount: 1 },
    ] as unknown as Record<string, unknown>)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.boar).toBe(1)
  })

  it('A011 S2: two empty fields can hold two boars collected from Pig Market', () => {
    const session = setup({ emptyFields: 2, count: 2 })
    let response = session.takeAction(0, 'pig-market')
    expect(mudPatchZone(response)).toMatchObject({ capacity: 2, allowedAnimalType: 'boar' })

    response = session.resolveChoice(0, 'confirm', [
      { id: `card:${CARD_ID}`, zoneType: 'card', animalType: 'boar', animalCount: 2 },
    ] as unknown as Record<string, unknown>)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.boar).toBe(2)
  })

  it('A011 S3: a planted field adds no Mud Patch boar capacity', () => {
    const session = setup({ emptyFields: 1, plantedFields: 1, count: 2 })
    let response = session.takeAction(0, 'pig-market')
    expect(mudPatchZone(response)).toMatchObject({ capacity: 1, allowedAnimalType: 'boar' })

    response = session.resolveChoice(0, 'confirm', [
      { id: 'house', zoneType: 'house', animalType: 'boar', animalCount: 1 },
      { id: `card:${CARD_ID}`, zoneType: 'card', animalType: 'boar', animalCount: 1 },
    ] as unknown as Record<string, unknown>)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.boar).toBe(2)
  })

  it('A011 S4: an empty field cannot hold sheep through Mud Patch', () => {
    const session = setup({ market: 'sheep-market', animal: 'sheep', count: 2 })
    let response = session.takeAction(0, 'sheep-market')
    expect(mudPatchZone(response)).toMatchObject({ capacity: 1, allowedAnimalType: 'boar' })

    response = session.resolveChoice(0, 'confirm', [
      { id: 'house', zoneType: 'house', animalType: 'sheep', animalCount: 1 },
    ] as unknown as Record<string, unknown>)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.sheep).toBe(1)
  })
})
