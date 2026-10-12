import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'
import { setWorkersAtHome } from '../../shared/domain/player'
import { computeAnimalZones } from '../../shared/domain/animal-zones'
import { serializeState } from '../../shared/session/serialization'

import '../../shared/cards/A/A001_Shelter'
import '../../shared/cards/A/A012_DrinkingTrough'
import '../../shared/cards/D/D011_LawnFertilizer'
import '../../shared/cards/E/E076_LumberPile'

const SHELTER = 'A001_Shelter'
const LUMBER_PILE = 'E076_LumberPile'
const TILE = { row: 0, col: 4 }
const PASTURE_ID = 'occupied-pasture'

/**
 * Common mechanism repair, not a Shelter-only rule change. Session coverage
 * exercises optional construction, passing, payment, undo and state recovery.
 * Fresh seeded two-player work games fix both hands before loading. Player 0
 * has a wooden two-room house, two workers at home, no fields/terrain or card
 * state, and one real one-space fenced pasture holding two sheep. No action
 * space is occupied. Unless overridden, all other resources are zero and
 * there are no played cards. Queries must preserve pasture identity/animals.
 * No eligible pasture or remaining stable supply must not build a stable;
 * illegal locations and multiple stables must not mutate the farm.
 */
const setup = ({ card = SHELTER, wood = 0, stable = false, played = [], pastureSize = 1, twoPastures = false }: {
  card?: string
  wood?: number
  stable?: boolean
  played?: string[]
  pastureSize?: 0 | 1 | 2
  twoPastures?: boolean
} = {}) => createWorkSession({
  seed: 42,
  configure(state) {
    state.round = 1
    state.roundPhase = 'work'
    state.currentPlayerIndex = 0
    state.actionSpaces.forEach(space => { space.takenBy = [] })
    for (const player of state.players) {
      setWorkersAtHome(state, player, 2)
      player.minorPlayed = []
      player.occupationPlayed = []
      player.cardStates = {}
      Object.assign(player.resources, {
        wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
        grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
      })
    }
    const player = state.players[0]!
    player.minorHand = [card]
    player.minorPlayed = played
    player.resources.wood = wood
    player.resources.sheep = pastureSize === 0 ? 0 : 2
    player.stableTiles = stable ? [TILE] : []
    player.fenceSegments = (pastureSize === 0 ? [] : pastureSize === 2
      ? ['H-0-4', 'H-2-4', 'V-0-4', 'V-0-5', 'V-1-4', 'V-1-5']
      : ['H-0-4', 'H-1-4', 'V-0-4', 'V-0-5'])
      .map(edge => ({ edge, type: 'fence' }))
    player.pastures = pastureSize === 0 ? [] : [{
      id: PASTURE_ID, tiles: pastureSize === 2 ? [TILE, { row: 1, col: 4 }] : [TILE],
      animalType: 'sheep', animalCount: 2,
    }]
    if (twoPastures) {
      player.pastures.push({ id: 'empty-pasture', tiles: [{ row: 1, col: 4 }], animalType: null, animalCount: 0 })
      player.fenceSegments.push(...['H-2-4', 'V-1-4', 'V-1-5'].map(edge => ({ edge, type: 'fence' as const })))
    }
  },
})

const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? []
  : []

const playMinor = (session: GameSession, card = SHELTER) => {
  let response = session.takeAction(0, 'meeting-place')
  expect(response.ok, response.error).toBe(true)
  if (response.state.players[0]!.minorHand.includes(card)) {
    const improvement = options(response).find(option => option.value.startsWith('action-improvement-'))
    if (improvement) response = session.resolveChoice(0, improvement.value)
  }
  if (response.state.players[0]!.minorHand.includes(card)) {
    expect(options(response).some(option => option.value === card)).toBe(true)
    response = session.resolveChoice(0, card)
  }
  expect(response.ok, response.error).toBe(true)
  return response
}

