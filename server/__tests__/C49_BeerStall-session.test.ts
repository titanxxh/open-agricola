import { type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getCardEffect } from '../../shared/cards/card-effects'

import '../../shared/cards/C/C049_BeerStall'
import type { ActionFlow } from '../../shared/contract/types'

const CARD_ID = 'C049_BeerStall'

describe('C049_BeerStall session', () => {
  it('offers optional exchange when player has grain and empty unfenced stable', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)

    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.resources.grain = 3
    // Add an unfenced stable (not inside any pasture)
    player.stableTiles = [{ row: 2, col: 2 }]
    player.pastures = []
    player.stableAnimals = {}

    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    expect(effect).toBeDefined()
    const flow = effect!.onHarvestFeedingPhase!(state, player)
    expect(flow).toBeDefined()
    // With 1 empty stable, should be a single seq
    expect(flow!.type).toBe('seq')
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).optional).toBe(true)
  })

  it('returns undefined when player has no grain', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)

    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.resources.grain = 0
    player.stableTiles = [{ row: 2, col: 2 }]
    player.pastures = []
    player.stableAnimals = {}

    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    const flow = effect!.onHarvestFeedingPhase!(state, player)
    expect(flow).toBeUndefined()
  })

  it('returns undefined when no unfenced stables', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)

    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.resources.grain = 3
    // All stables are inside pastures
    player.stableTiles = [{ row: 2, col: 2 }]
    player.pastures = [{
      id: 'p0',
      size: 1,
      stables: 1,
      animalType: null,
      animalCount: 0,
      tiles: [{ row: 2, col: 2 }],
    }]
    player.stableAnimals = {}

    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    const flow = effect!.onHarvestFeedingPhase!(state, player)
    expect(flow).toBeUndefined()
  })

  it('returns undefined when unfenced stables have animals', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)

    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.resources.grain = 3
    player.stableTiles = [{ row: 2, col: 2 }]
    player.pastures = []
    player.stableAnimals = { '2-2': 'sheep' }

    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    const flow = effect!.onHarvestFeedingPhase!(state, player)
    expect(flow).toBeUndefined()
  })

  it('counts the B85 FarmHand stable as one empty unfenced stable (card-facing count)', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)

    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.resources.grain = 3
    player.stableTiles = []
    player.pastures = []
    player.stableAnimals = {}
    player.cardStates = {
      B085_FarmHand: { extraData: { position: { row: 0, col: 0 } } },
    }

    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    const flow = effect!.onHarvestFeedingPhase!(state, player)
    expect(flow).toBeDefined()
    expect(flow!.type).toBe('seq')
  })

  it('offers xor with multiple options when multiple empty unfenced stables and grain', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)

    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.resources.grain = 5
    player.stableTiles = [{ row: 2, col: 2 }, { row: 2, col: 3 }, { row: 2, col: 4 }]
    player.pastures = []
    player.stableAnimals = {}

    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    const flow = effect!.onHarvestFeedingPhase!(state, player)
    expect(flow).toBeDefined()
    expect(flow!.type).toBe('xor')
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).optional).toBe(true)
    // 3 empty stables, 5 grain → min(3,5) = 3 options
    expect((flow as Extract<ActionFlow, { type: 'seq' }>).children.length).toBe(3)
  })

  it('caps exchanges at grain count when less grain than empty stables', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)

    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.resources.grain = 2
    player.stableTiles = [{ row: 2, col: 2 }, { row: 2, col: 3 }, { row: 2, col: 4 }]
    player.pastures = []
    player.stableAnimals = {}

    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    const flow = effect!.onHarvestFeedingPhase!(state, player)
    expect(flow).toBeDefined()
    expect(flow!.type).toBe('xor')
    // min(3 stables, 2 grain) = 2 options
    expect((flow as Extract<ActionFlow, { type: 'seq' }>).children.length).toBe(2)
  })
})

