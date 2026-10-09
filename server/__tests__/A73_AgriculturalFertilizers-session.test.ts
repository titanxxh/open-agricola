import { setWorkersAtHome } from '../../shared/domain/player'

import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/A/A073_AgriculturalFertilizers'

const CARD_ID = 'A073_AgriculturalFertilizers'

const edgesForTwoTiles = [
  'H-1-1',
  'H-1-2',
  'H-2-1',
  'H-2-2',
  'V-1-1',
  'V-1-3',
]

const edgesForOneTile = [
  'H-1-1',
  'H-2-1',
  'V-1-1',
  'V-1-2',
]

describe('A073_AgriculturalFertilizers session', () => {
  const setupFencing = () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0

    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.resources.wood = 20
    player.resources.grain = 3
    player.resources.vegetable = 1
    // Add empty fields for sow
    player.fields = [
      { row: 0, col: 3, crop: null, remaining: 0 },
      { row: 0, col: 4, crop: null, remaining: 0 },
    ]

    session.loadState(state)
    return session
  }

  it('grants optional sow after fencing 2+ tiles', () => {
    const session = setupFencing()

    let resp = session.takeAction(0, 'fencing')
    expect(resp.ok).toBe(true)

    resp = session.commitSelectionChoice(0, {
      edges: edgesForTwoTiles,
      extraWood: 0,
    })
    expect(resp.ok).toBe(true)
    // After fencing 2 tiles, optional sow should be offered
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.promptKey).toBe('ui.interactionOptionalAction')
    expect(resp.interaction.request.options?.some((o) => o.labelKey === 'actions.sow.name')).toBe(true)
    expect(resp.interaction.request.options?.some((o) => o.labelKey === 'ui.interactionOptionalSkip')).toBe(true)
  })

  it('does NOT grant sow after fencing only 1 tile', () => {
    const session = setupFencing()

    let resp = session.takeAction(0, 'fencing')
    expect(resp.ok).toBe(true)

    resp = session.commitSelectionChoice(0, {
      edges: edgesForOneTile,
      extraWood: 0,
    })
    expect(resp.ok).toBe(true)
    // Only 1 tile fenced, no sow offered
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-next-player')
  })

  it('grants optional sow after building 2 stables via farm-expansion', () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0

    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.resources.wood = 20
    player.resources.grain = 2
    player.resources.vegetable = 1
    player.fields = [
      { row: 0, col: 3, crop: null, remaining: 0 },
    ]

    session.loadState(state)

    let resp = session.takeAction(0, 'farm-expansion')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return

    const stables = resp.interaction.request.options!.find((option) => option.labelKey === 'actions.stables.name')!
    resp = session.resolveChoice(0, stables.value)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.request.farm.farmType).toBe('stable')
    if (resp.interaction.request.farm.farmType !== 'stable') return

    const tiles = resp.interaction.request.farm.selectableTiles
    expect(tiles.length).toBeGreaterThanOrEqual(2)
    const [s1, s2] = tiles

    resp = session.commitSelectionChoice(0, { stables: [s1!, s2!] })
    expect(resp.ok).toBe(true)
    // 2 stables built => 2 new used spaces => optional sow offered
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.promptKey).toBe('ui.interactionOptionalAction')
    expect(resp.interaction.request.options?.some((o) => o.labelKey === 'actions.sow.name')).toBe(true)
  })

  it('cannot play A73 without at least 1 pasture (prerequisite)', () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    // No pastures
    player.pastures = []
    // Deterministic hand: A25 (free, no prerequisite) + A73 (needs pasture).
    // `new GameSession()` deals a random hand from RNG (Math.random seed),
    // so the default hand occasionally contained 7 cards where none were
    // playable — skipping the choice prompt and making this test flaky.
    // Pinning the hand to a known-playable card plus A73 removes the RNG
    // dependency.
    player.minorHand = ['A025_Bassinet', CARD_ID]

    session.loadState(state)

    const resp = session.takeAction(0, 'meeting-place')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return

    // A73 should not be in the playable options (no pasture)
    const a73Option = resp.interaction.request.options?.find(
      (option) => option.value === CARD_ID,
    )
    expect(a73Option).toBeUndefined()
  })
})

describe('A073_AgriculturalFertilizers session', () => {
  const CARD_ID = 'A073_AgriculturalFertilizers'

  const setupFencing = () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0

    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.resources.wood = 20
    player.resources.grain = 3
    player.resources.vegetable = 1

    player.fields = [
      { row: 0, col: 3, crop: null, remaining: 0 },
      { row: 0, col: 4, crop: null, remaining: 0 },
    ]

    session.loadState(state)
    return session
  }

  it('A073 S1: a pasture allows playing Agricultural Fertilizers for free', () => {
    const session = new GameSession(6073, undefined, { playerCount: 2 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = 0
    state.roundPhase = 'work'
    const player = state.players[0]!
    setWorkersAtHome(state, player, 2)
    player.minorHand = [CARD_ID]
    player.occupationHand = ['__test_placeholder__']
    player.pastures = [{
      id: 'prerequisite', size: 1, tiles: [{ row: 2, col: 4 }], stables: 0,
      animalType: null, animalCount: 0,
    }]
    state.players[1]!.minorHand = ['__test_placeholder__']
    state.players[1]!.occupationHand = ['__test_placeholder__']
    session.loadState(state)

    let resp = session.takeAction(0, 'major-improvement')
    if (resp.state.players[0]!.minorHand.includes(CARD_ID)
      && resp.interaction.stateId === 'wait'
      && !resp.interaction.request.options?.some((option) => option.value === CARD_ID)) {
      const enter = resp.interaction.request.options?.find((option) => option.value.startsWith('action-improvement-'))
      if (enter) resp = session.resolveChoice(0, enter.value)
    }
    if (resp.state.players[0]!.minorHand.includes(CARD_ID)) {
      expect(resp.interaction.stateId).toBe('wait')
      if (resp.interaction.stateId !== 'wait') return
      const card = resp.interaction.request.options?.find((option) => option.value === CARD_ID)
      expect(card).toBeDefined()
      resp = session.resolveChoice(0, card!.value)
    }

    expect(resp.ok, resp.error).toBe(true)
    expect(resp.state.players[0]!.minorPlayed).toContain(CARD_ID)
  })

  it('A073 S2: without a pasture Agricultural Fertilizers is not offered', () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!

    player.pastures = []






    player.minorHand = ['A025_Bassinet', CARD_ID]

    session.loadState(state)

    const resp = session.takeAction(0, 'meeting-place')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return

    const a73Option = resp.interaction.request.options?.find(
      (option) => option.value === CARD_ID,
    )
    expect(a73Option).toBeUndefined()
  })
})