const acceptStable = (session: GameSession, tiles = [TILE]) => {
  let response = playMinor(session)
  const accept = options(response).find(option => option.value !== '__skip__' && option.value !== 'skip')
  expect(accept).toBeDefined()
  response = session.resolveChoice(0, accept!.value)
  expect(response.ok, response.error).toBe(true)
  expect(response.interaction).toMatchObject({
    stateId: 'wait', playerIndex: 0,
    request: { kind: 'farm-select', farm: { selectableTiles: tiles, maxSelections: 1 } },
  })
  return response
}

const expectPasture = (session: GameSession, response: SessionResponse, capacity: number, stableScore: number) => {
  const player = session.state.players[0]!
  expect(computeAnimalZones(player, session.state).find(zone => zone.id === PASTURE_ID))
    .toMatchObject({ capacity, animalType: 'sheep', animalCount: 2 })
  expect(response.pastureCapacities?.[player.id]?.[PASTURE_ID]).toBe(capacity)
  expect(response.scores?.find(score => score.playerId === player.id)?.categories.find(category => category.key === 'stables')?.total)
    .toBe(stableScore)
  expect(player.pastures[0]).toMatchObject({ id: PASTURE_ID, tiles: [TILE], animalType: 'sheep', animalCount: 2 })
  expect(player.pastures[0]).not.toHaveProperty('size')
  expect(player.pastures[0]).not.toHaveProperty('stables')
  expect(player.resources.sheep).toBe(2)
}

