import { type SessionResponse } from '../game/authoritative-session'
import type { AnimalType } from '../../shared/contract/types'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'

import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getRegisteredCardListeners, executeCardListener } from '../../shared/cards/card-listeners'
import type { CardListenerContext } from '../../shared/cards/card-listeners'

import '../../shared/cards/B/B168_PastureMaster'
import { mkActionSpace } from '../../shared/cards/__tests__/fixtures'

const CARD_ID = 'B168_PastureMaster'

const findListener = (id: string) =>
  getRegisteredCardListeners().find((l) => l.id === id)

describe('B168_PastureMaster session', () => {
  const createBaseState = () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    return state
  }

  it('gains 2 food on renovate when no pastures with stables', () => {
    const listener = findListener('B168-pasture-master-after-renovate')
    expect(listener).toBeDefined()

    const state = createBaseState()
    const player = state.players[0]!
    player.occupationPlayed = [CARD_ID]
    player.pastures = []

    const result = executeCardListener(listener!, {
      state,
      player,
      space: mkActionSpace({ id: 'renovate-house' }),
      actionId: 'renovate-house',
      phase: 'after',
      result: { type: 'ok' },
    } as CardListenerContext)

    expect(result).toBeDefined()
    expect(result!.flow?.type).toBe('leaf')
    if (result!.flow?.type === 'leaf') {
      expect(result!.flow.params).toEqual({ food: 2 })
    }
  })

  it('gains 2 food + 1 sheep when pasture with stable has sheep', () => {
    const listener = findListener('B168-pasture-master-after-renovate')
    expect(listener).toBeDefined()

    const state = createBaseState()
    const player = state.players[0]!
    player.occupationPlayed = [CARD_ID]
    player.pastures = [
      {
        id: 'p1',
        size: 2,
        tiles: [{ row: 0, col: 2 }, { row: 0, col: 3 }],
        stables: 1,
        animalType: 'sheep',
        animalCount: 2,
      },
    ]

    const result = executeCardListener(listener!, {
      state,
      player,
      space: mkActionSpace({ id: 'renovate-house' }),
      actionId: 'renovate-house',
      phase: 'after',
      result: { type: 'ok' },
    } as CardListenerContext)

    expect(result).toBeDefined()
    expect(result!.flow?.type).toBe('leaf')
    if (result!.flow?.type === 'leaf') {
      expect(result!.flow.params).toEqual({ food: 2, sheep: 1 })
    }
  })

  it('gains animals from multiple pastures with stables', () => {
    const listener = findListener('B168-pasture-master-after-renovate')
    expect(listener).toBeDefined()

    const state = createBaseState()
    const player = state.players[0]!
    player.occupationPlayed = [CARD_ID]
    player.pastures = [
      {
        id: 'p1',
        size: 2,
        tiles: [{ row: 0, col: 2 }, { row: 0, col: 3 }],
        stables: 1,
        animalType: 'sheep',
        animalCount: 3,
      },
      {
        id: 'p2',
        size: 1,
        tiles: [{ row: 1, col: 2 }],
        stables: 1,
        animalType: 'boar',
        animalCount: 1,
      },
      {
        id: 'p3',
        size: 1,
        tiles: [{ row: 2, col: 2 }],
        stables: 0, // no stable
        animalType: 'cattle',
        animalCount: 2,
      },
    ]

    const result = executeCardListener(listener!, {
      state,
      player,
      space: mkActionSpace({ id: 'renovate-house' }),
      actionId: 'renovate-house',
      phase: 'after',
      result: { type: 'ok' },
    } as CardListenerContext)

    expect(result).toBeDefined()
    expect(result!.flow?.type).toBe('leaf')
    if (result!.flow?.type === 'leaf') {
      // 2 food + 1 sheep (from p1 with stable) + 1 boar (from p2 with stable)
      // p3 has no stable, so no bonus cattle
      expect(result!.flow.params).toEqual({ food: 2, sheep: 1, boar: 1 })
    }
  })


  it('skips pastures with stables but no animals', () => {
    const listener = findListener('B168-pasture-master-after-renovate')
    expect(listener).toBeDefined()

    const state = createBaseState()
    const player = state.players[0]!
    player.occupationPlayed = [CARD_ID]
    player.pastures = [
      {
        id: 'p1',
        size: 2,
        tiles: [{ row: 0, col: 2 }, { row: 0, col: 3 }],
        stables: 1,
        animalType: null,
        animalCount: 0,
      },
    ]

    const result = executeCardListener(listener!, {
      state,
      player,
      space: mkActionSpace({ id: 'renovate-house' }),
      actionId: 'renovate-house',
      phase: 'after',
      result: { type: 'ok' },
    } as CardListenerContext)

    expect(result).toBeDefined()
    expect(result!.flow?.type).toBe('leaf')
    if (result!.flow?.type === 'leaf') {
      // Only 2 food, no animals since pasture is empty
      expect(result!.flow.params).toEqual({ food: 2 })
    }
  })
})

