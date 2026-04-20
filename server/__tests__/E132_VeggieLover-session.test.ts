import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getCardEffect } from '../../shared/cards/card-effects'
import type { GameState, PlayerState, Resource } from '../../shared/game/types'
import { computeScores } from '../../shared/logic/scoring'

import '../../shared/cards/E/E132_VeggieLover'

const CARD_ID = 'E132_VeggieLover'

const emptyResources = (): Resource => ({
  wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
  grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
})

const createPlayer = (id = 'p1'): PlayerState => ({
  id, name: id, color: 'red',
  resources: emptyResources(),
  workers: [
    { id: '1', isActive: true, isNewborn: false },
    { id: '2', isActive: true, isNewborn: false },
    { id: '3', isActive: false, isNewborn: false },
    { id: '4', isActive: false, isNewborn: false },
    { id: '5', isActive: false, isNewborn: false },
  ],
  rooms: 2, houseType: 'wood',
  fields: [], fences: 0,
  roomTiles: [{ row: 0, col: 0 }, { row: 0, col: 1 }],
  stableTiles: [],
  improvements: [], minorHand: [], minorPlayed: [],
  occupationHand: [], occupationPlayed: [],houseAnimalType: null, houseAnimalCount: 0, stableAnimals: {},
  pastures: [], fenceSegments: [],
  majorEffects: { wellRounds: 0 }, startPlayer: false,
  cardStates: {},
}) as PlayerState

const createState = (...players: PlayerState[]): GameState => ({
  round: 14, currentPlayerIndex: 0, players,
  actionSpaces: [], log: [], roundStartSnapshot: null,
  roundActionOrder: Array.from({ length: 14 }).map(() => null),
  gameSeed: 1, availableMajorImprovements: [],
  futureMeeples: [], pendingFutureMeeples: [],
  gameOver: true, workPhaseObtainedResources: {},
}) as GameState

describe('E132_VeggieLover session', () => {
  it('offers optional feeding exchange when player has grain and vegetable', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)

    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.resources.grain = 2
    player.resources.vegetable = 1

    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    expect(effect).toBeDefined()
    const flow = effect!.onHarvestFeedingPhase!(state, player)
    expect(flow).toBeDefined()
    expect(flow!.type).toBe('seq')
    expect((flow as any).optional).toBe(true)
  })

  it('returns undefined when player has no grain', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)

    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.resources.grain = 0
    player.resources.vegetable = 2

    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    const flow = effect!.onHarvestFeedingPhase!(state, player)
    expect(flow).toBeUndefined()
  })

  it('returns undefined when player has no vegetable', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)

    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.resources.grain = 3
    player.resources.vegetable = 0

    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    const flow = effect!.onHarvestFeedingPhase!(state, player)
    expect(flow).toBeUndefined()
  })

  it('scoring: 2 grain + 2 vegetable → 4 bonus VP', () => {
    const player = createPlayer()
    player.occupationPlayed = [CARD_ID]
    player.resources.grain = 2
    player.resources.vegetable = 2

    const [result] = computeScores(createState(player))
    const bonusCat = result.categories.find(c => c.key === 'cardStateBonusVp')
    expect(bonusCat).toBeDefined()
    expect(bonusCat!.total).toBe(4)
  })

  it('scoring: 1 grain + 3 vegetable → 2 bonus VP (limited by grain)', () => {
    const player = createPlayer()
    player.occupationPlayed = [CARD_ID]
    player.resources.grain = 1
    player.resources.vegetable = 3

    const [result] = computeScores(createState(player))
    const bonusCat = result.categories.find(c => c.key === 'cardStateBonusVp')
    expect(bonusCat).toBeDefined()
    expect(bonusCat!.total).toBe(2)
  })

  it('scoring: capped at 3 sets (6 VP)', () => {
    const player = createPlayer()
    player.occupationPlayed = [CARD_ID]
    player.resources.grain = 5
    player.resources.vegetable = 5

    const [result] = computeScores(createState(player))
    const bonusCat = result.categories.find(c => c.key === 'cardStateBonusVp')
    expect(bonusCat).toBeDefined()
    expect(bonusCat!.total).toBe(6)
  })

  it('scoring: 0 VP when card not played', () => {
    const player = createPlayer()
    player.resources.grain = 5
    player.resources.vegetable = 5

    const [result] = computeScores(createState(player))
    const bonusCat = result.categories.find(c => c.key === 'cardStateBonusVp')
    expect(bonusCat).toBeUndefined()
  })
})