describe('pasture facts stay derived across authoritative commands', () => {
  it.each([0, 2] as const)('Shelter still passes without construction when eligible pasture size is %i', pastureSize => {
    const session = setup({ pastureSize })
    try {
      const response = playMinor(session)
      expect(response.ok, response.error).toBe(true)
      expect(session.state.players[0]!.stableTiles).toEqual([])
      expect(session.state.players[1]!.minorHand).toContain(SHELTER)
      expect(session.state.events.filter(event => event.type === 'farm.stableBuilt')).toEqual([])
      expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined).not.toBe(SHELTER)
    } finally { session.dispose() }
  })

  it.each(['occupied', 'exhausted'])('Shelter offers no construction when the stable is %s', condition => {
    const session = setup({ stable: condition === 'occupied' })
    try {
      if (condition === 'exhausted') session.state.players[0]!.stableTiles = [1, 2, 3, 4].map(col => ({ row: 2, col }))
      const before = [...session.state.players[0]!.stableTiles]
      const response = playMinor(session)
      expect(response.ok, response.error).toBe(true)
      expect(session.state.players[0]!.stableTiles).toEqual(before)
      expect(session.state.players[1]!.minorHand).toContain(SHELTER)
      expect(session.state.events.filter(event => event.type === 'farm.stableBuilt')).toEqual([])
      expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined).not.toBe(SHELTER)
    } finally { session.dispose() }
  })

  it('rejects outside-pasture and multiple stable submissions without changing players or public history', () => {
    const session = setup({ twoPastures: true })
    try {
      acceptStable(session, [TILE, { row: 1, col: 4 }])
      const players = JSON.stringify(session.state.players)
      const events = JSON.stringify(session.state.events)
      const log = JSON.stringify(session.state.log)
      for (const stables of [[{ row: 0, col: 3 }], [TILE, { row: 1, col: 4 }]]) {
        const response = session.commitSelectionChoice(0, { stables })
        expect(response.ok).toBe(false)
        expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'farm-select' } })
        expect(JSON.stringify(session.state.players)).toBe(players)
        expect(JSON.stringify(session.state.events)).toBe(events)
        expect(JSON.stringify(session.state.log)).toBe(log)
      }
      const response = session.commitSelectionChoice(0, { stables: [TILE] })
      expect(response.ok, response.error).toBe(true)
      expectPasture(session, response, 4, 1)
    } finally { session.dispose() }
  })

  it('Shelter immediately updates capacity and score, including undo, redo and snapshot restoration', () => {
    const session = setup()
    try {
      expectPasture(session, session.getState(), 2, 0)
      acceptStable(session)
      let response = session.commitSelectionChoice(0, { stables: [TILE] })
      expect(response.ok, response.error).toBe(true)
      expectPasture(session, response, 4, 1)
      expect(session.state.players[0]!.resources.wood).toBe(0)
      expect(session.state.players[0]!.stableTiles).toEqual([TILE])
      expect(session.state.players[1]!.minorHand).toContain(SHELTER)
      expect(session.state.events.filter(event => event.type === 'farm.stableBuilt')).toHaveLength(1)
      expect(session.state.events.filter(event => event.type === 'card.passed' && event.cardId === SHELTER)).toHaveLength(1)

      response = session.undoAction()
      expect(response.ok, response.error).toBe(true)
      expectPasture(session, response, 2, 0)
      expect(session.state.players[0]!.minorHand).toContain(SHELTER)
      expect(session.state.players[1]!.minorHand).not.toContain(SHELTER)
      expect(session.state.players[0]!.stableTiles).toEqual([])

      acceptStable(session)
      response = session.commitSelectionChoice(0, { stables: [TILE] })
      expect(response.ok, response.error).toBe(true)
      expectPasture(session, response, 4, 1)
      const before = JSON.stringify(session.state)
      const snapshot = serializeState(session.state, {})
      expect(snapshot.players[0]!.pastures[0]).toMatchObject({ size: 1, stables: 1 })
      expect(JSON.stringify(session.state)).toBe(before)
      const restored = new GameSession(snapshot)
      try { expectPasture(restored, restored.getState(), 4, 1) } finally { restored.dispose() }
    } finally { session.dispose() }
  })

  it('ordinary farm expansion pays two wood and immediately increases the same pasture capacity and score', () => {
    const session = setup({ wood: 2 })
    try {
      let response = session.takeAction(0, 'farm-expansion')
      expect(response.ok, response.error).toBe(true)
      const stable = options(response).find(option => option.labelKey === 'actions.stables.name')
      if (stable) response = session.resolveChoice(0, stable.value)
      expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'farm-select' } })
      response = session.commitSelectionChoice(0, { stables: [TILE] })
      expect(response.ok, response.error).toBe(true)
      expect(session.state.players[0]!.resources.wood).toBe(0)
      expectPasture(session, response, 4, 1)
    } finally { session.dispose() }
  })

  it('capacity replacement and addition use the newly built stable while reads remain pure', () => {
    const session = setup({ played: ['A012_DrinkingTrough', 'D011_LawnFertilizer'] })
    try {
      expectPasture(session, session.getState(), 5, 0)
      acceptStable(session)
      const response = session.commitSelectionChoice(0, { stables: [TILE] })
      expect(response.ok, response.error).toBe(true)
      expectPasture(session, response, 8, 1)
      const before = JSON.stringify(session.state)
      session.getState()
      session.getState()
      serializeState(session.state, {})
      expect(JSON.stringify(session.state)).toBe(before)
    } finally { session.dispose() }
  })

  it('Lumber Pile returns a fenced stable, lowers capacity and score, and preserves two assigned sheep', () => {
    const session = setup({ card: LUMBER_PILE, stable: true })
    try {
      expectPasture(session, session.getState(), 4, 1)
      let response = playMinor(session, LUMBER_PILE)
      const accept = options(response).find(option => option.value.startsWith('flow-'))
        ?? options(response).find(option => option.sourceCard === LUMBER_PILE && option.value !== '__skip__')
      if (accept) response = session.resolveChoice(0, accept.value)
      expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'selection' } })
      response = session.commitSelectionChoice(0, { positions: [TILE] })
      expect(response.ok, response.error).toBe(true)
      expect(session.state.players[0]!.stableTiles).toEqual([])
      expect(session.state.players[0]!.resources.wood).toBe(3)
      expectPasture(session, response, 2, 0)
    } finally { session.dispose() }
  })
})
