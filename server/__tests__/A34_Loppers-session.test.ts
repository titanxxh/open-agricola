import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { executeCardListener, getRegisteredCardListeners, type CardListenerContext } from '../../shared/cards/card-listeners'
import type { GameState, PlayerState } from '../../shared/contract/types'
import { setFencesForTest, setPalisadesForTest } from '../../shared/cards/__tests__/__fixtures__/fence'

import '../../shared/cards/A/A34_Loppers'

const CARD_ID = 'A34_Loppers'

const findListener = (id: string) =>
  getRegisteredCardListeners().find((l) => l.id === id)

const edgesForTile = (row: number, col: number) => [
  `H-${row}-${col}`,
  `H-${row + 1}-${col}`,
  `V-${row}-${col}`,
  `V-${row}-${col + 1}`,
]

const createPlayer = (): PlayerState =>
  ({
    id: 'p1', name: 'P1', color: 'red',
    resources: {
      wood: 5, clay: 0, reed: 0, stone: 0, food: 0,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    },
    familySize: 2, workersAvailable: 2, rooms: 2, houseType: 'wood',
    fields: [], roomTiles: [], stableTiles: [],
    improvements: [], minorHand: [], minorPlayed: [CARD_ID],
    occupationHand: [], occupationPlayed: [],houseAnimalType: null, houseAnimalCount: 0, stableAnimals: {},
    newbornCount: 0, pastures: [], fenceSegments: [],
    majorEffects: { wellRounds: 0 }, startPlayer: false,
    cardStates: {},
  }) as unknown as PlayerState

const createState = (...players: PlayerState[]): GameState =>
  ({
    round: 3, roundPhase: 'work', currentPlayerIndex: 0, players,
    actionSpaces: [], log: [], roundStartSnapshot: null,
    roundActionOrder: Array.from({ length: 14 }).map(() => null),
    gameSeed: 1, availableMajorImprovements: [],
    futureMeeples: [], pendingFutureMeeples: [],
    gameOver: false, workPhaseObtainedResources: {},
  }) as unknown as GameState

describe('A34 Loppers — listener gating by fence count', () => {
  it('fires even when player has many palisades (palisades not capped by maxFences)', () => {
    const player = createPlayer()
    setPalisadesForTest(player, 15) // well above maxFences
    setFencesForTest(player, 0)
    const listener = findListener('A34-loppers-after-fencing')!

    const result = executeCardListener(listener, {
      state: createState(player),
      player,
      actionId: 'fence',
      phase: 'after',
    } as unknown as CardListenerContext)

    expect(result).toBeDefined()
    expect(result?.flow).toBeDefined()
  })

  it('does not fire when fence count is already at maxFences', () => {
    const player = createPlayer()
    setFencesForTest(player, 15)
    const listener = findListener('A34-loppers-after-fencing')!

    const result = executeCardListener(listener, {
      state: createState(player),
      player,
      actionId: 'fence',
      phase: 'after',
    } as unknown as CardListenerContext)

    expect(result).toBeUndefined()
  })

  it('pays fencing before after-fencing effects so exact mandatory wood cannot be spent by A34', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.currentPlayerIndex = 0

    const player = state.players[0]!
    player.resources = {
      ...player.resources,
      wood: 4,
      food: 0,
    }
    player.minorPlayed.push(CARD_ID)
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
    state.players[1]!.minorHand = ['__test_placeholder__']
    state.players[1]!.occupationHand = ['__test_placeholder__']

    session.loadState(state)

    let resp = session.takeAction(0, 'fencing')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')

    resp = session.resolveChoice(0, 'confirm', {
      edges: edgesForTile(1, 1),
      extraWood: 0,
    })
    expect(resp.ok).toBe(true)
    expect(resp.interaction.promptKey).toBe('ui.confirmNextPlayer')
    expect(resp.state.players[0]!.fenceSegments).toHaveLength(4)
    expect(resp.state.players[0]!.resources.wood).toBe(0)
    expect(resp.state.players[0]!.resources.food).toBe(0)
    expect(resp.state.players[0]!.cardStates?.[CARD_ID]?.counters?.bonusVp).toBeUndefined()
    expect(resp.state.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'resource.paid',
          paymentFor: 'fencing',
          resources: { wood: 4 },
        }),
      ]),
    )
  })
})