describe('B168 Pasture Master parity', () => {
  const CARD_ID = 'B168_PastureMaster'

  const FILLER = '__test_placeholder__'

  type PastureFixture = {
    id: string
    row: number
    col: number
    stable: boolean
    animalType: AnimalType | null
    animalCount: number
  }

  const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
    ? response.interaction.request.options ?? []
    : []

  const setup = ({ played = true, pastures = [] }: {
    played?: boolean
    pastures?: PastureFixture[]
  } = {}) => {
    const session = new GameSession(6168, undefined, { playerCount: 4 })
    const state = session.getState().state
    stabilizeRandomHands(state.players)
    state.currentPlayerIndex = 0
    state.round = 14
    state.roundPhase = 'work'
    state.roundActionOrder = [
      'house-redevelopment',
      ...state.roundActionOrder.filter((id) => id !== 'house-redevelopment'),
    ]
    state.actionSpaces.forEach((space) => { space.takenBy = [] })
    state.players.forEach((player, index) => {
      setWorkersAtHome(state, player, index === 0 ? 2 : 0)
      player.minorHand = [FILLER]
      player.occupationHand = [FILLER]
      player.minorPlayed = []
      player.occupationPlayed = []
      player.improvements = []
      player.cardStates = {}
      player.pastures = []
      player.stableTiles = []
      player.stableAnimals = {}
      player.houseAnimalType = null
      player.houseAnimalCount = 0
      Object.assign(player.resources, {
        wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0,
        sheep: 0, boar: 0, cattle: 0, begging: 0,
      })
    })
    const owner = state.players[0]!
    owner.occupationHand = played ? [FILLER] : [CARD_ID]
    owner.occupationPlayed = played ? [CARD_ID] : []
    owner.houseType = 'wood'
    owner.rooms = 2
    owner.roomTiles = [{ row: 0, col: 0 }, { row: 1, col: 0 }]
    owner.resources.clay = 2
    owner.resources.reed = 1
    owner.pastures = pastures.map((pasture) => ({
      id: pasture.id,
      size: 1,
      tiles: [{ row: pasture.row, col: pasture.col }],
      stables: pasture.stable ? 1 : 0,
      animalType: pasture.animalType,
      animalCount: pasture.animalCount,
    }))
    owner.stableTiles = pastures
      .filter((pasture) => pasture.stable)
      .map((pasture) => ({ row: pasture.row, col: pasture.col }))
    for (const pasture of pastures) {
      if (pasture.animalType) owner.resources[pasture.animalType] += pasture.animalCount
    }
    session.loadState(state)
    return session
  }

  const renovate = (
    session: GameSession,
    placements: Partial<Record<string, { type: AnimalType; count: number }>> = {},
  ) => {
    let response = session.takeAction(0, 'house-redevelopment')
    for (let remaining = 16; remaining > 0 && response.interaction.stateId === 'wait'; remaining -= 1) {
      if (response.interaction.promptKey === 'ui.interactionChooseRenovationTarget') {
        response = session.resolveChoice(response.interaction.playerIndex, 'clay')
        continue
      }
      if (response.interaction.request.kind === 'select-trigger') {
        response = resolveTriggerIfPresent(session, response, CARD_ID)
        continue
      }
      if (response.interaction.request.kind === 'animal-reorg') {
        const zones = response.interaction.request.zones.map((zone) => {
          const placement = placements[zone.id]
          return placement
            ? { ...zone, animalType: placement.type, animalCount: placement.count }
            : { ...zone, animalType: null, animalCount: 0 }
        })
        response = session.resolveChoice(response.interaction.playerIndex, 'confirm', { zones })
        continue
      }
      const skip = options(response).find((option) => option.value === '__skip__' || option.value === 'skip')
      if (skip) {
        response = session.resolveChoice(response.interaction.playerIndex, skip.value)
        continue
      }
      break
    }
    return response
  }

  it('B168 S2: renovating without a stable pasture gains only two food', () => {
    const response = renovate(setup())

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]).toMatchObject({
      houseType: 'clay', resources: { food: 2, sheep: 0, boar: 0, cattle: 0 },
    })
  })

  it('B168 S3: renovating adds one sheep to a stable pasture already containing sheep', () => {
    const session = setup({ pastures: [{
      id: 'sheep-pasture', row: 0, col: 2, stable: true, animalType: 'sheep', animalCount: 1,
    }] })

    const response = renovate(session, { 'sheep-pasture': { type: 'sheep', count: 2 } })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 2, sheep: 2 })
    expect(response.state.players[0]!.pastures[0]).toMatchObject({
      id: 'sheep-pasture', animalType: 'sheep', animalCount: 2,
    })
  })

  it('B168 S4: renovating adds the respective animal in each occupied stable pasture only', () => {
    const session = setup({ pastures: [
      { id: 'sheep-pasture', row: 0, col: 2, stable: true, animalType: 'sheep', animalCount: 1 },
      { id: 'boar-pasture', row: 1, col: 2, stable: true, animalType: 'boar', animalCount: 1 },
      { id: 'cattle-pasture', row: 2, col: 2, stable: false, animalType: 'cattle', animalCount: 1 },
    ] })

    const response = renovate(session, {
      'sheep-pasture': { type: 'sheep', count: 2 },
      'boar-pasture': { type: 'boar', count: 2 },
      'cattle-pasture': { type: 'cattle', count: 1 },
    })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({
      food: 2, sheep: 2, boar: 2, cattle: 1,
    })
  })

  it('B168 S5: an empty stable pasture grants no animal when renovating', () => {
    const session = setup({ pastures: [{
      id: 'empty-pasture', row: 0, col: 2, stable: true, animalType: null, animalCount: 0,
    }] })

    const response = renovate(session)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({
      food: 2, sheep: 0, boar: 0, cattle: 0,
    })
  })
})