describe('C049 Beer Stall parity', () => {
  const CARD_ID = 'C049_BeerStall'

  const FILLER = '__test_placeholder__'

  const setupPurchase = () => {
    const session = new GameSession(49, undefined, { playerCount: 2 })
    const state = session.getState().state
    stabilizeRandomHands(state.players)
    state.currentPlayerIndex = 0
    state.round = 4
    state.roundPhase = 'work'
    state.actionSpaces.forEach((space) => { space.takenBy = [] })
    state.players.forEach((player) => {
      setWorkersAtHome(state, player, 2)
      player.minorHand = [FILLER]
      player.occupationHand = [FILLER]
    })
    const player = state.players[0]!
    player.minorHand = [CARD_ID]
    player.resources.wood = 1
    session.loadState(state)
    return session
  }

  const playMinor = (session: GameSession) => {
    let response = session.takeAction(0, 'meeting-place')
    if (response.interaction.stateId !== 'wait') return response
    const improvement = response.interaction.request.options?.find((option) =>
      option.value.startsWith('action-improvement-'))
    if (improvement) response = session.resolveChoice(response.interaction.playerIndex, improvement.value)
    if (response.interaction.stateId !== 'wait') return response
    const card = response.interaction.request.options?.find((option) =>
      option.value === CARD_ID || option.value === 'minor:' + CARD_ID)
    if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
    return response
  }

  const setupHarvest = ({
    grain = 1,
    stables = 1,
    occupied = false,
    fenced = false,
  }: {
    grain?: number
    stables?: number
    occupied?: boolean
    fenced?: boolean
  } = {}) => {
    const session = new GameSession(4900, undefined, { playerCount: 2 })
    const state = session.getState().state
    stabilizeRandomHands(state.players)
    state.round = 4
    state.roundPhase = 'work'
    state.players.forEach((player) => {
      markAllWorkersUsed(state, player)
      player.minorHand = [FILLER]
      player.occupationHand = [FILLER]
      player.fields = []
      player.pastures = []
      player.stableTiles = []
      player.stableAnimals = {}
      player.resources = {
        ...player.resources,
        wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0, vegetable: 0,
        sheep: 0, boar: 0, cattle: 0,
      }
    })

    const player = state.players[0]!
    player.minorPlayed = [CARD_ID]
    player.resources.grain = grain
    player.stableTiles = Array.from({ length: stables }, (_, index) => ({
      row: 0,
      col: index + 2,
    }))
    if (occupied && stables > 0) {
      player.stableAnimals = { '0-2': 'sheep' }
      player.resources.sheep = 1
    }
    if (fenced && stables > 0) {
      player.pastures = [{
        id: 'beer-stall-pasture',
        size: 1,
        tiles: [{ row: 0, col: 2 }],
        stables: 1,
        animalType: null,
        animalCount: 0,
      }]
    }
    session.loadState(state)
    return session
  }

  const resolveBeerStall = (
    session: GameSession,
    exchangeCount: number | null,
  ): SessionResponse => {
    let response = session.performRoundEnd()
    for (let guard = 0; guard < 30 && response.interaction.stateId === 'wait'; guard += 1) {
      const interaction = response.interaction
      if (interaction.request.kind === 'feed') {
        response = session.resolveChoice(interaction.playerIndex, 'confirm', { selections: [] })
        continue
      }
      const options = interaction.request.options ?? []
      if (interaction.request.kind === 'select-trigger') {
        const trigger = options.find((option) =>
          option.value === CARD_ID || option.sourceCard === CARD_ID)
        const fallback = options.find((option) => option.value === '__done__') ?? options[0]
        if (!trigger && !fallback) break
        response = session.resolveChoice(interaction.playerIndex, (trigger ?? fallback)!.value)
        continue
      }
      if (interaction.sourceCard === CARD_ID
        || options.some((option) => option.sourceCard === CARD_ID)) {
        const chosen = exchangeCount === null
          ? options.find((option) => option.value === '__skip__')
          : options.find((option) =>
            option.value !== '__skip__'
            && option.effectPreview?.resourcesPaid?.grain === exchangeCount)
            ?? (exchangeCount === 1
              ? options.find((option) => option.value !== '__skip__')
              : undefined)
        expect(chosen, JSON.stringify(interaction)).toBeDefined()
        response = session.resolveChoice(interaction.playerIndex, chosen!.value)
        continue
      }
      const next = options.find((option) => option.value === '__done__')
        ?? options.find((option) => option.value === '__skip__')
        ?? options[0]
      if (!next) break
      response = session.resolveChoice(interaction.playerIndex, next.value)
    }
    return response
  }

  it('C049 S1: paying one wood plays Beer Stall', () => {
    const response = playMinor(setupPurchase())

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.wood).toBe(0)
  })

  it('C049 S2: one empty unfenced stable allows one grain to become five food during feeding', () => {
    const response = resolveBeerStall(setupHarvest(), 1)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 0, food: 21 })
  })

  it('C049 S3: three empty unfenced stables allow three grain to become fifteen food', () => {
    const response = resolveBeerStall(setupHarvest({ grain: 3, stables: 3 }), 3)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 0, food: 31 })
  })

  it('C049 S4: the feeding exchange may be declined', () => {
    const response = resolveBeerStall(setupHarvest(), null)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 1, food: 16 })
  })

  it('C049 S5: without grain Beer Stall performs no feeding exchange', () => {
    const response = resolveBeerStall(setupHarvest({ grain: 0 }), 1)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 0, food: 16 })
  })

  it('C049 S6: an occupied stable enables no exchange', () => {
    const response = resolveBeerStall(setupHarvest({ occupied: true }), 1)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 1, food: 16, sheep: 1 })
  })

  it('C049 S7: a fenced stable enables no exchange', () => {
    const response = resolveBeerStall(setupHarvest({ fenced: true }), 1)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 1, food: 16 })
  })
})
