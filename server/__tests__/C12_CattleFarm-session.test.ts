import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { computeAnimalZones } from '../../shared/domain/animal-zones'
import { setWorkersAtHome } from '../../shared/domain/player'

import '../../shared/cards/C/C012_CattleFarm'

const CARD_ID = 'C012_CattleFarm'
const FILLER = '__test_placeholder__'

describe('C012_CattleFarm session', () => {
  const setup = (pastureCount: number, { played = true, wood = 1 } = {}) => {
    const session = new GameSession()
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1
    state.availableMajorImprovements = []
    state.players.forEach((candidate) => {
      setWorkersAtHome(state, candidate, 2)
      candidate.minorHand = [FILLER]
      candidate.occupationHand = [FILLER]
      candidate.resources.food = 20
    })

    const player = state.players[0]!
    player.minorHand = played ? [FILLER] : [CARD_ID]
    player.minorPlayed = played ? [CARD_ID] : []
    player.resources.wood = wood

    // Set up pastures
    player.pastures = []
    for (let i = 0; i < pastureCount; i++) {
      player.pastures.push({
        id: `p${i + 1}`,
        size: 1,
        tiles: [{ row: 0, col: i }],
        stables: 0,
        animalType: null,
        animalCount: 0,
      })
    }

    session.loadState(state)
    return session
  }

  const play = (session: GameSession) => {
    let response = session.takeAction(0, 'major-improvement')
    for (let depth = 0; depth < 3 && response.state.players[0]!.minorHand.includes(CARD_ID); depth++) {
      if (response.interaction.stateId !== 'wait') break
      const options = response.interaction.request.options ?? []
      const option = options.find((candidate) => candidate.value === CARD_ID)
        ?? options.find((candidate) => candidate.value.startsWith('action-improvement-'))
      if (!option) break
      response = session.resolveChoice(response.interaction.playerIndex, option.value)
    }
    return response
  }

  const openReorganization = (session: GameSession, resources: { sheep?: number; cattle?: number }) => {
    const response = session.devSetResources(0, resources)
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'animal-reorg' } })
    if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'animal-reorg') {
      throw new Error('expected native animal reorganization')
    }
    return response
  }

  const assignment = (
    response: ReturnType<GameSession['getState']>, zoneId: string,
    animalType: 'sheep' | 'cattle', animalCount: number,
  ) => {
    if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'animal-reorg') {
      throw new Error('expected native animal reorganization')
    }
    const zone = response.interaction.request.zones.find((candidate) => candidate.id === zoneId)
    expect(zone).toBeDefined()
    return { ...zone!, animalType, animalCount, animalCounts: { [animalType]: animalCount } }
  }

  it('C012 S1: paying one wood plays Cattle Farm', () => {
    const response = play(setup(0, { played: false, wood: 1 }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.wood).toBe(0)
  })

  it('C012 S2: lacking wood keeps Cattle Farm unavailable', () => {
    const response = play(setup(0, { played: false, wood: 0 }))

    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.minorPlayed).not.toContain(CARD_ID)
    expect(response.state.players[0]!.resources.wood).toBe(0)
  })

  it('C012 S3: with no pasture Cattle Farm exposes no animal zone', () => {
    const response = openReorganization(setup(0), { sheep: 1, cattle: 1 })

    expect(response.interaction.request.zones.some((zone) => zone.id === `card:${CARD_ID}`)).toBe(false)
  })

  it('C012 S4: one pasture lets Cattle Farm hold one cattle', () => {
    const session = setup(1)
    const pending = openReorganization(session, { sheep: 1, cattle: 1 })
    expect(pending.interaction.request.zones.find((zone) => zone.id === `card:${CARD_ID}`))
      .toMatchObject({ capacity: 1, allowedAnimalType: 'cattle' })

    const response = session.resolveChoice(0, 'confirm', [
      assignment(pending, `card:${CARD_ID}`, 'cattle', 1),
      assignment(pending, 'house', 'sheep', 1),
    ] as unknown as Record<string, unknown>)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.extraData?.animalCounts).toEqual({ cattle: 1 })
  })

  it('C012 S5: two pastures let Cattle Farm hold two cattle', () => {
    const session = setup(2)
    const pending = openReorganization(session, { sheep: 1, cattle: 2 })
    expect(pending.interaction.request.zones.find((zone) => zone.id === `card:${CARD_ID}`)?.capacity).toBe(2)

    const response = session.resolveChoice(0, 'confirm', [
      assignment(pending, `card:${CARD_ID}`, 'cattle', 2),
      assignment(pending, 'house', 'sheep', 1),
    ] as unknown as Record<string, unknown>)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.extraData?.animalCounts).toEqual({ cattle: 2 })
  })

  it('C012 S6: assigning sheep to Cattle Farm is rejected and a legal retry succeeds', () => {
    const session = setup(1)
    const pending = openReorganization(session, { sheep: 1, cattle: 1 })

    const rejected = session.resolveChoice(0, 'confirm', [
      assignment(pending, `card:${CARD_ID}`, 'sheep', 1),
      assignment(pending, 'house', 'cattle', 1),
    ] as unknown as Record<string, unknown>)
    expect(rejected.ok).toBe(false)
    expect(rejected.state.players[0]!.resources).toMatchObject({ sheep: 1, cattle: 1 })

    const response = session.resolveChoice(0, 'confirm', [
      assignment(pending, `card:${CARD_ID}`, 'cattle', 1),
      assignment(pending, 'house', 'sheep', 1),
    ] as unknown as Record<string, unknown>)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.extraData?.animalCounts).toEqual({ cattle: 1 })
  })

  it('C012 S7: assigning cattle beyond pasture count is accepted but clipped to capacity', () => {
    const session = setup(1)
    const pending = openReorganization(session, { sheep: 1, cattle: 2 })

    const rejected = session.resolveChoice(0, 'confirm', [
      assignment(pending, `card:${CARD_ID}`, 'cattle', 2),
      assignment(pending, 'house', 'sheep', 1),
    ] as unknown as Record<string, unknown>)
    expect(rejected.ok).toBe(true)
    expect(rejected.state.players[0]!.resources).toMatchObject({ sheep: 1, cattle: 1 })
    expect(rejected.state.players[0]!.cardStates[CARD_ID]?.extraData?.animalCounts)
      .toEqual({ cattle: 1 })
    expect(rejected.interaction.stateId).toBe('idle')
  })

  it('card zone exists with capacity equal to pasture count', () => {
    const session = setup(2)
    const state = session.getState().state
    const player = state.players[0]!

    const zones = computeAnimalZones(player)
    const cardZone = zones.find(z => z.id === 'card:C012_CattleFarm')
    expect(cardZone).toBeDefined()
    expect(cardZone!.zoneType).toBe('card')
    expect(cardZone!.capacity).toBe(2)
    expect(cardZone!.animalType).toBe('cattle')
  })

  it('no zone when player has 0 pastures', () => {
    const session = setup(0)
    const state = session.getState().state
    const player = state.players[0]!

    const zones = computeAnimalZones(player)
    const cardZone = zones.find(z => z.id === 'card:C012_CattleFarm')
    expect(cardZone).toBeUndefined()
  })

  it('capacity scales with pasture count', () => {
    const session = setup(4)
    const state = session.getState().state
    const player = state.players[0]!

    const zones = computeAnimalZones(player)
    const cardZone = zones.find(z => z.id === 'card:C012_CattleFarm')
    expect(cardZone).toBeDefined()
    expect(cardZone!.capacity).toBe(4)
  })

  it('rejects non-cattle assignments submitted for its card zone', () => {
    const session = setup(1)

    let resp = session.devSetResources(0, { sheep: 1, cattle: 1 })
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.request.kind).toBe('animal-reorg')
    const beforeInteraction = resp.interaction
    const before = session.getState()

    resp = session.resolveChoice(0, 'confirm', {
      zones: [
        {
          id: 'card:C012_CattleFarm',
          zoneType: 'card',
          cardId: 'C012_CattleFarm',
          animalType: 'sheep',
          animalCount: 1,
          animalCounts: { sheep: 1 },
        },
      ],
    })

    expect(resp.ok).toBe(false)
    expect(resp.state).toEqual(before.state)
    expect(resp.interaction).toMatchObject({
      stateId: 'wait',
      playerIndex: beforeInteraction.playerIndex,
      request: beforeInteraction.request,
    })
  })
})
