import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { computeAnimalZones } from '../../shared/domain/animal-zones'

import '../../shared/cards/E/E036_HerbalGarden'

const CARD_ID = 'E036_HerbalGarden'

const setup = (animalCounts: [number, number]) => {
  const session = new GameSession(36036, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  for (const player of state.players) {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
  }
  const player = state.players[0]!
  player.minorHand = [CARD_ID]
  player.resources.wood = 1
  player.resources.sheep = animalCounts[0] + animalCounts[1]
  player.pastures = [
    {
      id: 'pasture-1',
      size: 1,
      tiles: [{ row: 0, col: 0 }],
      stables: 0,
      animalType: animalCounts[0] > 0 ? 'sheep' : null,
      animalCount: animalCounts[0],
    },
    {
      id: 'pasture-2',
      size: 1,
      tiles: [{ row: 0, col: 1 }],
      stables: 0,
      animalType: animalCounts[1] > 0 ? 'sheep' : null,
      animalCount: animalCounts[1],
    },
  ]
  session.loadState(state)
  return session
}

const playCard = (session: GameSession) => {
  let response = session.takeAction(0, 'meeting-place')
  for (let step = 0; step < 12; step += 1) {
    expect(response.ok, response.error).toBe(true)
    if (response.interaction.stateId !== 'wait') return response
    if (response.interaction.request.kind === 'animal-reorg') return response
    const options = response.interaction.request.options ?? []
    const next = options.find((option) => option.value === CARD_ID)
      ?? options.find((option) => option.value.startsWith('action-improvement-'))
      ?? (response.interaction.promptKey === 'prompt.selectPayment' ? options[0] : undefined)
    if (!next) return response
    response = session.resolveChoice(response.interaction.playerIndex, next.value)
  }
  throw new Error('card play did not settle')
}

describe('E036_HerbalGarden session', () => {
  it('does not open reorganization when a pasture is already empty', () => {
    const response = playCard(setup([1, 0]))

    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.interaction.stateId === 'wait' ? response.interaction.request.kind : null)
      .not.toBe('animal-reorg')
  })

  it('keeps a mandatory tagged reorganization pending until a pasture is empty', () => {
    const session = setup([1, 1])
    let response = playCard(session)

    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') throw new Error('expected animal reorganization')
    expect(response.interaction.request.kind).toBe('animal-reorg')
    if (response.interaction.request.kind !== 'animal-reorg') throw new Error('expected animal reorganization')
    const pastureZones = response.interaction.request.zones.filter((zone) => zone.zoneType === 'pasture')
    const groupId = pastureZones[0]!.requiredEmptyZoneGroupIds?.[0]
    expect(groupId).toBeTypeOf('string')
    expect(pastureZones.every((zone) => zone.requiredEmptyZoneGroupIds?.includes(groupId!))).toBe(true)
    expect(pastureZones.map((zone) => zone.capacity)).toEqual([2, 2])

    const before = structuredClone(response.state.players[0]!)
    response = session.resolveChoice(0, 'confirm', { zones: response.interaction.request.zones })
    expect(response.ok).toBe(false)
    expect(response.error).toBe('log.reorganizeFail')
    expect(response.state.players[0]).toEqual(before)
    expect(response.interaction.stateId === 'wait' ? response.interaction.request.kind : null)
      .toBe('animal-reorg')

    response = session.resolveChoice(0, 'cancel')
    expect(response.ok).toBe(false)
    expect(response.error).toBe('log.reorganizeFail')
    expect(response.state.players[0]).toEqual(before)
    expect(response.interaction.stateId === 'wait' ? response.interaction.request.kind : null)
      .toBe('animal-reorg')

    if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'animal-reorg') {
      throw new Error('expected animal reorganization')
    }
    const legalZones = structuredClone(response.interaction.request.zones)
    const first = legalZones.find((zone) => zone.id === 'pasture-1')!
    first.animalType = 'sheep'
    first.animalCount = 2
    const second = legalZones.find((zone) => zone.id === 'pasture-2')!
    second.animalType = null
    second.animalCount = 0
    response = session.resolveChoice(0, 'confirm', { zones: legalZones })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.sheep).toBe(2)
    expect(response.state.players[0]!.pastures.map((pasture) => pasture.animalCount)).toEqual([2, 0])
    expect(computeAnimalZones(response.state.players[0]!, response.state)
      .filter((zone) => zone.zoneType === 'pasture')
      .map((zone) => zone.capacity)).toEqual([2, 2])
  })

  it('moves the only pasture animal to the house through mandatory reorganization', () => {
    const session = setup([1, 0])
    const state = session.getState().state
    state.players[0]!.pastures = state.players[0]!.pastures.slice(0, 1)
    session.loadState(state)

    let response = playCard(session)

    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'animal-reorg') {
      throw new Error('expected animal reorganization')
    }
    expect(response.interaction.request.zones.filter((zone) => zone.zoneType === 'pasture')).toEqual([
      expect.objectContaining({
        id: 'pasture-1',
        animalCount: 1,
        capacity: 2,
        requiredEmptyZoneGroupIds: expect.any(Array),
      }),
    ])
    const zones = structuredClone(response.interaction.request.zones)
    const pasture = zones.find((zone) => zone.id === 'pasture-1')!
    pasture.animalType = null
    pasture.animalCount = 0
    const house = zones.find((zone) => zone.id === 'house')!
    house.animalType = 'sheep'
    house.animalCount = 1

    response = session.resolveChoice(0, 'confirm', { zones })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!).toMatchObject({
      resources: { sheep: 1 },
      houseAnimalType: 'sheep',
      houseAnimalCount: 1,
      pastures: [expect.objectContaining({ animalType: null, animalCount: 0 })],
    })
  })

  it('enforces the E033 and E036 required-empty groups together', () => {
    const session = setup([1, 1])
    const state = session.getState().state
    const player = state.players[0]!
    player.minorPlayed = ['E033_BeaverColony']
    player.resources.sheep = 3
    player.pastures = [
      { ...player.pastures[0]!, id: 'stabled-1', stables: 1 },
      { ...player.pastures[1]!, id: 'stabled-2', stables: 1 },
      {
        id: 'unstabled',
        size: 1,
        tiles: [{ row: 0, col: 2 }],
        stables: 0,
        animalType: 'sheep',
        animalCount: 1,
      },
    ]
    player.stableTiles = [{ row: 0, col: 0 }, { row: 0, col: 1 }]
    session.loadState(state)

    let response = playCard(session)

    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'animal-reorg') {
      throw new Error('expected animal reorganization')
    }
    const pastureZones = response.interaction.request.zones.filter((zone) => zone.zoneType === 'pasture')
    expect(pastureZones.map((zone) => zone.requiredEmptyZoneGroupIds?.length)).toEqual([2, 2, 1])

    const invalidZones = structuredClone(response.interaction.request.zones)
    const secondStabled = invalidZones.find((zone) => zone.id === 'stabled-2')!
    secondStabled.animalType = 'sheep'
    secondStabled.animalCount = 2
    const unstabled = invalidZones.find((zone) => zone.id === 'unstabled')!
    unstabled.animalType = null
    unstabled.animalCount = 0
    response = session.resolveChoice(0, 'confirm', { zones: invalidZones })

    expect(response.ok).toBe(false)
    expect(response.error).toBe('log.reorganizeFail')
    expect(response.interaction.stateId === 'wait' ? response.interaction.request.kind : null)
      .toBe('animal-reorg')

    if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'animal-reorg') {
      throw new Error('expected animal reorganization')
    }
    const legalZones = structuredClone(response.interaction.request.zones)
    const firstStabled = legalZones.find((zone) => zone.id === 'stabled-1')!
    firstStabled.animalType = null
    firstStabled.animalCount = 0
    const legalSecond = legalZones.find((zone) => zone.id === 'stabled-2')!
    legalSecond.animalType = 'sheep'
    legalSecond.animalCount = 2
    response = session.resolveChoice(0, 'confirm', { zones: legalZones })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.sheep).toBe(3)
    expect(response.state.players[0]!.pastures.map((pasture) => pasture.animalCount)).toEqual([0, 2, 1])
  })
})
